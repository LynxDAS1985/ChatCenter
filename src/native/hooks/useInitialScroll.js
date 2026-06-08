// v0.87.29: начальный скролл при открытии чата.
// v0.94.0: ПОЛНОСТЬЮ ПЕРЕПИСАН под обычный DOM (виртуализация удалена).
//
// Логика проста:
//   1. Первое открытие чата (нет в doneSet):
//      - есть savedScrollTop → el.scrollTop = saved
//      - есть firstUnread → scroll к нему (data-msg-id querySelector)
//      - иначе → el.scrollTop = el.scrollHeight (низ, новые сообщения)
//   2. Возврат в виденный чат (already-seen):
//      - есть saved.atBottom → el.scrollTop = el.scrollHeight
//      - есть saved.scrollTop → el.scrollTop = saved.scrollTop (PIXEL-PERFECT)
//
// Без виртуализации scrollHeight стабилен → pixel scrollTop восстанавливается ТОЧНО.
// Нет anchor msgId, нет offset, нет Virtuoso initialTopMostItemIndex. Просто число.
//
// retry-loop через requestAnimationFrame: DOM scroll-контейнер может быть не готов
// сразу (chatReady=false → shimmer overlay opacity:0 → scrollRef.current=null).
// Ждём до 30 кадров (~500мс), потом onDone() даже если scrollEl не появился.
//
// isRestoringRef: ставим true перед программным scrollTop= и сбрасываем через 500мс —
// closed-loop guard (programmatic scroll триггерит onScroll → handleScroll save).

import { useLayoutEffect, useRef } from 'react'
import { logNativeScroll, getScrollMetrics } from '../utils/scrollDiagnostics.js'

const MAX_ATTEMPTS = 30

export function useInitialScroll({
  activeChatId, messagesCount, scrollRef, firstUnreadIdRef, activeUnread, loading,
  onDone,
  getSavedScrollTop,  // (chatId) => { scrollTop, atBottom } | null
  isRestoringRef,     // v0.92.4: closed-loop guard
  // v0.95.49: ref сбрасывается в false при смене activeChatId, ставится в true
  // при реальном wheel/touch/pointer ввода юзера. Защита от перезаписи позиции
  // когда юзер уже начал читать и листать.
  userScrolledRef,
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
        // Тот же чат, messagesCount изменился (IDB cached → server → prefetch×2).
        // v0.95.49: КОРЕНЬ БАГА «прыжок вверх» — useLayoutEffect при isReturning=true
        // ставит scrollTop=saved.scrollTop сразу, но scrollHeight ещё маленький
        // (cached 50 msgs из IDB). MDN: scrollTop clamped to [0, scrollHeight-clientHeight].
        // Когда saved.scrollTop=15000 а scrollHeight на момент restore=5000 — scrollTop
        // клампится до scrollMax≈4440. Через 200мс приходят server messages →
        // scrollHeight растёт до 20000, но scrollTop остался 4440 → юзер видит ВЕРХ
        // ленты вместо запомненной позиции.
        // Решение — re-apply saved.scrollTop на КАЖДОМ followup-render пока:
        //   - followupCount < 5 (защита от бесконечного цикла, хватит для staged setState)
        //   - юзер НЕ начал скроллить вручную (userScrolledRef)
        // Эталон: Telegram Web K `_isJumping` + retry restore на messagesCount changes.
        followupRef.current += 1
        const MAX_FOLLOWUP_RESTORES = 5
        const userScrolled = !!userScrolledRef?.current
        if (followupRef.current <= MAX_FOLLOWUP_RESTORES && !userScrolled) {
          const saved = getSavedScrollTop?.(activeChatId)
          const el = scrollRef.current
          if (el && saved) {
            const scrollTopBefore = el.scrollTop
            markRestoring()
            if (saved.atBottom) {
              el.scrollTop = el.scrollHeight
            } else if (Number.isFinite(saved.scrollTop)) {
              el.scrollTop = saved.scrollTop
            }
            logNativeScroll('restore-followup-applied', {
              chatId: activeChatId, followupCount: followupRef.current,
              messagesCount, mode: saved.atBottom ? 'bottom' : 'pixel',
              requestedScrollTop: saved.scrollTop, requestedAtBottom: !!saved.atBottom,
              scrollTopBefore, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight,
            })
          } else {
            logNativeScroll('restore-followup-render', {
              chatId: activeChatId, followupCount: followupRef.current, messagesCount,
              skipped: el ? 'no-saved' : 'no-scrollEl',
            })
          }
        } else {
          logNativeScroll('restore-followup-render', {
            chatId: activeChatId, followupCount: followupRef.current, messagesCount,
            aborted: userScrolled ? 'user-scrolled' : 'max-reached',
          })
        }
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
        } else if (saved && Number.isFinite(saved.scrollTop)) {
          el.scrollTop = saved.scrollTop
          logNativeScroll('restore-applied', { chatId: activeChatId, mode: 'pixel', requested: saved.scrollTop, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, scrollTopBefore, msSinceEffectStart, attempts })
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
      // Приоритет: сохранённая позиция (если есть и не на дне).
      if (saved && Number.isFinite(saved.scrollTop) && !saved.atBottom) {
        el.scrollTop = saved.scrollTop
        logNativeScroll('initial-restore-saved', { chatId: activeChatId, scrollTop: el.scrollTop })
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
