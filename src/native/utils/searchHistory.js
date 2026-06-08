// v0.95.42: сохранение строки поиска по чатам + история последних 20 запросов.
//
// 2 пары load/save:
//   - currentSearch — текущий query (восстанавливается при mount sidebar).
//   - searchHistory  — массив до 20 уникальных запросов, новые в начало (FIFO).
//
// Эталоны:
//   - Telegram Web K appSearchManager.ts — `recentPeerSearch` массив до 20
//   - WhatsApp Web — recent searches dropdown
//   - VS Code Cmd+F — query сохраняется в session
//
// Безопасность:
//   - localStorage может быть недоступен (private mode, sandboxed iframe) → try/catch
//   - Query > 200 chars обрезается (защита от мусора)
//   - Дедуп истории (одинаковые запросы не повторяются)
//   - Невалидный JSON в storage → возвращаем default

const CURRENT_KEY = 'cc-chat-search'
const HISTORY_KEY = 'cc-chat-search-history'
export const MAX_HISTORY_SIZE = 20
const MAX_QUERY_LENGTH = 200

function safeGet(key) {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch (_) { return null }
}

function safeSet(key, value) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch (_) { /* quota / disk full / private mode — silent */ }
}

function safeRemove(key) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  } catch (_) {}
}

function normalize(query) {
  if (typeof query !== 'string') return ''
  const t = query.trim()
  if (!t) return ''
  return t.length > MAX_QUERY_LENGTH ? t.slice(0, MAX_QUERY_LENGTH) : t
}

// ─── current search (текущий query) ────────────────────────────────

export function loadCurrentSearch() {
  return normalize(safeGet(CURRENT_KEY) || '')
}

export function saveCurrentSearch(query) {
  const v = normalize(query)
  if (!v) safeRemove(CURRENT_KEY)
  else safeSet(CURRENT_KEY, v)
}

// ─── search history (история) ─────────────────────────────────────

export function loadSearchHistory() {
  const raw = safeGet(HISTORY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Фильтруем мусор: только не-пустые строки до MAX_QUERY_LENGTH
    return parsed
      .filter(x => typeof x === 'string' && x.trim())
      .map(x => x.length > MAX_QUERY_LENGTH ? x.slice(0, MAX_QUERY_LENGTH) : x)
      .slice(0, MAX_HISTORY_SIZE)
  } catch (_) { return [] }
}

export function addToHistory(query) {
  const v = normalize(query)
  if (!v) return loadSearchHistory()
  const current = loadSearchHistory()
  // Дедуп: убираем дубль (включая регистрозависимый), потом ставим в начало
  const filtered = current.filter(x => x.toLowerCase() !== v.toLowerCase())
  const next = [v, ...filtered].slice(0, MAX_HISTORY_SIZE)
  try { safeSet(HISTORY_KEY, JSON.stringify(next)) } catch (_) {}
  return next
}

export function removeFromHistory(query) {
  const v = normalize(query)
  if (!v) return loadSearchHistory()
  const current = loadSearchHistory()
  const next = current.filter(x => x.toLowerCase() !== v.toLowerCase())
  try { safeSet(HISTORY_KEY, JSON.stringify(next)) } catch (_) {}
  return next
}

export function clearHistory() {
  safeRemove(HISTORY_KEY)
}
