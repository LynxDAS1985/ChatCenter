// v1.1.9: localStorage cache последних сообщений, вынесено из nativeStoreIpc.js
// чтобы хост влез в лимит. Поведение и API не изменены.
//
// Используется для оптимистичного восстановления чата при reopen (раньше TDLib
// доступа). Долгий кэш — в IndexedDB (см. messagesCache.js).

const CACHE_KEY_PREFIX = 'chat-messages:'
const CACHE_MAX_MSG = 50

/**
 * Сохранить хвост последних 50 сообщений чата в localStorage.
 * Тихо игнорирует quota / disabled storage / parse errors.
 */
export function saveChatCache(chatId, messages) {
  try {
    if (!chatId || !Array.isArray(messages)) return
    const keep = messages.slice(-CACHE_MAX_MSG)
    localStorage.setItem(CACHE_KEY_PREFIX + chatId, JSON.stringify(keep))
  } catch(_) { /* quota / disabled / etc — silent */ }
}

/**
 * Прочитать кэш чата. Возвращает массив или null если кэша нет / битый.
 */
export function loadChatCache(chatId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + chatId)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : null
  } catch(_) { return null }
}
