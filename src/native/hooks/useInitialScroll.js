// v0.87.29: начальный скролл при открытии чата (Вариант A).
// Если есть firstUnreadId — скроллим на него + жёлтая подсветка 3.5с.
// Если всё прочитано — скроллим в самый низ.
// Защита: однократно на chatId (initialScrollDoneRef).
// v0.87.48: doneRef экспонируется наружу — InboxMode блокирует авто-load-older
// пока initial-scroll не закончился (иначе гонка с browser scroll anchoring).
// v0.87.66: onDone callback — InboxMode держит overlay-shimmer пока initial-scroll
// не завершился. Пользователь не видит прыжок scroll с 0 к firstUnread.
// v0.87.68: doneRef хранит Set виденных chatId (не последний!). Баг v0.87.67:
// при возврате к чату A (после B) initial-scroll запускался ЗАНОВО — видимое моргание.
// Теперь: если chatId уже в Set — не перезапускаем (сохраняем текущий scroll).
// v0.87.70: добавлен getSavedScrollTop — при возврате к виденному чату ВОССТАНАВЛИВАЕМ
// позицию (как Telegram Desktop). Без этого scrollTop оставался от предыдущего чата
// (один div на всё приложение → позиция не наследуется корректно).
// v0.89.0: добавлен onMissingTarget — fallback для виртуализации. При виртуальном
// рендере (react-window) firstUnread может быть ВНЕ видимого DOM, querySelector
// промахнётся. Тогда вызываем onMissingTarget(firstUnread), который скроллит
// через listRef.scrollToRow по индексу в renderItems (вне querySelector).
// v0.91.2: ВЕТКА «already-seen» больше НЕ скроллит к firstUnread.
// Корень бага: useEffect зависит от messagesCount → ре-запускается при каждом push/load-older.
// Когда юзер активно читает в чате, mark-read скидывает unread в 0, потом server-side
// store-unread-sync возвращает unread с обновлёнными новыми → firstUnreadIdRef.current
// пересчитан → ветка вызывала onMissingTarget(firstUnread) → react-window.scrollToRow
// бесцеремонно перебивает активный wheel-скролл юзера (нет защиты от user activity).
// Так делают все мессенджеры: Telegram Desktop, WhatsApp Web, Discord, iOS Telegram —
// программный scroll НЕ перебивает чтение. Restore = только savedScrollTop.
// Auto-jump к firstUnread остаётся только при ПЕРВОМ открытии чата (ветка 1).
import { useEffect, useRef } from 'react'
import { getScrollMetrics, logNativeScroll } from '../utils/scrollDiagnostics.js'

export function useInitialScroll({
  activeChatId, messagesCount, scrollRef, firstUnreadIdRef, activeUnread, loading,
  onDone,
  getSavedScrollTop,  // v0.87.70: (chatId) => number | null — сохранённая позиция
  onMissingTarget,    // v0.89.0: (firstUnreadId) => void — fallback для виртуализации
}) {
  // v0.87.68: Set — все чаты где initial-scroll УЖЕ был выполнен.
  // Раньше (до v0.87.67) — единственный chatId (последний). Не работало для A↔B↔A.
  const doneSetRef = useRef(new Set())
  // Обратно-совместимая обёртка: .current возвращает последний chatId что был в Set
  // (не строго корректно, но внешний guard в InboxMode использует !== activeChatId проверку,
  // ему достаточно знать что "для этого чата initial-scroll был"). Теперь обёртка через getter.
  const doneRef = useRef(null)

  useEffect(() => {
    if (!activeChatId) return
    // v0.87.68: если уже видели этот чат — не перезапускаем initial-scroll.
    // v0.87.70: восстанавливаем сохранённую позицию (как Telegram Desktop).
    if (doneSetRef.current.has(activeChatId)) {
      doneRef.current = activeChatId
      // v0.91.2: Restore = ТОЛЬКО savedScrollTop. firstUnread-ветка удалена (см. коммент в шапке).
      // Без этого useEffect зависит от messagesCount → каждый push/load-older перезапускает
      // эффект → если firstUnreadIdRef.current оказался ненулевым (после mark-read + push)
      // → программа прыгала на firstUnread посреди активного скролла юзера.
      if (scrollRef.current) {
        const savedTop = getSavedScrollTop?.(activeChatId)
        if (typeof savedTop === 'number') {
          scrollRef.current.scrollTop = savedTop
          logNativeScroll('initial-restore-saved', { chatId: activeChatId, savedTop })
        }
      }
      try { onDone?.(activeChatId) } catch(_) {}
      return
    }
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
        } else if (onMissingTarget) {
          // v0.89.0: виртуализация — firstUnread не в видимом DOM, fallback на scrollToRow.
          // Подсветка применяется позже (после того как row смонтируется при виртуальном скролле).
          onMissingTarget(firstUnread)
          logNativeScroll('initial-target-virtual', { chatId: activeChatId, firstUnread, ...getScrollMetrics(scrollEl) })
        } else {
          logNativeScroll('initial-target-missing', { chatId: activeChatId, firstUnread, ...getScrollMetrics(scrollEl) })
          scrollEl.scrollTop = scrollEl.scrollHeight
        }
      } else {
        scrollEl.scrollTop = scrollEl.scrollHeight
      }
      logNativeScroll('initial-done', { chatId: activeChatId, firstUnread, activeUnread, ...getScrollMetrics(scrollEl) })
      // v0.87.68: добавляем в Set виденных. Теперь A↔B↔A не запускает scroll повторно.
      doneSetRef.current.add(activeChatId)
      doneRef.current = activeChatId
      // v0.87.66: уведомляем владельца — scroll уже на правильной позиции.
      try { onDone?.(activeChatId) } catch(_) {}
    }, 150)

    return () => clearTimeout(timer)
  }, [activeChatId, messagesCount, loading])

  return { doneRef, doneSetRef }
}
