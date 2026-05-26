// v0.91.8 (Совет 1): кэш позиций скролла per-chat между сессиями.
// v0.91.15: формат изменён с number (scrollTop в пикселях) на { anchorMsgId, atBottom }.
// v0.93.0: формат расширен на { anchorMsgId, atBottom, offsetFromTop } — pixel offset
// от top of anchor row до scrollTop. Это позволяет pixel-perfect восстановление
// внутри длинных постов через Virtuoso `initialTopMostItemIndex={index, align:'start', offset}`.
// Backward compat: старые saves без offsetFromTop → offset=0 при load.
//
// Почему: пиксельный scrollTop fragile — при ремаунте react-window высоты
// сбрасываются на defaultRowHeight, scrollHeight временно мал, MDN spec
// обрезает scrollTop до scrollHeight-clientHeight (clamped). Это видно в логе
// chatcenter.log 16:19:24: requestedTop=2235 actualTop=1883 clamped=TRUE.
// При сохранении clamped значения через handleScroll позиция деградировала
// при каждом возврате: 11494 → 2235 → 1883 → 1430...
//
// Решение — anchor msgId (как Telegram Web K setPeerOptions.topMessageFullMid):
//   anchorMsgId — id последнего видимого снизу msg
//   atBottom    — был ли юзер на дне (с допуском 80px)
// При restore react-window сам пересчитает scrollTop через scrollToRow по msgId.
// ID стабилен между ремаунтами — не зависит от scrollHeight.
//
// Backward compat: при загрузке старого формата (number) — игнорируем (вернётся null).
//
// API:
//   loadScrollPositions() → Map<chatId, { anchorMsgId, atBottom }>
//   saveScrollPositions(map)                          (debounced — раз в 1с)
//
// Лимит — 100 chatId; при превышении выкидываем самые старые (LRU).

const STORAGE_KEY = 'chat-scroll-positions'
const STORAGE_VERSION = 3  // v0.93.0: добавлен offsetFromTop (backward compat для v2 saves)
const MAX_ENTRIES = 100
const SAVE_DEBOUNCE_MS = 1000

let saveTimer = null
let pendingMap = null

/**
 * Загружает Map позиций из localStorage. Старый формат (number) игнорируется.
 * Новый формат: { anchorMsgId: string|null, atBottom: boolean }
 */
export function loadScrollPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return new Map()
    // v0.91.15: проверяем версию формата. v0.93.0: принимаем v2 (без offset) и v3 (с offset).
    const data = (obj.__v === STORAGE_VERSION || obj.__v === 2) ? obj.entries : null
    if (!data || typeof data !== 'object') {
      // Старый формат (number scrollTop) — игнорируем, начнём заново
      return new Map()
    }
    const map = new Map()
    for (const [chatId, value] of Object.entries(data)) {
      // Валидация формата
      if (value && typeof value === 'object') {
        const anchorMsgId = typeof value.anchorMsgId === 'string' ? value.anchorMsgId : null
        const atBottom = !!value.atBottom
        // v0.93.0: offsetFromTop опционален (для v2 backward compat = 0)
        const offsetFromTop = Number.isFinite(value.offsetFromTop) ? value.offsetFromTop : 0
        if (anchorMsgId || atBottom) {
          map.set(chatId, { anchorMsgId, atBottom, offsetFromTop })
        }
      }
    }
    return map
  } catch (_) { return new Map() }
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
      // v0.91.15: оборачиваем в версионированный объект
      const obj = { __v: STORAGE_VERSION, entries: Object.fromEntries(trimmed) }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (_) { /* quota / disabled — silent */ }
  }, SAVE_DEBOUNCE_MS)
}

/**
 * v0.91.15: находит anchor msgId — ВЕРХНИЙ visible msg (первый msg чей bottom > scrollTop).
 * v0.93.0: возвращает ОБЪЕКТ {anchorMsgId, offsetFromTop} для pixel-perfect restore.
 *
 * Старая версия (v0.91.15) брала НИЖНИЙ visible msg → при restore align='end' давал
 * нижнюю часть item в viewport bottom. Для длинного поста (item > viewport) Virtuoso
 * clamps scrollTop → юзер видел верхнюю часть item, не середину.
 *
 * Новая логика (v0.93.0):
 *   - anchorMsgId = ВЕРХНИЙ visible msg (первый row чей bottom > scrollTop)
 *   - offsetFromTop = scrollTop - anchorRow.offsetTop
 *     → положительный offset = scrollTop ниже top of anchor row → юзер видит середину/низ row
 *     → 0 = anchor row top совпадает с viewport top
 * При restore: initialTopMostItemIndex={index, align:'start', offset: offsetFromTop}
 * → Virtuoso ставит anchorRow.top в viewport top + сдвигает на offset вниз.
 *
 * @param {HTMLElement} scrollEl — scroll container (Virtuoso outer div)
 * @returns {{anchorMsgId: string, offsetFromTop: number} | null}
 */
export function findVisibleAnchorMsgId(scrollEl) {
  if (!scrollEl) return null
  try {
    const elements = scrollEl.querySelectorAll('[data-msg-id]')
    if (!elements.length) return null
    const scrollTop = scrollEl.scrollTop
    // v0.93.0: ВЕРХНИЙ visible msg — первый row чей нижний край ниже scrollTop.
    // То есть row либо полностью видим, либо частично сверху (его середина/низ в viewport).
    // Это даёт точную позицию для align='start' + offset = scrollTop - rowTop.
    // react-window/Virtuoso рендерят row с position:absolute + top → offsetTop корректен.
    for (const el of elements) {
      const top = el.offsetTop
      const bottom = top + el.offsetHeight
      if (bottom > scrollTop) {
        const msgId = el.getAttribute('data-msg-id')
        if (msgId) {
          return {
            anchorMsgId: msgId,
            offsetFromTop: Math.max(0, Math.round(scrollTop - top)),
          }
        }
      }
    }
    return null
  } catch (_) { return null }
}

// Для тестов
export const _internal = { STORAGE_KEY, STORAGE_VERSION, MAX_ENTRIES, SAVE_DEBOUNCE_MS }
