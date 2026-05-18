// v0.88.x: prefetch новых сообщений вниз (Telegram-style infinite scroll down).
// Вынесено из useInboxScroll.js в отдельный hook, чтобы оба остались в лимите 150 строк
// (правило fileSizeLimits для src/native/hooks/). Содержит:
//  - константу порога prefetch (1500px = ~20 сообщений);
//  - useEffect-страховку для real-time push (сброс «конец чата» при росте массива);
//  - функцию maybeTrigger(...) для проверки и запуска prefetch внутри handleScroll.
//
// Связь с MTProto:
//  - core.telegram.org/api/offsets — getHistory hard cap = 100 сообщений за запрос;
//  - core.telegram.org/api/updates — push доставляет новые сообщения через persistent
//    соединение; этот hook лишь страхует прохождение push'ей через сброс stale-флага.

import { useRef, useEffect } from 'react'

// Prefetch когда осталось ~1500px до низа (≈20 сообщений типичной высоты ~70-80px).
// Совпадает с react-virtualized default threshold=15 строк.
export const NEWER_PREFETCH_THRESHOLD_PX = 1500

export default function useInboxNewerPrefetch({
  store,
  scrollKey,
  activeMessages,
  scrollDiag,
}) {
  // Ключи (chatId или chatId:topic:id) для которых Telegram уже вернул «конец чата»
  // (hasMore=false ИЛИ пустой массив). Не пинаем prefetch повторно пока пользователь
  // не сменит чат/тему. Это убирает бесконечный цикл «индикатор висит, дёргается окно»
  // у конца прочитанного чата (фикс v0.88.1).
  const noMoreNewerRef = useRef(new Map())
  // Real-time push страховка (v0.88.2): если activeMessages.length вырос для текущего
  // viewKey — значит пришёл tg:new-message ИЛИ load-newer вернул новое. В обоих случаях
  // соединение живо → снимаем «конец чата», следующий scroll может попробовать prefetch.
  const prevMessagesLenRef = useRef(0)
  const prevScrollKeyRef = useRef(null)

  useEffect(() => {
    const len = Array.isArray(activeMessages) ? activeMessages.length : 0
    const key = scrollKey || store.activeChatId
    if (prevScrollKeyRef.current !== key) {
      // Смена viewKey: запоминаем новый baseline, флаги для нового ключа пустые.
      prevScrollKeyRef.current = key
      prevMessagesLenRef.current = len
      return
    }
    if (len > prevMessagesLenRef.current && key) {
      if (noMoreNewerRef.current.has(key)) {
        noMoreNewerRef.current.delete(key)
        scrollDiag?.logEvent('load-newer-flag-reset', {
          viewKey: key, prevLen: prevMessagesLenRef.current, currLen: len,
        })
      }
    }
    prevMessagesLenRef.current = len
  }, [activeMessages, scrollKey, store.activeChatId, scrollDiag])

  // Вызывается из handleScroll. Возвращает true если prefetch запустили.
  const maybeTrigger = ({
    el,
    viewKey,
    initialScrollDoneKey,
    loadingNewerRef,
    setLoadingNewer,
  }) => {
    const fromBottomPx = el.scrollHeight - el.scrollTop - el.clientHeight
    if (!loadingNewerRef || loadingNewerRef.current || noMoreNewerRef.current.get(viewKey)
        || initialScrollDoneKey !== viewKey || activeMessages.length === 0
        || fromBottomPx >= NEWER_PREFETCH_THRESHOLD_PX || fromBottomPx < 0) return false

    // Берём последнее ВХОДЯЩЕЕ сообщение как afterId. Исходящие (наши отправленные)
    // не годятся для min_id Telegram-style: новые входящие приходят через push tg:new-message,
    // поэтому ориентируемся на серверные id входящих.
    let newest = null
    for (let i = activeMessages.length - 1; i >= 0; i--) {
      if (!activeMessages[i]?.isOutgoing) { newest = activeMessages[i]; break }
    }
    if (!newest?.id) return false

    loadingNewerRef.current = true
    setLoadingNewer?.(true)
    const chatAtStart = store.activeChatId
    const viewKeyAtStart = viewKey
    const afterId = newest.id
    scrollDiag?.logEvent('load-newer-trigger', {
      afterId, fromBottomPx, scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight, messages: activeMessages.length,
    })
    store.loadNewerMessages?.(chatAtStart, afterId, 100).then(result => {
      const reachedEnd = !!result?.ok && (
        result?.hasMore === false
        || (Array.isArray(result?.messages) && result.messages.length === 0)
      )
      if (reachedEnd) {
        noMoreNewerRef.current.set(viewKeyAtStart, true)
      }
      scrollDiag?.logEvent('load-newer-result', {
        afterId, ok: result?.ok, throttled: !!result?.throttled,
        hasMore: result?.hasMore, reachedEnd,
        activeChanged: chatAtStart !== store.activeChatId || viewKeyAtStart !== viewKey,
      })
    }).catch(err => {
      scrollDiag?.logEvent('load-newer-error', { afterId, error: String(err?.message || err) })
    }).finally(() => {
      setTimeout(() => {
        loadingNewerRef.current = false
        setLoadingNewer?.(false)
      }, 300)
    })
    return true
  }

  return { maybeTrigger, noMoreNewerRef }
}
