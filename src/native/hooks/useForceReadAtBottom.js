// v0.87.34: Force mark-read когда пользователь прокручен в самый низ чата.
// v0.87.37: принимает maxEverSentRef чтобы не уменьшать watermark
import { useEffect } from 'react'

export function useForceReadAtBottom({ atBottom, activeChatId, activeMessages, activeUnread, markRead, maxEverSentRef }) {
  useEffect(() => {
    if (!atBottom || !activeChatId || activeMessages.length === 0 || activeUnread === 0) return
    const lastMsg = activeMessages[activeMessages.length - 1]
    const lastId = Number(lastMsg.id) || 0
    if (!lastId) return
    // v0.87.37: Guard — не отправляем если maxId ≤ того что уже отправляли
    if (maxEverSentRef?.current && lastId <= maxEverSentRef.current) return
    const t = setTimeout(() => {
      if (maxEverSentRef) maxEverSentRef.current = Math.max(maxEverSentRef.current || 0, lastId)
      markRead(activeChatId, lastId, activeUnread)
    }, 400)
    return () => clearTimeout(t)
  }, [atBottom, activeChatId, activeMessages.length, activeUnread])
}
