// v0.87.27: Группировка сообщений по автору + day/time/unread разделители.
// Вынесено из InboxMode.jsx для соблюдения лимита 600 строк.

export function groupMessages(visibleMessages, firstUnreadId) {
  const items = []
  let currentGroup = null
  let prevDay = null
  let unreadInserted = false
  for (const m of visibleMessages) {
    const day = new Date(m.timestamp).toDateString()
    if (day !== prevDay) {
      if (prevDay !== null) currentGroup = null
      items.push({ type: 'day', id: `day-${day}`, day })
      prevDay = day
    }
    if (!unreadInserted && firstUnreadId && String(m.id) === String(firstUnreadId)) {
      currentGroup = null
      items.push({ type: 'unread', id: `unread-${m.id}` })
      unreadInserted = true
    }
    if (currentGroup) {
      const lastMsg = currentGroup.msgs[currentGroup.msgs.length - 1]
      const gapMinutes = (m.timestamp - lastMsg.timestamp) / 60000
      const sameAuthor = m.senderId === lastMsg.senderId && m.isOutgoing === lastMsg.isOutgoing
      if (!sameAuthor || gapMinutes > 5) {
        if (gapMinutes > 5 && sameAuthor) {
          items.push({ type: 'time', id: `time-${m.id}`, time: m.timestamp })
        }
        currentGroup = null
      }
    }
    if (!currentGroup) {
      currentGroup = {
        type: 'group', id: `g-${m.id}`, msgs: [],
        senderId: m.senderId, senderName: m.senderName, isOutgoing: m.isOutgoing,
      }
      items.push(currentGroup)
    }
    currentGroup.msgs.push(m)
  }
  return items
}

export function formatDayLabel(dayStr) {
  const d = new Date(dayStr)
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  if (d.toDateString() === today) return 'Сегодня'
  if (d.toDateString() === yesterday) return 'Вчера'
  return d.toLocaleDateString('ru', {
    day: 'numeric', month: 'long',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

// Определение первого непрочитанного id для «Новые сообщения» divider
export function findFirstUnreadId(messages, unreadCount) {
  if (!unreadCount || !messages.length) return null
  const incoming = messages.filter(m => !m.isOutgoing)
  const first = incoming[Math.max(0, incoming.length - unreadCount)]
  return first?.id || null
}
