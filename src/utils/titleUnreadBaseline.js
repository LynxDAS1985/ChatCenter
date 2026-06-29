export function isMaxUrl(url) {
  return /web\.max\.ru/.test(String(url || ''))
}

export function shouldUseTitleUnreadAsBaseline({ state, messengerId, messengerUrl, count }) {
  if (!state || !messengerId || !isMaxUrl(messengerUrl)) return false
  if (state[messengerId]) return false
  state[messengerId] = { count: Number(count) || 0, ts: Date.now() }
  return true
}
