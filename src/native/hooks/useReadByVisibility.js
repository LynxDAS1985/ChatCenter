// v0.87.83: вынесено из InboxMode.jsx — read-by-visibility batch markRead.
// При попадании msg в видимую область (через IntersectionObserver или onVisible
// callback) добавляем в batch. Каждые 300мс шлём batch на сервер.
//
// Защита от уменьшения watermark: maxEverSentRef хранит максимальный maxId
// который мы когда-либо отправили. Если новый batch не продвигает maxId —
// пропускаем (иначе сервер сбрасывает прочитанность).

import { useEffect, useRef } from 'react'

export default function useReadByVisibility({
  activeChatId,
  activeUnread,
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
    lastReadMaxRef.current = 0
    maxEverSentRef.current = 0  // при смене чата — обнуляем watermark
    if (readTimerRef.current) { clearTimeout(readTimerRef.current); readTimerRef.current = null }
  }, [activeChatId])

  const readByVisibility = (msg) => {
    if (msg.isOutgoing) return
    const id = Number(msg.id)
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
      if (lastReadMaxRef.current <= maxEverSentRef.current) {
        scrollDiag.logEvent('read-batch-skip', {
          reason: 'maxId не продвинулся',
          lastReadMax: lastReadMaxRef.current,
          maxEverSent: maxEverSentRef.current,
        })
        return
      }
      maxEverSentRef.current = lastReadMaxRef.current
      scrollDiag.logEvent('read-batch-send', {
        maxId: lastReadMaxRef.current, count, currentUnread: activeUnread,
      })
      markRead(chatAtStart, lastReadMaxRef.current)
    }, 300)
  }

  return { readByVisibility }
}
