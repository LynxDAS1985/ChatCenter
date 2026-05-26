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
// v0.91.2: ветка «already-seen» НЕ скроллит к firstUnread (перебивало активный
// wheel юзера при mark-read + server unread-sync). Auto-jump только при ПЕРВОМ
// открытии (ветка 1). Так делают TDesktop / WhatsApp / Discord / iOS Telegram.
// v0.91.7: restore savedScrollTop ТОЛЬКО при ДЕЙСТВИТЕЛЬНОЙ смене activeChatId,
// не на каждый messagesCount/loading change. До этого 4 setState на открытие темы
// (IDB cache → server → prefetch newer x2) → каждое запускало restore → юзера
// дёргало в сохранённую позицию. Лог 17:32:13: 3 разных savedTop за 1 секунду
// (13678→10204→7811). lastActiveChatIdRef хранит chatId с прошлого срабатывания.
import { useEffect, useRef } from 'react'
import { getScrollMetrics, logNativeScroll } from '../utils/scrollDiagnostics.js'
import { tryRestoreWithRetry } from './useInitialScrollDiag.js'  // v0.91.14 (логика возврата)

export function useInitialScroll({
  activeChatId, messagesCount, scrollRef, firstUnreadIdRef, activeUnread, loading,
  onDone,
  getSavedScrollTop,  // v0.87.70 / v0.91.15: (chatId) => {anchorMsgId, atBottom} | null
  onMissingTarget,    // v0.89.0: (firstUnreadId) => void — fallback для firstUnread в виртуализации
  onRestoreAnchor,    // v0.91.15: (anchorMsgId) => void — восстановление позиции по msgId
  onScrollToIndex,    // v0.91.16: (index, align) => void — bottom mode через scrollToRow
  onGetLastIndex,     // v0.91.16: () => number — индекс последнего row для bottom mode
  isRestoringRef,     // v0.91.22: внешний ref-флаг блокировки save (см. InboxMode)
}) {
  // v0.87.68: Set — все чаты где initial-scroll УЖЕ был выполнен.
  // Раньше (до v0.87.67) — единственный chatId (последний). Не работало для A↔B↔A.
  const doneSetRef = useRef(new Set())
  // Обратно-совместимая обёртка: .current возвращает последний chatId что был в Set
  // (не строго корректно, но внешний guard в InboxMode использует !== activeChatId проверку,
  // ему достаточно знать что "для этого чата initial-scroll был"). Теперь обёртка через getter.
  const doneRef = useRef(null)
  // v0.91.7: для различения «реальная смена activeChatId» vs «messagesCount изменился
  // в том же чате». Без этого ветка already-seen ре-запускала restore savedScrollTop
  // на каждый push/prefetch, перебивая скролл юзера.
  const lastActiveChatIdRef = useRef(null)

  useEffect(() => {
    if (!activeChatId) return
    // v0.87.68: если уже видели этот чат — не перезапускаем initial-scroll.
    // v0.87.70: восстанавливаем сохранённую позицию (как Telegram Desktop).
    if (doneSetRef.current.has(activeChatId)) {
      doneRef.current = activeChatId
      // v0.91.7: restore выполняется ТОЛЬКО при реальной смене activeChatId.
      const isReturning = lastActiveChatIdRef.current !== activeChatId
      if (!isReturning) {
        logNativeScroll('initial-restore-skip', { chatId: activeChatId, reason: 'not-returning' })
        try { onDone?.(activeChatId) } catch(_) {}
        return
      }
      // v0.91.14: retry-loop симметрично ветке 1 (v0.91.6). См. useInitialScrollDiag.js.
      // v0.91.15: onRestoreAnchor для anchor mode. v0.91.16: onScrollToIndex/onGetLastIndex для bottom mode.
      // v0.91.22: isRestoringRef блокирует save во время programmatic scroll.
      const cancel = tryRestoreWithRetry({
        chatId: activeChatId, scrollRef, getSavedScrollTop, lastActiveChatIdRef,
        onRestoreAnchor, onScrollToIndex, onGetLastIndex, isRestoringRef,
      })
      try { onDone?.(activeChatId) } catch(_) {}
      return cancel
    }
    lastActiveChatIdRef.current = activeChatId
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

        // v0.91.6: retry-loop для scrollEl (chatReady deadlock fix). Если scrollEl
    // не появился за 10 кадров → onDone всё равно (лучше показать чат без
    // initial-scroll чем держать вечный shimmer).
    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 10
    const runInitialScroll = () => {
      if (cancelled) return
      const scrollEl = scrollRef.current
      if (!scrollEl) {
        attempts++
        if (attempts < MAX_ATTEMPTS) {
          requestAnimationFrame(runInitialScroll)
          return
        }
        // Не дождались scrollEl — отдаём контроль наружу, иначе deadlock с chatReady.
        logNativeScroll('initial-no-scrollel', { chatId: activeChatId, attempts })
        doneSetRef.current.add(activeChatId)
        doneRef.current = activeChatId
        try { onDone?.(activeChatId) } catch(_) {}
        return
      }
      const firstUnread = firstUnreadIdRef.current
      // v0.91.8 + v0.91.15: priority anchor msgId если не на дне (saved={anchorMsgId, atBottom}).
      const saved = getSavedScrollTop?.(activeChatId)
      if (saved && saved.anchorMsgId && !saved.atBottom) {
        // v0.91.22: блокируем save во время programmatic scroll (ветка 1 priority restore).
        if (isRestoringRef) {
          isRestoringRef.current = true
          setTimeout(() => { isRestoringRef.current = false }, 500)
        }
        if (onRestoreAnchor?.(saved.anchorMsgId) !== false) {
          logNativeScroll('initial-restore-saved-first-open', { chatId: activeChatId, anchorMsgId: saved.anchorMsgId })
          doneSetRef.current.add(activeChatId)
          doneRef.current = activeChatId
          try { onDone?.(activeChatId) } catch(_) {}
          return
        }
      }
      if (firstUnread) {
        const el = scrollEl.querySelector(`[data-msg-id="${firstUnread}"]`)
        if (el) {
          el.scrollIntoView({ block: 'start', behavior: 'auto' })
          logNativeScroll('initial-target', { chatId: activeChatId, firstUnread, ...getScrollMetrics(scrollEl) })
          el.classList.add('native-msg-last-read-highlight')
          setTimeout(() => el.classList.remove('native-msg-last-read-highlight'), 3500)
        } else if (onMissingTarget) {
          // v0.89.0: виртуализация — firstUnread не в видимом DOM, fallback на scrollToRow.
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
      doneSetRef.current.add(activeChatId)
      doneRef.current = activeChatId
      try { onDone?.(activeChatId) } catch(_) {}
    }
    const timer = setTimeout(runInitialScroll, 150)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [activeChatId, messagesCount, loading])

  return { doneRef, doneSetRef }
}
