export function isMaxUrl(url) {
  return /web\.max\.ru/.test(String(url || ''))
}

export function shouldUseTitleUnreadAsBaseline({ state, messengerId, messengerUrl, count }) {
  if (!state || !messengerId || !isMaxUrl(messengerUrl)) return false
  if (state[messengerId]) return false
  state[messengerId] = { count: Number(count) || 0, ts: Date.now() }
  return true
}

export function decideMaxTitleUnread({ state, messengerId, messengerUrl, count }) {
  if (!state || !messengerId || !isMaxUrl(messengerUrl)) return { schedule: true, reason: 'non-max', prevCount: null }
  const next = Number(count) || 0
  const prev = state[messengerId]?.count
  state[messengerId] = { count: next, ts: Date.now() }
  if (prev === undefined) return { schedule: false, reason: 'baseline', prevCount: 0 }
  if (next <= prev) return { schedule: false, reason: `not-increased prev=${prev}`, prevCount: prev }
  return { schedule: true, reason: `increased prev=${prev}`, prevCount: prev }
}

export function resetMaxTitleUnread(state, messengerId, messengerUrl) {
  if (!state || !messengerId || !isMaxUrl(messengerUrl)) return false
  state[messengerId] = { count: 0, ts: Date.now() }
  return true
}
