// v0.87.83: вынесено из InboxMode.jsx — handleScroll логика.
// Делает: сохранение позиции скролла per-chat, диагностика прыжков,
// инфинит-скролл вверх (load-older), детект newBelow.
//
// Возвращает { handleScroll } — onScroll handler для msgs scroll-container.

import { useRef } from 'react'

export default function useInboxScroll({
  store,
  activeMessages,
  activeUnread,
  chatReady,
  msgsScrollRef,
  scrollPosByChatRef,
  initialScrollDoneRef,
  loadingOlderRef,
  scrollDiag,
  setAtBottom,
  setNewBelow,
}) {
  const prevNearBottomRef = useRef(null)
  const prevScrollStateRef = useRef({ top: 0, height: 0, t: 0 })

  const handleScroll = async (e) => {
    const el = e.target
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80

    // v0.87.70: сохраняем текущий scrollTop для активного чата.
    if (store.activeChatId && chatReady) {
      scrollPosByChatRef.current.set(store.activeChatId, el.scrollTop)
    }

    // v0.87.49: лог переходов atBottom (для диагностики useForceReadAtBottom)
    if (prevNearBottomRef.current !== null && prevNearBottomRef.current !== nearBottom) {
      scrollDiag.logEvent('bottom-state-change', {
        prev: prevNearBottomRef.current, curr: nearBottom,
        scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
        bottomGap: el.scrollHeight - el.scrollTop - el.clientHeight,
      })
    }
    prevNearBottomRef.current = nearBottom

    // v0.87.49: детектор прыжка scrollTop (>500px за <100мс без user-action)
    const now = Date.now()
    const prev = prevScrollStateRef.current
    const dt = now - prev.t
    const deltaTop = el.scrollTop - prev.top
    const deltaHeight = el.scrollHeight - prev.height
    if (prev.t > 0 && Math.abs(deltaTop) > 500 && dt < 200) {
      scrollDiag.logEvent('scroll-anomaly', {
        dtMs: dt, deltaTop, deltaHeight,
        prevTop: prev.top, currTop: el.scrollTop,
        prevHeight: prev.height, currHeight: el.scrollHeight,
        reasonGuess: deltaHeight !== 0 ? 'height-changed(layout-shift/load-older)' : 'programmatic-scroll',
      })
    }
    prevScrollStateRef.current = { top: el.scrollTop, height: el.scrollHeight, t: now }

    setAtBottom(nearBottom)
    if (nearBottom) setNewBelow(0)
    scrollDiag.observeScroll(nearBottom, loadingOlderRef.current)

    // Infinite scroll up
    if (loadingOlderRef.current) return
    // v0.87.48: блокируем авто-load-older пока initial-scroll не закончился
    if (initialScrollDoneRef.current !== store.activeChatId) {
      scrollDiag.logEvent('load-older-skip-initial', { scrollTop: el.scrollTop, chatId: store.activeChatId })
      return
    }
    if (el.scrollTop < 100 && activeMessages.length > 0) {
      loadingOlderRef.current = true
      const oldest = activeMessages[0]
      const prevHeight = el.scrollHeight
      const chatAtStart = store.activeChatId
      scrollDiag.logEvent('load-older-trigger', {
        beforeId: oldest.id, prevHeight,
        messages: activeMessages.length, unread: activeUnread,
      })
      const result = await store.loadOlderMessages(chatAtStart, oldest.id, 50)
      scrollDiag.logEvent('load-older-result', {
        beforeId: oldest.id, ok: result?.ok, hasMore: result?.hasMore,
      })
      setTimeout(() => {
        if (msgsScrollRef.current) {
          msgsScrollRef.current.scrollTop = msgsScrollRef.current.scrollHeight - prevHeight
          scrollDiag.logEvent('load-older-apply', {
            beforeId: oldest.id, prevHeight, activeChanged: chatAtStart !== store.activeChatId,
          })
        }
        loadingOlderRef.current = false
      }, 100)
    }
  }

  return { handleScroll }
}
