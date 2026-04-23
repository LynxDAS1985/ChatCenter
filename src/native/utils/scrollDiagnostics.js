const PREFIX = '[native-scroll]'

function safeValue(value) {
  if (value == null) return value
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : String(value)
  if (typeof value === 'boolean' || typeof value === 'string') return value
  if (Array.isArray(value)) return value.slice(0, 8).map(safeValue)
  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== 'function') out[key] = safeValue(item)
    }
    return out
  }
  return String(value)
}

function formatData(data) {
  const clean = safeValue(data || {})
  return Object.entries(clean)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' ')
}

export function logNativeScroll(event, data = {}) {
  const message = `${PREFIX} ${event}${Object.keys(data).length ? ' ' + formatData(data) : ''}`
  try {
    globalThis.window?.api?.send?.('app:log', { level: 'INFO', message })
  } catch (_) {}
}

export function getScrollMetrics(el) {
  if (!el) return { hasEl: false }
  const top = Number(el.scrollTop || 0)
  const height = Number(el.scrollHeight || 0)
  const client = Number(el.clientHeight || 0)
  return {
    hasEl: true,
    top,
    height,
    client,
    bottomGap: height - top - client,
  }
}

export function getUnreadAnchorDebug(messages, unreadCount) {
  const list = Array.isArray(messages) ? messages : []
  const incoming = list.filter(m => !m.isOutgoing)
  const anchorIndex = unreadCount > 0 ? Math.max(0, incoming.length - unreadCount) : -1
  const anchor = anchorIndex >= 0 ? incoming[anchorIndex] : null
  return {
    messages: list.length,
    unread: unreadCount || 0,
    incoming: incoming.length,
    anchorIndex,
    anchorId: anchor?.id || null,
    firstId: list[0]?.id || null,
    lastId: list[list.length - 1]?.id || null,
    firstIncomingId: incoming[0]?.id || null,
    lastIncomingId: incoming[incoming.length - 1]?.id || null,
  }
}
