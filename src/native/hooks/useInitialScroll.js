// v0.87.29: начальный скролл при открытии чата.
// v0.94.0: ПОЛНОСТЬЮ ПЕРЕПИСАН под обычный DOM (виртуализация удалена).
//
// Логика (v1.2.186: позиция = ЯКОРЬ ПО СООБЩЕНИЮ + смещение; подробно — scrollPositionsCache.js):
//   1. Первое открытие: якорь (не на дне) в DOM → placeAnchor; иначе firstUnread; иначе низ.
//   2. Возврат в виденный: atBottom → низ; якорь в DOM → placeAnchor; якорь не найден → откат в низ.
// Почему якорь, а не пиксель от края: список растёт/сжимается с ОБЕИХ сторон (догрузка старых
// сверху, окно 50↔151 снизу) → мерка «от края» уезжает; якорь держит точку точь-в-точь.
//
// retry-loop через requestAnimationFrame: DOM scroll-контейнер может быть не готов
// сразу (chatReady=false → shimmer overlay opacity:0 → scrollRef.current=null).
// Ждём до 30 кадров (~500мс), потом onDone() даже если scrollEl не появился.
//
// isRestoringRef: ставим true перед программным scrollTop= и сбрасываем через 500мс —
// closed-loop guard (programmatic scroll триггерит onScroll → handleScroll save).

import { useLayoutEffect, useRef } from 'react'
import { logNativeScroll, getScrollMetrics } from '../utils/scrollDiagnostics.js'
import { placeAnchor } from '../utils/scrollPositionsCache.js' // v1.2.186: восстановление по якорю-сообщению

const MAX_ATTEMPTS = 30

export function useInitialScroll({
  activeChatId, messagesCount, scrollRef, firstUnreadIdRef, activeUnread, loading,
  onDone,
  getSavedScrollTop,  // (chatId) => { scrollTop, atBottom } | null
  isRestoringRef,     // v0.92.4: closed-loop guard
}) {
  // Set chatIds где initial-scroll УЖЕ выполнен. Повторное открытие — restore, не initial.
  const doneSetRef = useRef(new Set())
  const doneRef = useRef(null)
  // Различение «реальная смена activeChatId» vs «messagesCount изменился в том же чате».
  const lastActiveChatIdRef = useRef(null)
  // v0.95.3: диагностика «дёрг при повторном открытии» — счётчик ре-ранов эффекта
  // для ОДНОГО открытия (staged setState из v0.91.6: IDB→server→prefetch×2) и тайминг.
  const followupRef = useRef(0)
  const restoreStartRef = useRef(0)

  // v0.95.4: useLayoutEffect (а не useEffect) — restore выполняется ДО paint, поэтому
  // юзер не видит «дёрг» (флэш чужой позиции при переключении seen-чатов).
  // Подтверждено диагностикой v0.95.3: msSinceEffectStart=0 + attempts=0 → restore
  // синхронный и сразу находит scrollEl → useLayoutEffect не блокирует paint значимо.
  // Та же ОЗ работа что в InboxMode useLayoutEffect (load-older re-pin, v0.94.2).
  // КРИТИЧНО: внутри ТОЛЬКО micro-операция scrollTop=N (микросекунды), не добавлять
  // тяжёлую работу/fetch — иначе useLayoutEffect станет узким местом (React docs).
  useLayoutEffect(() => {
    if (!activeChatId) return

    // Помечаем «restore идёт» — programmatic scrollTop= не должен портить save.
    const markRestoring = () => {
      if (!isRestoringRef) return
      isRestoringRef.current = true
      setTimeout(() => { isRestoringRef.current = false }, 500)
    }

    // === Ветка 2: возврат в виденный чат (already-seen) ===
    if (doneSetRef.current.has(activeChatId)) {
      doneRef.current = activeChatId
      const isReturning = lastActiveChatIdRef.current !== activeChatId
      if (!isReturning) {
        // Тот же чат, просто messagesCount изменился (push/prefetch) — не трогаем scroll.
        // v0.95.3: диагностика — считаем ре-раны эффекта ПОСЛЕ restore (staged setState).
        followupRef.current += 1
        logNativeScroll('restore-followup-render', {
          chatId: activeChatId, followupCount: followupRef.current, messagesCount,
        })
        try { onDone?.(activeChatId) } catch (_) {}
        return
      }
      lastActiveChatIdRef.current = activeChatId
      followupRef.current = 0  // новый чат — сбросить счётчик
      restoreStartRef.current = Date.now()  // тайминг от запуска эффекта до scrollTop=
      let cancelled = false
      let attempts = 0
      const restore = () => {
        if (cancelled) return
        const el = scrollRef.current
        if (!el || el.scrollHeight === 0) {
          attempts++
          if (attempts < MAX_ATTEMPTS) { requestAnimationFrame(restore); return }
          logNativeScroll('restore-skip', { chatId: activeChatId, reason: 'no-scrollEl', attempts })
          return
        }
        const saved = getSavedScrollTop?.(activeChatId)
        // v0.95.3: захват scrollTop ДО записи — что видел юзер до restore?
        // Если 0 при saved≠0 — был flash «верх ленты», подтверждение post-paint гипотезы.
        const scrollTopBefore = el.scrollTop
        const msSinceEffectStart = Date.now() - restoreStartRef.current
        markRestoring()
        if (saved?.atBottom) {
          el.scrollTop = el.scrollHeight
          logNativeScroll('restore-applied', { chatId: activeChatId, mode: 'bottom', scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, scrollTopBefore, msSinceEffectStart, attempts })
        } else if (placeAnchor(el, saved?.anchorMsgId, saved?.screenTop)) {
          // v1.2.186: ставим сообщение-якорь на то же смещение (точное место, устойчиво к догрузке).
          logNativeScroll('restore-applied', { chatId: activeChatId, mode: 'anchor', anchorMsgId: saved.anchorMsgId, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, scrollTopBefore, msSinceEffectStart, attempts })
        } else if (saved?.anchorMsgId) {
          el.scrollTop = el.scrollHeight  // якорь не найден в DOM (окно его не подтянуло) → мягкий откат в конец
          logNativeScroll('restore-applied', { chatId: activeChatId, mode: 'anchor-missing', anchorMsgId: saved.anchorMsgId, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, scrollTopBefore, msSinceEffectStart, attempts })
        } else {
          logNativeScroll('restore-skip', { chatId: activeChatId, reason: 'no-saved', scrollTopBefore })
        }
      }
      restore()
      try { onDone?.(activeChatId) } catch (_) {}
      return () => { cancelled = true }
    }

    // === Ветка 1: первое открытие чата ===
    lastActiveChatIdRef.current = activeChatId
    if (messagesCount === 0) {
      logNativeScroll('initial-wait-empty', { chatId: activeChatId, activeUnread })
      return
    }
    if (loading) {
      logNativeScroll('initial-wait-loading', { chatId: activeChatId, messages: messagesCount, activeUnread })
      return
    }

    let cancelled = false
    let attempts = 0
    const runInitialScroll = () => {
      if (cancelled) return
      const el = scrollRef.current
      if (!el || el.scrollHeight === 0) {
        attempts++
        if (attempts < MAX_ATTEMPTS) { requestAnimationFrame(runInitialScroll); return }
        logNativeScroll('initial-no-scrollel', { chatId: activeChatId, attempts })
        doneSetRef.current.add(activeChatId)
        doneRef.current = activeChatId
        try { onDone?.(activeChatId) } catch (_) {}
        return
      }
      markRestoring()
      const firstUnread = firstUnreadIdRef.current
      const saved = getSavedScrollTop?.(activeChatId)
      // Приоритет: сохранённая позиция-якорь (если есть и не на дне).
      // v1.2.186: якорь по сообщению (не пиксель от края). Якорь не найден → firstUnread/низ.
      if (saved && !saved.atBottom && placeAnchor(el, saved.anchorMsgId, saved.screenTop)) {
        logNativeScroll('initial-restore-saved', { chatId: activeChatId, mode: 'anchor', anchorMsgId: saved.anchorMsgId, scrollTop: el.scrollTop })
      } else if (firstUnread) {
        const target = el.querySelector(`[data-msg-id="${firstUnread}"]`)
        if (target) {
          target.scrollIntoView({ block: 'start', behavior: 'auto' })
          target.classList.add('native-msg-last-read-highlight')
          setTimeout(() => target.classList.remove('native-msg-last-read-highlight'), 3500)
          logNativeScroll('initial-target', { chatId: activeChatId, firstUnread, ...getScrollMetrics(el) })
        } else {
          el.scrollTop = el.scrollHeight
          logNativeScroll('initial-target-missing', { chatId: activeChatId, firstUnread })
        }
      } else {
        el.scrollTop = el.scrollHeight
        logNativeScroll('initial-bottom', { chatId: activeChatId, ...getScrollMetrics(el) })
      }
      doneSetRef.current.add(activeChatId)
      doneRef.current = activeChatId
      try { onDone?.(activeChatId) } catch (_) {}
    }
    const timer = setTimeout(runInitialScroll, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [activeChatId, messagesCount, loading])

  return { doneRef, doneSetRef }
}
