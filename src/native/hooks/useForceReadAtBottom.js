// v0.87.34: Force mark-read когда пользователь прокручен в самый низ чата.
// Защита от случая когда IntersectionObserver не срабатывает на части сообщений
// (маленькие bubble, threshold, быстрый скролл, hidden-by-scroll).
// Вынесено из InboxMode.jsx для соблюдения лимита 600 строк.
import { useEffect } from 'react'

export function useForceReadAtBottom({ atBottom, activeChatId, activeMessages, activeUnread, markRead }) {
  useEffect(() => {
    if (!atBottom || !activeChatId || activeMessages.length === 0 || activeUnread === 0) return
    const lastMsg = activeMessages[activeMessages.length - 1]
    const lastId = Number(lastMsg.id) || 0
    if (!lastId) return
    const t = setTimeout(() => {
      markRead(activeChatId, lastId, activeUnread)
    }, 400)
    return () => clearTimeout(t)
  }, [atBottom, activeChatId, activeMessages.length, activeUnread])
}
