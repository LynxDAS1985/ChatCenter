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
      // Если useEffect ре-запустился из-за messagesCount/loading (пришли новые
      // сообщения в том же чате) — НЕ дёргаем scrollTop. Юзер активно читает.
      const isReturning = lastActiveChatIdRef.current !== activeChatId
      lastActiveChatIdRef.current = activeChatId
      if (isReturning && scrollRef.current) {
        const savedTop = getSavedScrollTop?.(activeChatId)
        if (typeof savedTop === 'number') {
          scrollRef.current.scrollTop = savedTop
          logNativeScroll('initial-restore-saved', { chatId: activeChatId, savedTop })
        }
      }
      try { onDone?.(activeChatId) } catch(_) {}
      return
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

    // v0.91.6: retry-loop для scrollEl. Корень бага «вечная загрузка темы»:
    // при смене activeChatId UI ставит chatReady=false → DOM scroll-контейнер
    // скрыт за shimmer → scrollRef.current = null. Старый код делал `if (!scrollEl) return`
    // без onDone → chatReady НЕ становился true → DOM никогда не рендерился →
    // scrollEl навсегда null. Deadlock.
    // Решение: до 10 попыток через requestAnimationFrame ждём пока scrollEl появится.
    // Если так и не пришёл — всё равно вызываем onDone (лучше показать чат без
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
      logNativeScroll('initial-run', { chatId: activeChatId, firstUnread, activeUnread, attempts, ...getScrollMetrics(scrollEl) })
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
