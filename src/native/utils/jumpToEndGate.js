// v0.95.20: гейт для jump-to-end ветки в InboxMode.scrollToBottom.
//
// Раньше (v0.95.12-v0.95.19) гейт был `unreadVsLoaded > 50`: загрузка
// перед прыжком вниз выполнялась ТОЛЬКО при большом числе непрочитанных.
// Если в чате 10 непрочитанных, но они в 200 сообщениях от загруженного
// окна — fallback мгновенно скроллил к scrollHeight, а сообщения дописывались
// после («эффект появления»).
//
// Новое правило (v0.95.20): любой разрыв (gapMessages > 0) → итеративный
// fetch до lastMessageId → плавный скролл. Юзер всегда видит полную ленту
// перед приземлением, как в Telegram Desktop (`_history->isReadyFor()`
// проверяется перед scroll).
//
// Защита от циклов и долгих ожиданий — в backend.messages.getIterativeUntil
// (maxIterations: 10, empty stop, duplicate stop, targetCount: 100).
//
// Эталоны: Telegram Desktop HistoryWidget::cornerButtonsShowAtPosition,
// Telegram Web K ChatBubbles.onGoDownClick (ProgressivePreloader),
// TDLib issue #740 (итеративный fetch — официальный паттерн).

export function computeJumpToEndGate({ lastMessageId, gapMessages, loading } = {}) {
  if (loading) return false
  if (!lastMessageId) return false
  if (!Number.isFinite(gapMessages)) return false
  return gapMessages > 0
}
