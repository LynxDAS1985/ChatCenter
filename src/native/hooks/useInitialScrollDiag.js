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

// v0.91.16: увеличено с 10 до 30 (~500мс вместо 166мс) — heavy renders при
// быстром переключении чатов не успевали примонтировать DOM react-window
// (chatcenter.log 17:34:00: hasEl=false attempts=10 → юзер на default top=0).
const RETURN_MAX_ATTEMPTS = 30

// v0.91.14: retry-loop до появления DOM. lastActiveChatIdRef ставится ТОЛЬКО
// когда DOM готов или MAX_ATTEMPTS исчерпан — защита v0.91.7 сохранена.
// v0.91.15: добавлен onRestoreAnchor для восстановления через scrollToRow.
// v0.91.16: добавлены onScrollToIndex / onGetLastIndex для bottom через scrollToRow.
export function tryRestoreWithRetry({
  chatId, scrollRef, getSavedScrollTop, lastActiveChatIdRef,
  onRestoreAnchor, onScrollToIndex, onGetLastIndex,
}) {
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
    // v0.91.19 ДИАГНОСТИКА: фиксируем что сохранено ДО restore — для сверки
    // с scroll-save / autosave-save через несколько мс. Если saved=X но
    // scroll-save через 50мс пишет anchor=Y — подтверждается замкнутый круг.
    const saved = getSavedScrollTop?.(chatId)
    logNativeScroll('restore-start', {
      chatId,
      savedAnchor: saved?.anchorMsgId ?? null,
      savedAtBottom: !!saved?.atBottom,
    })
    // v0.91.18: scrollRef ОБЯЗАТЕЛЕН для postcheck setTimeout (был забыт в v0.91.16
    // при переписывании → ReferenceError в postcheck → postcheck не работал).
    logRestoreDiag({
      chatId, isReturning: true, scrollEl, scrollRef,
      saved,
      onRestoreAnchor, onScrollToIndex, onGetLastIndex,
    })
  }
  tick()
  return () => { cancelled = true }
}

// v0.91.15: переписано для anchor msgId формата.
// v0.91.16: bottom mode через scrollToRow + postcheck — раньше использовался
// raw scrollHeight который ещё не remeasured react-window (clamped) →
// юзер на «псевдо-дне» (chatcenter.log 17:34:04: scrollHeight=2185 для 50 msg
// = defaultRowHeight×50, реальная высота ~4000).
// saved = {anchorMsgId, atBottom} | null
// v0.91.18: scrollRef добавлен обратно (был в v0.91.11, забыт при рефакторинге
// v0.91.16). Используется в postcheck setTimeout — без него ReferenceError
// (chatcenter.log 10:04:59 ×3). MDN: переменная недоступна в области видимости.
export function logRestoreDiag({
  chatId, isReturning, scrollEl, saved, scrollRef,
  onRestoreAnchor, onScrollToIndex, onGetLastIndex,
}) {
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
    // v0.91.16: scrollToRow(lastIndex, 'end') — react-window сам пересчитает
    // scrollTop после remeasure. Fallback scrollHeight только если индекса нет.
    const lastIdx = onGetLastIndex?.()
    if (typeof lastIdx === 'number' && lastIdx >= 0 && onScrollToIndex) {
      try { onScrollToIndex(lastIdx, 'end') } catch (_) {}
      logNativeScroll('initial-restore-applied', {
        chatId, mode: 'bottom-row', lastIdx,
        scrollHeight: scrollEl.scrollHeight, clientHeight: scrollEl.clientHeight,
      })
    } else {
      scrollEl.scrollTop = scrollEl.scrollHeight
      logNativeScroll('initial-restore-applied', {
        chatId, mode: 'bottom-fallback',
        actualTop: scrollEl.scrollTop, scrollHeight: scrollEl.scrollHeight,
      })
    }
    // v0.91.20 ДИАГНОСТИКА: 5 замеров scrollHeight + финал на 1000мс (TODO-8).
    ;[50, 100, 300, 500, 1000].forEach(delay => {
      setTimeout(() => {
        const el = scrollRef.current
        if (!el) return
        logNativeScroll('postcheck-tick', { chatId, delay, mode: 'bottom', scrollTop: el.scrollTop, scrollHeight: el.scrollHeight })
        if (delay === 1000) {
          const idx = onGetLastIndex?.()
          if (typeof idx === 'number' && idx >= 0 && onScrollToIndex) {
            try { onScrollToIndex(idx, 'end') } catch (_) {}
          } else { el.scrollTop = el.scrollHeight }
          logNativeScroll('initial-restore-postcheck', { chatId, afterMs: 1000, mode: 'bottom', finalTop: el.scrollTop, scrollHeight: el.scrollHeight })
        }
      }, delay)
    })
    return
  }
  if (saved.anchorMsgId) {
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
