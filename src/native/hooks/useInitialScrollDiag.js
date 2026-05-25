// v0.91.11: ВРЕМЕННАЯ диагностика «при возврате в чат программа прыгает вверх».
// Логика restore (el.scrollTop = savedTop) остаётся в useInitialScroll.js
// ветка already-seen. Этот модуль вынесен отдельно чтобы:
//   1) Не раздувать useInitialScroll.js за лимит 150 строк (правило hooks/).
//   2) Удалить ЦЕЛЫЙ файл одним движением после фикса корня (TODO-6).
// Подробности — features.md v0.91.11. 4 точки лога:
//   initial-restore-attempt  — попытка с scrollHeight/clientHeight
//   initial-restore-applied  — фактический scrollTop + clamped флаг
//                              (MDN scrollTop spec: значение обрезается до scrollHeight-clientHeight)
//   initial-restore-postcheck — позиция через 100мс (react-window useDynamicRowHeight
//                              мог сбросить кэш высот при смене cacheKey)
//   initial-restore-skip     — причина: no-scrollEl / no-saved / not-returning

import { logNativeScroll } from '../utils/scrollDiagnostics.js'

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
