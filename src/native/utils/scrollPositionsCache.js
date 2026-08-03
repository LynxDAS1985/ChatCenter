// v0.91.8: кэш позиций скролла per-chat между сессиями.
// v0.94.0: ПОЛНЫЙ возврат к pixel scrollTop после удаления виртуализации.
//
// История форматов:
//   v0.91.8  — number (scrollTop в пикселях)
//   v0.91.15 — { anchorMsgId, atBottom } (из-за react-window cacheKey reset → clamping)
//   v0.93.0  — { anchorMsgId, atBottom, offsetFromTop } (Virtuoso offset)
//   v0.94.0  — { scrollTop, atBottom } — pixel ОТ ВЕРХА (после удаления виртуализации)
//   v1.2.185 — { fromBottom, atBottom } — pixel ОТ НИЗА (расстояние до конца переписки)
//   v1.2.186 — { anchorMsgId, screenTop, atBottom } — ЯКОРЬ ПО СООБЩЕНИЮ + смещение
//
// Почему ЯКОРЬ ПО СООБЩЕНИЮ (v1.2.186):
//   Ни «от верха» (v0.94.0), ни «от низа» (v1.2.185) не держат точку: список сообщений
//   меняется с ОБЕИХ сторон — сверху догружаются старые (prepended-old), снизу окно то
//   расширяется до 151, то сбрасывается к 50 (высота скачет 23881↔35897↔12268, журнал).
//   Любая мерка «от края» указывает в разное содержимое. Решение: запоминать КАКОЕ
//   сообщение было вверху экрана (anchorMsgId по data-msg-id) и на сколько пикселей его
//   верх был опущен от верха ленты (screenTop; может быть отрицательным, если сообщение
//   частично уехало вверх — тогда восстановим точь-в-точь, даже посреди сообщения).
//   Это ТОЧНОЕ место, НЕ «прыжок к сообщению». Приём уже используется в проекте для
//   re-pin при догрузке старых (useInboxScroll + InboxMode useLayoutEffect, «ScrollSaver»
//   Telegram Web K). atBottom оставлен для чистого «ровно в конец» (там якорь не нужен).
//   Если сообщение-якорь не загружено при открытии → мягкий откат в конец (placeAnchor→false).
//
// API:
//   loadScrollPositions() → Map<chatId, { anchorMsgId:string|null, screenTop:number, atBottom:boolean }>
//   saveScrollPositions(map)                            (debounced — раз в 1с)
//   computeScrollAnchor(el) → { anchorMsgId, screenTop } | null  (верхнее видимое сообщение)
//   placeAnchor(el, anchorMsgId, screenTop) → boolean            (поставить якорь на то же место)
//
// Лимит — 100 chatId; при превышении выкидываем самые старые (LRU).

const STORAGE_KEY = 'chat-scroll-positions'
const STORAGE_VERSION = 6  // v1.2.186: якорь по сообщению + смещение (несовместим с v5 {fromBottom})
const MAX_ENTRIES = 100
const SAVE_DEBOUNCE_MS = 1000

let saveTimer = null
let pendingMap = null

/**
 * Загружает Map позиций из localStorage.
 * Формат v6: { anchorMsgId: string|null, screenTop: number, atBottom: boolean }
 * Старые форматы (пиксельные / anchor без screenTop) — игнорируются (вернётся пустой Map).
 */
export function loadScrollPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return new Map()
    // Принимаем ТОЛЬКО текущую версию. Старые форматы несовместимы.
    const data = obj.__v === STORAGE_VERSION ? obj.entries : null
    if (!data || typeof data !== 'object') return new Map()
    const map = new Map()
    for (const [chatId, value] of Object.entries(data)) {
      if (value && typeof value === 'object') {
        const anchorMsgId = typeof value.anchorMsgId === 'string' ? value.anchorMsgId : null
        const screenTop = Number.isFinite(value.screenTop) ? value.screenTop : 0
        const atBottom = !!value.atBottom
        // Сохраняем только если есть полезное значение (якорь или «в конце»)
        if (anchorMsgId != null || atBottom) {
          map.set(chatId, { anchorMsgId, screenTop, atBottom })
        }
      }
    }
    return map
  } catch (_) { return new Map() }
}

/**
 * v1.2.186: вычисляет ЯКОРЬ прокрутки — верхнее ВИДИМОЕ сообщение и его смещение
 * (в пикселях) от верха ленты. То же, что делает useInboxScroll перед догрузкой старых.
 * @param {HTMLElement} el — scroll-контейнер ленты сообщений.
 * @returns {{anchorMsgId:string, screenTop:number}|null} — null если сообщений нет.
 */
export function computeScrollAnchor(el) {
  if (!el || typeof el.querySelectorAll !== 'function') return null
  try {
    const scrollerTop = el.getBoundingClientRect().top
    const rows = el.querySelectorAll('[data-msg-id]')
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (rect.bottom > scrollerTop) {  // первое сообщение, чей низ ниже верха окна = верхнее видимое
        return { anchorMsgId: row.getAttribute('data-msg-id'), screenTop: rect.top - scrollerTop }
      }
    }
  } catch (_) {}
  return null
}

/**
 * v1.2.186: ставит сообщение-якорь на то же смещение от верха ленты (screenTop).
 * Та же математика, что re-pin после догрузки старых (InboxMode useLayoutEffect).
 * @returns {boolean} true — поставлено; false — сообщение-якорь не найдено в DOM.
 */
export function placeAnchor(el, anchorMsgId, screenTop) {
  if (!el || !anchorMsgId || typeof el.querySelector !== 'function') return false
  const target = el.querySelector(`[data-msg-id="${anchorMsgId}"]`)
  if (!target) return false
  const cur = target.getBoundingClientRect().top - el.getBoundingClientRect().top
  el.scrollTop += cur - (Number.isFinite(screenTop) ? screenTop : 0)
  return true
}

/**
 * Сохраняет Map в localStorage с дебаунсом (1с).
 * При большом списке (>100) выкидываем самые старые записи.
 */
export function saveScrollPositions(map) {
  pendingMap = map
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      const m = pendingMap
      pendingMap = null
      if (!m || m.size === 0) {
        try { localStorage.removeItem(STORAGE_KEY) } catch (_) {}
        return
      }
      // LRU trim — берём последние MAX_ENTRIES (Map.entries сохраняет insertion order).
      const entries = Array.from(m.entries())
      const trimmed = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries
      const obj = { __v: STORAGE_VERSION, entries: Object.fromEntries(trimmed) }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (_) { /* quota / disabled — silent */ }
  }, SAVE_DEBOUNCE_MS)
}

// Для тестов
export const _internal = { STORAGE_KEY, STORAGE_VERSION, MAX_ENTRIES, SAVE_DEBOUNCE_MS }
