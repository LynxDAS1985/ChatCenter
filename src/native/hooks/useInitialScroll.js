// v0.87.29: начальный скролл при открытии чата (Вариант A).
// Если есть firstUnreadId — скроллим на него + жёлтая подсветка 3.5с.
// Если всё прочитано — скроллим в самый низ.
// Защита: однократно на chatId (initialScrollDoneRef).
// v0.87.48: doneRef экспонируется наружу — InboxMode блокирует авто-load-older
// пока initial-scroll не закончился (иначе гонка с browser scroll anchoring).
// v0.87.66: onDone callback — InboxMode держит overlay-shimmer пока initial-scroll
// не завершился. Пользователь не видит прыжок scroll с 0 к firstUnread.
import { useEffect, useRef } from 'react'
import { getScrollMetrics, logNativeScroll } from '../utils/scrollDiagnostics.js'

export function useInitialScroll({ activeChatId, messagesCount, scrollRef, firstUnreadIdRef, activeUnread, loading, onDone }) {
  const doneRef = useRef(null)

  useEffect(() => {
    if (!activeChatId) { doneRef.current = null; return }
    if (doneRef.current === activeChatId) return
    if (messagesCount === 0) {
      logNativeScroll('initial-wait-empty', { chatId: activeChatId, activeUnread })
      return
    }
    // v0.87.40: ждём пока свежие данные с сервера придут (loading=false)
    // Раньше: срабатывал на кэше → скролл на старое сообщение из кэша,
    // потом приходили свежие и реальный unread, но скролл уже в неправильном месте.
    if (loading) {
      logNativeScroll('initial-wait-loading', { chatId: activeChatId, messages: messagesCount, activeUnread })
      return
    }
    logNativeScroll('initial-schedule', { chatId: activeChatId, messages: messagesCount, activeUnread })

    const timer = setTimeout(() => {
      const scrollEl = scrollRef.current
      if (!scrollEl) return
      const firstUnread = firstUnreadIdRef.current
      logNativeScroll('initial-run', { chatId: activeChatId, firstUnread, activeUnread, ...getScrollMetrics(scrollEl) })
      if (firstUnread) {
        const el = scrollEl.querySelector(`[data-msg-id="${firstUnread}"]`)
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: 'auto' })
          logNativeScroll('initial-target', { chatId: activeChatId, firstUnread, ...getScrollMetrics(scrollEl) })
          el.classList.add('native-msg-last-read-highlight')
          setTimeout(() => el.classList.remove('native-msg-last-read-highlight'), 3500)
        } else {
          logNativeScroll('initial-target-missing', { chatId: activeChatId, firstUnread, ...getScrollMetrics(scrollEl) })
          scrollEl.scrollTop = scrollEl.scrollHeight
        }
      } else {
        scrollEl.scrollTop = scrollEl.scrollHeight
      }
      logNativeScroll('initial-done', { chatId: activeChatId, firstUnread, activeUnread, ...getScrollMetrics(scrollEl) })
      doneRef.current = activeChatId
      // v0.87.66: уведомляем владельца — scroll уже на правильной позиции.
      // InboxMode по этому сигналу скрывает shimmer-overlay и показывает контент.
      try { onDone?.(activeChatId) } catch(_) {}
    }, 150)

    return () => clearTimeout(timer)
  }, [activeChatId, messagesCount, loading])

  return { doneRef }
}
