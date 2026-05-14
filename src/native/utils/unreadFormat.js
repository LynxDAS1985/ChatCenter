export function formatUnreadCount(value, options = {}) {
  const count = Number(value || 0)
  if (!Number.isFinite(count) || count <= 0) return ''
  const exactUntil = Number(options.exactUntil || 999)
  if (count <= exactUntil) return String(count)
  if (count < 10000) {
    const roundedDown = Math.floor(count / 100) / 10
    return `${Number.isInteger(roundedDown) ? roundedDown.toFixed(0) : roundedDown.toFixed(1)}K`
  }
  if (count < 1000000) return `${Math.floor(count / 1000)}K`
  return `${Math.floor(count / 1000000)}M`
}
