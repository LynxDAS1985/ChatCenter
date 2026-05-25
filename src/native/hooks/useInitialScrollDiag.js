// v0.91.11-15: модуль логики возврата в виденный чат (ветка already-seen).
// История версий:
//   v0.91.11 — диагностика 4 точки лога (initial-restore-attempt/applied/postcheck/skip)
//   v0.91.14 — tryRestoreWithRetry с rAF retry × 10 (симметрия ветки 1 v0.91.6)
//   v0.91.15 — переход с пиксельного scrollTop на anchor msgId (паттерн tweb)
//
// Корень бага v0.91.15 (chatcenter.log 16:19:24): пиксельный scrollTop был fragile —
// при ремаунте react-window cacheKey reset → scrollHeight маленький → MDN scrollTop
// spec обрезает значение до scrollHeight-clientHeight (clamped=TRUE) → handleScroll
// сохранял clamped → savedTop деградировал при каждом возврате: 11494 → 2235 → 1430.
//
// Решение — anchor msgId (Telegram Web K setPeerOptions.topMessageFullMid):
//   saved = {anchorMsgId, atBottom}
//   Если atBottom — scrollEl.scrollTop = scrollEl.scrollHeight (scroll to bottom)
//   Иначе если anchorMsgId — onRestoreAnchor(msgId) → scrollToRow по индексу
// msgId стабилен между ремаунтами react-window — не зависит от scrollHeight.

import { logNativeScroll } from '../utils/scrollDiagnostics.js'

const RETURN_MAX_ATTEMPTS = 10

// v0.91.14: retry-loop до появления DOM. lastActiveChatIdRef ставится ТОЛЬКО
// когда DOM готов или MAX_ATTEMPTS исчерпан — защита v0.91.7 сохранена.
// v0.91.15: добавлен onRestoreAnchor для восстановления через scrollToRow.
export function tryRestoreWithRetry({ chatId, scrollRef, getSavedScrollTop, lastActiveChatIdRef, onRestoreAnchor }) {
  let cancelled = false
  let attempts = 0
  const tick = () => {
    if (cancelled) return
    const scrollEl = scrollRef.current
    if (!scrollEl) {
      attempts++
      if (attempts < RETURN_MAX_ATTEMPTS) {
        requestAnimationFrame(tick)
        return
      }
      logNativeScroll('initial-restore-skip', { chatId, reason: 'no-scrollEl-final', attempts })
      lastActiveChatIdRef.current = chatId
      return
    }
    lastActiveChatIdRef.current = chatId
    logRestoreDiag({
      chatId, isReturning: true, scrollEl,
      saved: getSavedScrollTop?.(chatId),
      onRestoreAnchor,
    })
  }
  tick()
  return () => { cancelled = true }
}

// v0.91.15: переписано для anchor msgId формата.
// saved = {anchorMsgId, atBottom} | null
export function logRestoreDiag({ chatId, isReturning, scrollEl, saved, onRestoreAnchor }) {
  if (!isReturning) {
    logNativeScroll('initial-restore-skip', { chatId, reason: 'not-returning' })
    return
  }
  if (!scrollEl) {
    logNativeScroll('initial-restore-skip', { chatId, reason: 'no-scrollEl' })
    return
  }
  if (!saved || typeof saved !== 'object') {
    logNativeScroll('initial-restore-skip', { chatId, reason: 'no-saved', savedType: typeof saved })
    return
  }
  if (saved.atBottom) {
    // Юзер был на дне — scroll to bottom. scrollEl надёжно знает scrollHeight.
    scrollEl.scrollTop = scrollEl.scrollHeight
    logNativeScroll('initial-restore-applied', {
      chatId, mode: 'bottom', actualTop: scrollEl.scrollTop, scrollHeight: scrollEl.scrollHeight,
    })
    return
  }
  if (saved.anchorMsgId) {
    // Восстановление через scrollToRow — react-window сам пересчитает scrollTop
    // после remeasure высот. Не зависит от scrollHeight на момент вызова.
    logNativeScroll('initial-restore-attempt', {
      chatId, anchorMsgId: saved.anchorMsgId,
      scrollHeight: scrollEl.scrollHeight, clientHeight: scrollEl.clientHeight,
    })
    try { onRestoreAnchor?.(saved.anchorMsgId) } catch (_) {}
    logNativeScroll('initial-restore-applied', { chatId, mode: 'anchor', anchorMsgId: saved.anchorMsgId })
    return
  }
  logNativeScroll('initial-restore-skip', { chatId, reason: 'empty-saved' })
}
