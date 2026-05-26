// v0.87.83: вынесено из InboxMode.jsx — handleScroll логика.
// Делает: сохранение позиции скролла per-chat, диагностика прыжков,
// инфинит-скролл вверх (load-older), детект newBelow.
// v0.88.0..v0.88.2: prefetch вниз вынесен в useInboxNewerPrefetch.js (лимит 150 строк).
//
// Возвращает { handleScroll } — onScroll handler для msgs scroll-container.

import { useRef } from 'react'
import { saveScrollPositions, findVisibleAnchorMsgId } from '../utils/scrollPositionsCache.js'

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
  // v0.92.6: virtualListRef + scrollStateByChatRef + throttled getState save УДАЛЕНЫ —
  // restoreStateFrom архитектурно не работает с key={cacheKey} ремаунтом.
}) {
  const prevNearBottomRef = useRef(null)
  const prevScrollStateRef = useRef({ top: 0, height: 0, t: 0 })
  // v0.92.5: useInboxNewerPrefetch УДАЛЁН из handleScroll — load-newer теперь
  // делает Virtuoso endReached callback (handleEndReached в InboxMode).
  // Старый паттерн scrollTop-based prefetch создавал ДУБЛЬ с Virtuoso → двойные вызовы.

  const handleScroll = async (e) => {
    const el = e.target
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80

    // v0.87.70: сохраняем позицию для активного чата.
    // v0.91.8 (Совет 1): и в localStorage (debounced 1с) — позиция переживает перезапуск.
    // v0.91.15: формат изменён с пиксельного scrollTop на anchor msgId. scrollTop
    // деградировал при clamped restore (react-window cacheKey reset → scrollHeight мал
    // → MDN scrollTop spec обрезает значение → handleScroll сохраняет clamped → позиция
    // портится при каждом возврате). msgId стабилен между ремаунтами.
    const viewKey = scrollKey || store.activeChatId
    if (viewKey && chatReady) {
      // v0.93.0: findVisibleAnchorMsgId теперь возвращает объект {anchorMsgId, offsetFromTop}
      // — pixel offset для pixel-perfect restore через Virtuoso initialTopMostItemIndex offset.
      const anchorInfo = findVisibleAnchorMsgId(el)
      const anchorMsgId = anchorInfo?.anchorMsgId || null
      const offsetFromTop = anchorInfo?.offsetFromTop || 0
      // Сохраняем только если есть хоть что-то полезное (anchor или atBottom).
      if (anchorMsgId || nearBottom) {
        // v0.92.4: closed-loop guard — Virtuoso DOM scroll события не должны портить save.
        const blocked = !!isRestoringRef?.current
        if (!blocked) {
          scrollPosByChatRef.current.set(viewKey, { anchorMsgId, atBottom: nearBottom, offsetFromTop })
          saveScrollPositions(scrollPosByChatRef.current)
        }
        scrollDiag?.logEvent('scroll-save', {
          viewKey, anchorMsgId, atBottom: nearBottom, offsetFromTop,
          scrollTop: el.scrollTop, scrollHeight: el.scrollHeight,
          isRestoring: blocked,
        })
      }
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

    // v0.92.5: ВСЕ infinite scroll триггеры УДАЛЕНЫ из handleScroll.
    //
    // СТАРОЕ (react-window паттерн до v0.92.0):
    //   - newerPrefetch.maybeTrigger(...) для load-newer
    //   - if (scrollTop < 100) → loadOlderMessages + ручная scrollTop коррекция
    //
    // ПРОБЛЕМА: эти триггеры дублировали Virtuoso startReached/endReached callbacks
    // (handleStartReached/handleEndReached в InboxMode v0.92.0+). Каждое достижение
    // верха/низа → ДВА вызова load-older/load-newer → race условия + ручная
    // scrollTop коррекция перекрывала Virtuoso firstItemIndex auto-positioning.
    //
    // ТЕПЕРЬ (v0.92.5): handleScroll занимается ТОЛЬКО save (anchor + snapshot)
    // и диагностикой (atBottom, scroll-anomaly). Все infinite scroll триггеры —
    // через Virtuoso callbacks (startReached/endReached в InboxMode).
  }

  return { handleScroll }
}
