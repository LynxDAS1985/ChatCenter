// v0.87.83: read-by-visibility batch markRead.
// The local watermark guard is initialized from Telegram's server read cursor
// so a stale local highwater cannot block valid reads after first chat open.

import { useEffect, useRef } from 'react'

export default function useReadByVisibility({
  activeChatId,
  activeUnread,
  readInboxMaxId = 0,
  markRead,
  scrollDiag,
  maxEverSentRef,
}) {
  const readSeenRef = useRef(new Set())
  const readBatchRef = useRef(new Set())
  const lastReadMaxRef = useRef(0)
  const readTimerRef = useRef(null)
  const activeChatIdRef = useRef(activeChatId)

  useEffect(() => { activeChatIdRef.current = activeChatId }, [activeChatId])

  useEffect(() => {
    readSeenRef.current = new Set()
    readBatchRef.current = new Set()
    const cursor = Number(readInboxMaxId || 0)
    lastReadMaxRef.current = cursor
    if (maxEverSentRef) maxEverSentRef.current = cursor
    scrollDiag.logEvent('read-guard-reset', { chatId: activeChatId, readInboxMaxId: cursor })
    if (readTimerRef.current) { clearTimeout(readTimerRef.current); readTimerRef.current = null }
  }, [activeChatId, readInboxMaxId])

  const readByVisibility = (msg) => {
    if (msg.isOutgoing) return
    const id = Number(msg.id)
    const cursor = Number(readInboxMaxId || 0)
    if (cursor > 0 && id <= cursor) {
      scrollDiag.logEvent('read-skip-before-cursor', { msgId: id, readInboxMaxId: cursor })
      return
    }
    if (readSeenRef.current.has(id)) return
    readSeenRef.current.add(id)
    readBatchRef.current.add(id)
    if (id > lastReadMaxRef.current) lastReadMaxRef.current = id
    scrollDiag.logEvent('read-scrolled-away', {
      msgId: id, batchSize: readBatchRef.current.size, currentUnread: activeUnread,
    })
    if (readTimerRef.current) return
    const chatAtStart = activeChatIdRef.current
    readTimerRef.current = setTimeout(() => {
      readTimerRef.current = null
      if (!chatAtStart || chatAtStart !== activeChatIdRef.current) {
        readBatchRef.current = new Set()
        return
      }
      const count = readBatchRef.current.size
      if (count === 0) return
      readBatchRef.current = new Set()
      const maxEverSent = maxEverSentRef?.current || 0
      if (lastReadMaxRef.current <= maxEverSent) {
        scrollDiag.logEvent('read-batch-skip', {
          reason: 'maxId did not advance',
          lastReadMax: lastReadMaxRef.current,
          maxEverSent,
        })
        return
      }
      if (maxEverSentRef) maxEverSentRef.current = lastReadMaxRef.current
      scrollDiag.logEvent('read-batch-send', {
        maxId: lastReadMaxRef.current, count, currentUnread: activeUnread,
      })
      markRead(chatAtStart, lastReadMaxRef.current, { source: 'visibility', count })
    }, 300)
  }

  return { readByVisibility }
}
