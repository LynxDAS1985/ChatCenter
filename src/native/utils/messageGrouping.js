// v0.87.27: Группировка сообщений по автору + day/time/unread разделители.
// v0.87.29: + склейка последовательных msgs с одинаковым groupedId в альбомы
// (как в Telegram: несколько фото в одном посте → 2x2 / 3x3 сетка).

// Свёртка последовательных сообщений с одним groupedId в один «album»-объект.
// На выходе msgs — массив из смесей: { ...msg } или { type: 'album', msgs: [...], ...atrrsОтPervogo }
function collapseAlbums(msgs) {
  const out = []
  let current = null
  for (const m of msgs) {
    if (!m.groupedId) { current = null; out.push(m); continue }
    if (current && current.groupedId === m.groupedId) {
      current.msgs.push(m)
      continue
    }
    current = {
      type: 'album',
      id: `album-${m.groupedId}`,
      groupedId: m.groupedId,
      msgs: [m],
      // атрибуты наследуем от первого (для reply/edit/forward мы используем именно его id)
      senderId: m.senderId, senderName: m.senderName, isOutgoing: m.isOutgoing,
      timestamp: m.timestamp, isRead: m.isRead, isEdited: m.isEdited,
      replyToId: m.replyToId, text: m.text, entities: m.entities,
    }
    out.push(current)
  }
  return out
}

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
  // Пост-обработка: внутри каждой группы склеиваем альбомы
  for (const it of items) {
    if (it.type === 'group') it.msgs = collapseAlbums(it.msgs)
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
