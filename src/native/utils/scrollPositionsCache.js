// v0.91.8 (Совет 1): кэш позиций скролла per-chat между сессиями.
// v0.91.15: формат изменён с number (scrollTop в пикселях) на { anchorMsgId, atBottom }.
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
const STORAGE_VERSION = 2  // v0.91.15: формат изменён
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
    // v0.91.15: проверяем версию формата
    const data = obj.__v === STORAGE_VERSION ? obj.entries : null
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
        if (anchorMsgId || atBottom) {
          map.set(chatId, { anchorMsgId, atBottom })
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
 * v0.91.15: находит anchor msgId — последний msg видимый снизу viewport.
 * Использует DOM query (react-window рендерит только видимые row + overscan,
 * querySelectorAll быстрый — ~20 элементов).
 *
 * @param {HTMLElement} scrollEl — scroll container (react-window outer div)
 * @returns {string|null} msgId последнего видимого снизу, или null
 */
export function findVisibleAnchorMsgId(scrollEl) {
  if (!scrollEl) return null
  try {
    const elements = scrollEl.querySelectorAll('[data-msg-id]')
    if (!elements.length) return null
    const scrollBottom = scrollEl.scrollTop + scrollEl.clientHeight
    let anchor = null
    // react-window рендерит row с position:absolute + top → el.offsetTop корректен
    for (const el of elements) {
      const top = el.offsetTop
      // Берём последний msg, который полностью выше или на границе scrollBottom
      if (top <= scrollBottom) {
        const msgId = el.getAttribute('data-msg-id')
        if (msgId) anchor = msgId
      }
    }
    return anchor
  } catch (_) { return null }
}

// Для тестов
export const _internal = { STORAGE_KEY, STORAGE_VERSION, MAX_ENTRIES, SAVE_DEBOUNCE_MS }
