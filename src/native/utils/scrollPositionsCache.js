// v0.91.8: кэш позиций скролла per-chat между сессиями.
// v0.94.0: ПОЛНЫЙ возврат к pixel scrollTop после удаления виртуализации.
//
// История форматов:
//   v0.91.8  — number (scrollTop в пикселях)
//   v0.91.15 — { anchorMsgId, atBottom } (из-за react-window cacheKey reset → clamping)
//   v0.93.0  — { anchorMsgId, atBottom, offsetFromTop } (Virtuoso offset)
//   v0.94.0  — { scrollTop, atBottom } — ОБРАТНО pixel, т.к. виртуализация удалена
//
// Почему вернулись к pixel scrollTop:
//   Виртуализация (react-window / Virtuoso) убрана в v0.94.0 — теперь все msgs
//   рендерятся обычным DOM (renderItems.map). DOM scrollHeight стабилен между
//   ремаунтами (не зависит от измерений виртуализатора), поэтому pixel scrollTop
//   НЕ деградирует. Это самый простой и надёжный способ — как Telegram Web K.
//
//   anchorMsgId был нужен ТОЛЬКО из-за виртуализации (scrollHeight скакал при
//   reset измерений). Без виртуализации это не нужно.
//
// API:
//   loadScrollPositions() → Map<chatId, { scrollTop:number, atBottom:boolean }>
//   saveScrollPositions(map)                            (debounced — раз в 1с)
//
// Лимит — 100 chatId; при превышении выкидываем самые старые (LRU).

const STORAGE_KEY = 'chat-scroll-positions'
const STORAGE_VERSION = 4  // v0.94.0: pixel scrollTop (несовместим с v2/v3 anchor форматом)
const MAX_ENTRIES = 100
const SAVE_DEBOUNCE_MS = 1000

let saveTimer = null
let pendingMap = null

/**
 * Загружает Map позиций из localStorage.
 * Формат v4: { scrollTop: number, atBottom: boolean }
 * Старые форматы (v2/v3 anchor, или number) — игнорируются (вернётся пустой Map).
 */
export function loadScrollPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return new Map()
    // v0.94.0: принимаем ТОЛЬКО v4. Старые anchor-форматы несовместимы.
    const data = obj.__v === STORAGE_VERSION ? obj.entries : null
    if (!data || typeof data !== 'object') return new Map()
    const map = new Map()
    for (const [chatId, value] of Object.entries(data)) {
      if (value && typeof value === 'object') {
        const scrollTop = Number.isFinite(value.scrollTop) ? value.scrollTop : null
        const atBottom = !!value.atBottom
        // Сохраняем только если есть полезное значение
        if (scrollTop != null || atBottom) {
          map.set(chatId, { scrollTop: scrollTop ?? 0, atBottom })
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
      const obj = { __v: STORAGE_VERSION, entries: Object.fromEntries(trimmed) }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (_) { /* quota / disabled — silent */ }
  }, SAVE_DEBOUNCE_MS)
}

// Для тестов
export const _internal = { STORAGE_KEY, STORAGE_VERSION, MAX_ENTRIES, SAVE_DEBOUNCE_MS }
