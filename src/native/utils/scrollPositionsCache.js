// v0.91.8 (Совет 1): кэш позиций скролла per-chat между сессиями.
// Сейчас scrollPosByChatRef = Map в памяти, при перезапуске сбрасывается.
// Telegram Desktop хранит это в SQLite, WhatsApp Web — в IndexedDB, Discord — в localStorage.
// Мы используем localStorage (1-2 KB на 50 чатов — небольшой объём).
//
// API:
//   loadScrollPositions() → Map<chatId, scrollTop>   (init из localStorage)
//   saveScrollPositions(map)                          (debounced — раз в 1с)
//
// Лимит — 100 chatId; при превышении выкидываем самые старые (LRU).

const STORAGE_KEY = 'chat-scroll-positions'
const MAX_ENTRIES = 100
const SAVE_DEBOUNCE_MS = 1000

let saveTimer = null
let pendingMap = null

/**
 * Загружает Map позиций из localStorage. При ошибке/отсутствии возвращает пустой Map.
 */
export function loadScrollPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return new Map()
    const map = new Map()
    for (const [chatId, top] of Object.entries(obj)) {
      if (typeof top === 'number' && Number.isFinite(top)) map.set(chatId, top)
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
      const obj = Object.fromEntries(trimmed)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (_) { /* quota / disabled — silent */ }
  }, SAVE_DEBOUNCE_MS)
}

// Для тестов
export const _internal = { STORAGE_KEY, MAX_ENTRIES, SAVE_DEBOUNCE_MS }
