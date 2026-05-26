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
  // v0.92.0: isRestoringRef удалён — Virtuoso через initialTopMostItemIndex / firstItemIndex
  // не триггерит наш handleScroll (DOM scroll event не появляется), guard не нужен.
  // v0.92.2: virtualListRef + scrollStateByChatRef для pixel-perfect state save через
  // Virtuoso getState. Throttled 200мс через lastStateSaveRef.
  virtualListRef,
  scrollStateByChatRef,
  scrollStateMaxEntries = 50,
  // v0.92.4: guard от closed-loop save при programmatic restore.
  isRestoringRef,
}) {
  const prevNearBottomRef = useRef(null)
  const prevScrollStateRef = useRef({ top: 0, height: 0, t: 0 })
  // v0.92.2: throttle для getState save (вызов каждый scroll event = слишком часто).
  const lastStateSaveRef = useRef(0)
  const STATE_SAVE_THROTTLE_MS = 200
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
      const anchorMsgId = findVisibleAnchorMsgId(el)
      // Сохраняем только если есть хоть что-то полезное (anchor или atBottom).
      // Иначе остаётся прежняя запись (защита от затирания при programmatic scroll
      // когда react-window еще не отрендерил DOM).
      if (anchorMsgId || nearBottom) {
        // v0.92.4: ВОЗВРАЩАЕМ closed-loop guard (был ошибочно удалён в v0.92.0).
        // Virtuoso initialTopMostItemIndex + restoreStateFrom вызывают DOM scroll
        // event на scroller div (MDN: programmatic scrolling also fires scroll).
        // Лог 17:35:16-31 показал дрейф anchor на 1-1024 msgs каждый возврат.
        const blocked = !!isRestoringRef?.current
        if (!blocked) {
          scrollPosByChatRef.current.set(viewKey, { anchorMsgId, atBottom: nearBottom })
          saveScrollPositions(scrollPosByChatRef.current)
        }
        scrollDiag?.logEvent('scroll-save', {
          viewKey, anchorMsgId, atBottom: nearBottom,
          scrollTop: el.scrollTop, scrollHeight: el.scrollHeight,
          isRestoring: blocked,  // v0.92.4 — true когда save пропущен
        })
      }
      // v0.92.2: pixel-perfect state save через Virtuoso getState.
      // v0.92.4: skip во время restore — иначе сохраняем «во время прыжка» промежуточный
      // state, который перетрёт правильный snapshot предыдущего открытия.
      if (!isRestoringRef?.current && virtualListRef?.current?.getState) {
        const now = Date.now()
        if (now - lastStateSaveRef.current >= STATE_SAVE_THROTTLE_MS) {
          lastStateSaveRef.current = now
          try {
            virtualListRef.current.getState((state) => {
              if (!state || !scrollStateByChatRef?.current) return
              scrollStateByChatRef.current.set(viewKey, state)
              // LRU trim — Map.entries сохраняет insertion order
              if (scrollStateByChatRef.current.size > scrollStateMaxEntries) {
                const oldest = scrollStateByChatRef.current.keys().next().value
                if (oldest && oldest !== viewKey) scrollStateByChatRef.current.delete(oldest)
              }
            })
          } catch (_) { /* getState может выбросить если Virtuoso unmount */ }
        }
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
