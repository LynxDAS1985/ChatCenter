// v0.91.11-14: модуль логики возврата в виденный чат (ветка already-seen).
// Содержит:
//   1. logRestoreDiag — 4 точки логирования (v0.91.11)
//   2. tryRestoreWithRetry — retry-loop через rAF симметрично ветке 1 (v0.91.14)
// Корень бага v0.91.14 (chatcenter.log 14:54:35): scrollEl=null при первом
// срабатывании useEffect → silent skip + lastActiveChatIdRef ставился безусловно →
// следующее срабатывание isReturning=false → restore никогда. Паттерн Telegram
// Web K (tweb): отложенное применение позиции после mount DOM.

import { logNativeScroll } from '../utils/scrollDiagnostics.js'

const RETURN_MAX_ATTEMPTS = 10

// v0.91.14: retry-loop до появления DOM. lastActiveChatIdRef ставится ТОЛЬКО
// когда DOM готов или MAX_ATTEMPTS исчерпан — защита v0.91.7 сохранена.
export function tryRestoreWithRetry({ chatId, scrollRef, getSavedScrollTop, lastActiveChatIdRef }) {
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
      savedTop: getSavedScrollTop?.(chatId), scrollRef,
    })
  }
  tick()
  return () => { cancelled = true }
}

export function logRestoreDiag({ chatId, isReturning, scrollEl, savedTop, scrollRef }) {
  if (!isReturning) {
    logNativeScroll('initial-restore-skip', { chatId, reason: 'not-returning' })
    return
  }
  if (!scrollEl) {
    logNativeScroll('initial-restore-skip', { chatId, reason: 'no-scrollEl' })
    return
  }
  if (typeof savedTop !== 'number') {
    logNativeScroll('initial-restore-skip', { chatId, reason: 'no-saved', savedTopType: typeof savedTop })
    return
  }
  logNativeScroll('initial-restore-attempt', {
    chatId, savedTop, scrollHeight: scrollEl.scrollHeight, clientHeight: scrollEl.clientHeight,
  })
  scrollEl.scrollTop = savedTop
  const actualTop = scrollEl.scrollTop
  logNativeScroll('initial-restore-applied', {
    chatId, requestedTop: savedTop, actualTop, clamped: actualTop !== savedTop,
  })
  logNativeScroll('initial-restore-saved', { chatId, savedTop })
  setTimeout(() => {
    const el = scrollRef.current
    if (el) logNativeScroll('initial-restore-postcheck', {
      chatId, afterMs: 100, finalTop: el.scrollTop, scrollHeight: el.scrollHeight,
    })
  }, 100)
}
