// v0.87.83: handleScroll логика — сохранение позиции, диагностика, infinite scroll.
// v0.94.0: ВИРТУАЛИЗАЦИЯ УДАЛЕНА. Вернулись к pixel scrollTop save + DOM scrollTop триггеры
// load-older/load-newer (как было до v0.92.0). overflow-anchor:auto в DOM-контейнере
// держит позицию при prepend, поэтому ручная scrollTop коррекция БОЛЬШЕ НЕ НУЖНА.
//
// Возвращает { handleScroll } — onScroll handler для msgs scroll-container.

import { useRef } from 'react'
import useInboxNewerPrefetch from './useInboxNewerPrefetch.js'
import { saveScrollPositions } from '../utils/scrollPositionsCache.js'

// v0.95.2: гистерезис «у низа» — два порога, чтобы кнопка ↓ не дрожала.
// prev=true (в atBottom) → выходим только при bottomGap > 120.
// prev=false → входим только при bottomGap < 40.
// prev=null (первый замер) → единый порог 80 (как было раньше).
//
// Этот результат используется ТОЛЬКО для UI визуала кнопки ↓ (стабильность).
// Для логики «auto-scroll к новому» и счётчика ↓N — отдельный physically-at-bottom
// флаг (см. PHYSICAL_BOTTOM_THRESHOLD ниже), без Schmitt-зоны 40-120.
export function computeNearBottom(bottomGap, prevNearBottom) {
  if (prevNearBottom === true) return bottomGap < 120
  if (prevNearBottom === false) return bottomGap < 40
  return bottomGap < 80
}

// v0.95.28: physically at bottom — БЕЗ Schmitt-trigger, по физическому bottomGap.
// Используется для:
//   1. Auto-scroll при новом incoming сообщении (Telegram-style — точно у низа → прокрутка)
//   2. Skip счётчика ↓N (если юзер точно у низа, новое сразу видно — счётчик не нужен)
// Порог 30px — стандарт Telegram Web K / Desktop (юзер «у низа» если в 30px от scrollMax).
// Раньше эти 2 логики шли через Schmitt-trigger 40/120 → в зоне 40-120 atBottom=true
// ложно → счётчик не рос, auto-scroll не делали, юзер видел «дыру».
const PHYSICAL_BOTTOM_THRESHOLD = 30
export function isPhysicallyAtBottom(bottomGap) {
  return Number.isFinite(bottomGap) && bottomGap <= PHYSICAL_BOTTOM_THRESHOLD
}

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
  // v0.95.28: physically at bottom (БЕЗ Schmitt-trigger, для Telegram-style
  // auto-scroll + точного счётчика ↓N без «слепой зоны» 40-120px).
  setPhysicallyAtBottom,
  setNewBelow,
  // v0.92.4: guard от closed-loop save при programmatic restore.
  isRestoringRef,
  // v0.94.2: сюда кладём якорь (верхнее видимое сообщение) перед load-older —
  // InboxMode useLayoutEffect возвращает его на то же место после prepend.
  prependAnchorRef,
}) {
  const prevNearBottomRef = useRef(null)
  const prevScrollStateRef = useRef({ top: 0, height: 0, t: 0 })
  // v0.88.x: prefetch новых сообщений вниз (load-newer).
  const newerPrefetch = useInboxNewerPrefetch({ store, scrollKey, activeMessages, scrollDiag })

  const handleScroll = async (e) => {
    const el = e.target
    const bottomGap = el.scrollHeight - el.scrollTop - el.clientHeight
    // v0.95.2: ГИСТЕРЕЗИС (Schmitt trigger) против дребезга кнопки ↓.
    // Раньше один порог <80 → bottomGap колебался 60-100 → atBottom тоггл true↔false
    // → кнопка ↓ мигала (исчезает/появляется). Теперь: ВОЙТИ в atBottom при <40,
    // ВЫЙТИ при >120; в полосе 40-120 сохраняется предыдущее состояние → нет дребезга.
    const nearBottom = computeNearBottom(bottomGap, prevNearBottomRef.current)

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
    // v0.95.28: физический atBottom — для useNewBelowCounter auto-scroll логики.
    // Schmitt-trigger даёт ложный nearBottom=true в зоне 40-120px → юзер не точно
    // у низа, но новые сообщения «не считаются» в счётчике ↓N → юзер их не видит.
    // Physical порог 30px устраняет эту слепую зону (Telegram-style).
    setPhysicallyAtBottom?.(isPhysicallyAtBottom(bottomGap))
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

      // v0.94.2: ЯКОРЬ перед prepend (DOMRect re-pin, паттерн Telegram Web K ScrollSaver).
      // Берём ВЕРХНЕЕ видимое сообщение и его экранную позицию. После prepend старых
      // сообщений сверху InboxMode useLayoutEffect вернёт его на тот же пиксель.
      // Надёжнее дельты высоты: re-pin конкретного элемента устойчив к любым
      // одновременным изменениям layout и к догрузке медиа.
      try {
        const scrollerTop = el.getBoundingClientRect().top
        const rows = el.querySelectorAll('[data-msg-id]')
        for (const row of rows) {
          const rect = row.getBoundingClientRect()
          if (rect.bottom > scrollerTop) {
            if (prependAnchorRef) {
              prependAnchorRef.current = {
                msgId: row.getAttribute('data-msg-id'),
                screenTop: rect.top - scrollerTop,
              }
            }
            break
          }
        }
      } catch (_) {}

      scrollDiag.logEvent('load-older-trigger', {
        beforeId: oldest.id, messages: activeMessages.length, unread: activeUnread,
      })
      const result = await store.loadOlderMessages(chatAtStart, oldest.id, 50)
      scrollDiag.logEvent('load-older-result', {
        beforeId: oldest.id, ok: result?.ok, hasMore: result?.hasMore,
      })
      // v0.94.2: scrollTop коррекция — в InboxMode useLayoutEffect (после отрисовки,
      // до paint → без мигания). overflow-anchor:none, держим позицию сами.
      setTimeout(() => { loadingOlderRef.current = false }, 100)
    }
  }

  return { handleScroll }
}
