// v0.87.29: начальный скролл при открытии чата (Вариант A).
// Если есть firstUnreadId — скроллим на него + жёлтая подсветка 3.5с.
// Если всё прочитано — скроллим в самый низ.
// Защита: однократно на chatId (initialScrollDoneRef).
import { useEffect, useRef } from 'react'

export function useInitialScroll({ activeChatId, messagesCount, scrollRef, firstUnreadIdRef }) {
  const doneRef = useRef(null)

  useEffect(() => {
    if (!activeChatId) { doneRef.current = null; return }
    if (doneRef.current === activeChatId) return
    if (messagesCount === 0) return

    const timer = setTimeout(() => {
      const scrollEl = scrollRef.current
      if (!scrollEl) return
      const firstUnread = firstUnreadIdRef.current
      if (firstUnread) {
        const el = scrollEl.querySelector(`[data-msg-id="${firstUnread}"]`)
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: 'auto' })
          el.classList.add('native-msg-last-read-highlight')
          setTimeout(() => el.classList.remove('native-msg-last-read-highlight'), 3500)
        } else {
          scrollEl.scrollTop = scrollEl.scrollHeight
        }
      } else {
        scrollEl.scrollTop = scrollEl.scrollHeight
      }
      doneRef.current = activeChatId
    }, 150)

    return () => clearTimeout(timer)
  }, [activeChatId, messagesCount])
}
