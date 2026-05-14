// v0.87.83: вынесено из InboxMode.jsx — handleScroll логика.
// Делает: сохранение позиции скролла per-chat, диагностика прыжков,
// инфинит-скролл вверх (load-older), детект newBelow.
// v0.88.0: + infinite scroll ВНИЗ (load-newer prefetch, Telegram-style).
//
// Возвращает { handleScroll } — onScroll handler для msgs scroll-container.

import { useRef, useEffect } from 'react'

// v0.88.0: prefetch новых сообщений когда осталось ~1500px до низа (≈20 сообщений).
// Совпадает с практикой react-virtualized (threshold=15 строк) и поведением Telegram.
const NEWER_PREFETCH_THRESHOLD_PX = 1500

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
}) {
  const prevNearBottomRef = useRef(null)
  const prevScrollStateRef = useRef({ top: 0, height: 0, t: 0 })
  // v0.88.1: ключи (chatId или chatId:topic:id) для которых Telegram уже вернул «конец чата»
  // (hasMore=false ИЛИ пустой массив). Не вызываем prefetch для них пока пользователь не
  // сменит чат/тему. Это убирает бесконечный цикл «индикатор висит, дёргается окно» когда
  // у конца чата нет непрочитанных и каждый scroll-event пинал prefetch заново.
  const noMoreNewerRef = useRef(new Map())
  // v0.88.2: страховка для real-time push. Если в активный viewKey добавились новые
  // сообщения (через tg:new-message или через load-newer) — снимаем флаг «конец чата»,
  // потому что после прихода новых сообщений последующая попытка prefetch может быть нужна.
  // Связь с MTProto Updates API (core.telegram.org/api/updates): push приходит через
  // постоянное соединение, мы сами добавляем msg в state.messages — array.length растёт.
  // Этот эффект — единственный наблюдатель за изменением длины, не нужен отдельный listener.
  const prevMessagesLenRef = useRef(0)
  const prevScrollKeyRef = useRef(null)
  useEffect(() => {
    const len = Array.isArray(activeMessages) ? activeMessages.length : 0
    const key = scrollKey || store.activeChatId
    // Сброс при смене viewKey (новый чат/тема): просто запомнить новый baseline.
    if (prevScrollKeyRef.current !== key) {
      prevScrollKeyRef.current = key
      prevMessagesLenRef.current = len
      return
    }
    // Рост длины в рамках одного viewKey → пришли новые сообщения (push или load-newer).
    // Снимаем «конец чата»: если push доставил, значит соединение живо и новые могли пойти ещё.
    if (len > prevMessagesLenRef.current && key) {
      if (noMoreNewerRef.current.has(key)) {
        noMoreNewerRef.current.delete(key)
        scrollDiag.logEvent('load-newer-flag-reset', { viewKey: key, prevLen: prevMessagesLenRef.current, currLen: len })
      }
    }
    prevMessagesLenRef.current = len
  }, [activeMessages, scrollKey, store.activeChatId, scrollDiag])

  const handleScroll = async (e) => {
    const el = e.target
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80

    // v0.87.70: сохраняем текущий scrollTop для активного чата.
    const viewKey = scrollKey || store.activeChatId
    if (viewKey && chatReady) {
      scrollPosByChatRef.current.set(viewKey, el.scrollTop)
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

    // v0.88.0: Infinite scroll DOWN (prefetch newer messages, Telegram-style).
    // Срабатывает раньше остальных проверок load-older, потому что:
    //  - не зависит от scrollTop < 100;
    //  - не блокируется loadingOlderRef (направления независимы);
    //  - throttle 300мс встроен в store.loadNewerMessages.
    // v0.88.1: + проверка noMoreNewerRef — если для этого viewKey Telegram уже сказал
    // «больше нет новых», не пинаем prefetch повторно (фикс бесконечного цикла).
    const fromBottomPx = el.scrollHeight - el.scrollTop - el.clientHeight
    if (
      loadingNewerRef
      && !loadingNewerRef.current
      && !noMoreNewerRef.current.get(viewKey)
      && initialScrollDoneRef.current === viewKey
      && activeMessages.length > 0
      && fromBottomPx < NEWER_PREFETCH_THRESHOLD_PX
      && fromBottomPx >= 0  // если minus — это bouncy scroll, не триггерим
    ) {
      // Берём последнее ВХОДЯЩЕЕ сообщение как afterId.
      // Если последнее — наше отправленное, его id не подходит для min_id Telegram-style
      // (новые входящие приходят через push tg:new-message). Ищем последнее incoming.
      let newest = null
      for (let i = activeMessages.length - 1; i >= 0; i--) {
        if (!activeMessages[i]?.isOutgoing) { newest = activeMessages[i]; break }
      }
      if (newest?.id) {
        loadingNewerRef.current = true
        setLoadingNewer?.(true)
        const chatAtStart = store.activeChatId
        const viewKeyAtStart = viewKey
        const afterId = newest.id
        scrollDiag.logEvent('load-newer-trigger', {
          afterId, fromBottomPx, scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight, messages: activeMessages.length,
        })
        store.loadNewerMessages?.(chatAtStart, afterId, 100).then(result => {
          // v0.88.1: если Telegram сказал «больше нет» — фиксируем для этого viewKey,
          // чтобы handleScroll не пинал prefetch повторно. Сбрасывается при смене viewKey
          // через useEffect ниже.
          const reachedEnd = !!result?.ok && (
            result?.hasMore === false
            || (Array.isArray(result?.messages) && result.messages.length === 0)
          )
          if (reachedEnd) {
            noMoreNewerRef.current.set(viewKeyAtStart, true)
          }
          scrollDiag.logEvent('load-newer-result', {
            afterId, ok: result?.ok, throttled: !!result?.throttled,
            hasMore: result?.hasMore, reachedEnd,
            activeChanged: chatAtStart !== store.activeChatId || viewKeyAtStart !== (scrollKey || store.activeChatId),
          })
        }).catch(err => {
          scrollDiag.logEvent('load-newer-error', { afterId, error: String(err?.message || err) })
        }).finally(() => {
          // Снимаем guard через NEWER_PAGE_MIN_INTERVAL_MS чтобы не было новой попытки сразу.
          setTimeout(() => {
            loadingNewerRef.current = false
            setLoadingNewer?.(false)
          }, 300)
        })
      }
    }

    // Infinite scroll up
    if (loadingOlderRef.current) return
    // v0.87.48: блокируем авто-load-older пока initial-scroll не закончился
    if (initialScrollDoneRef.current !== viewKey) {
      scrollDiag.logEvent('load-older-skip-initial', { scrollTop: el.scrollTop, chatId: store.activeChatId, viewKey })
      return
    }
    if (el.scrollTop < 100 && activeMessages.length > 0) {
      loadingOlderRef.current = true
      const oldest = activeMessages[0]
      const prevHeight = el.scrollHeight
      const chatAtStart = store.activeChatId
      const viewKeyAtStart = viewKey
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
            beforeId: oldest.id, prevHeight, activeChanged: chatAtStart !== store.activeChatId || viewKeyAtStart !== (scrollKey || store.activeChatId),
          })
        }
        loadingOlderRef.current = false
      }, 100)
    }
  }

  return { handleScroll }
}
