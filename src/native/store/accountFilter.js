// v1.2.163: обёртка над localStorage для СКРЫТЫХ аккаунтов (множественный выбор в списке).
// Чистая логика — в shared/accountFilter.js. soloAccountId НЕ сохраняется (временный).
export {
  isAccountVisible, toggleAccountHidden, visibleAccountCount, isAllVisible,
  sanitizeHiddenAccounts, effectiveVisibleAccountIds,
} from '../../../shared/accountFilter.js'

const KEY = 'cc-native-hidden-accounts'

// Загрузить список id скрытых аккаунтов. Битые данные → []. Только строки.
export function loadHiddenAccounts() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x) : []
  } catch (_) { return [] }
}

export function saveHiddenAccounts(ids) {
  try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(ids) ? ids : [])) } catch (_) {}
}
