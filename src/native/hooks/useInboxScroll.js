// v0.87.83: handleScroll логика — сохранение позиции, диагностика, infinite scroll.
// v0.94.0: ВИРТУАЛИЗАЦИЯ УДАЛЕНА. Вернулись к pixel scrollTop save + DOM scrollTop триггеры
// load-older/load-newer (как было до v0.92.0). overflow-anchor:auto в DOM-контейнере
// держит позицию при prepend, поэтому ручная scrollTop коррекция БОЛЬШЕ НЕ НУЖНА.
//
// Возвращает { handleScroll } — onScroll handler для msgs scroll-container.

import { useRef } from 'react'
import useInboxNewerPrefetch from './useInboxNewerPrefetch.js'
import { saveScrollPositions } from '../utils/scrollPositionsCache.js'

export default function useInboxScroll({
  store,
  scrollKey,
  activeMessages,
  activeUnread,
  chatReady,
  msgsScrollRef,
  scrollPosByChatRef,
  initialScrollDoneRef,
  loadingOlderRef,
  loadingNewerRef,
  setLoadingNewer,
  scrollDiag,
  setAtBottom,
  setNewBelow,
  // v0.92.4: guard от closed-loop save при programmatic restore.
  isRestoringRef,
}) {
  const prevNearBottomRef = useRef(null)
  const prevScrollStateRef = useRef({ top: 0, height: 0, t: 0 })
  // v0.88.x: prefetch новых сообщений вниз (load-newer).
  const newerPrefetch = useInboxNewerPrefetch({ store, scrollKey, activeMessages, scrollDiag })

  const handleScroll = async (e) => {
    const el = e.target
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80

    // v0.94.0: сохраняем pixel scrollTop. Без виртуализации scrollHeight стабилен,
    // scrollTop не деградирует при ремаунте. Это самый простой и точный restore.
    const viewKey = scrollKey || store.activeChatId
    if (viewKey && chatReady) {
      // v0.92.4: closed-loop guard — programmatic scroll от restore не должен
      // перезаписывать сохранённую позицию (MDN: scroll event fires for programmatic too).
      const blocked = !!isRestoringRef?.current
      if (!blocked) {
        scrollPosByChatRef.current.set(viewKey, { scrollTop: el.scrollTop, atBottom: nearBottom })
        saveScrollPositions(scrollPosByChatRef.current)
      }
      scrollDiag?.logEvent('scroll-save', {
        viewKey, scrollTop: el.scrollTop, atBottom: nearBottom,
        scrollHeight: el.scrollHeight, isRestoring: blocked,
      })
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

    // v0.94.0: load-newer вниз (Telegram-style). overflow-anchor:auto держит позицию.
    newerPrefetch.maybeTrigger({
      el, viewKey,
      initialScrollDoneKey: initialScrollDoneRef.current,
      loadingNewerRef, setLoadingNewer,
    })

    // v0.94.0: load-older вверх. БЕЗ ручной scrollTop коррекции — overflow-anchor:auto
    // в DOM-контейнере (VirtualMessageList) сам держит видимую позицию при prepend.
    if (loadingOlderRef.current) return
    // v0.92.4: не грузим во время restore (programmatic scroll ставит scrollTop≈saved).
    if (isRestoringRef?.current) return
    // v0.87.48: блокируем авто-load-older пока initial-scroll не закончился
    if (initialScrollDoneRef.current !== viewKey) {
      scrollDiag.logEvent('load-older-skip-initial', { scrollTop: el.scrollTop, chatId: store.activeChatId, viewKey })
      return
    }
    if (el.scrollTop < 100 && activeMessages.length > 0) {
      loadingOlderRef.current = true
      const oldest = activeMessages[0]
      const chatAtStart = store.activeChatId
      scrollDiag.logEvent('load-older-trigger', {
        beforeId: oldest.id, messages: activeMessages.length, unread: activeUnread,
      })
      const result = await store.loadOlderMessages(chatAtStart, oldest.id, 50)
      scrollDiag.logEvent('load-older-result', {
        beforeId: oldest.id, ok: result?.ok, hasMore: result?.hasMore,
      })
      // v0.94.0: НЕТ ручной scrollTop = scrollHeight - prevHeight. overflow-anchor:auto
      // браузера держит позицию автоматически при добавлении контента выше viewport.
      setTimeout(() => { loadingOlderRef.current = false }, 100)
    }
  }

  return { handleScroll }
}
