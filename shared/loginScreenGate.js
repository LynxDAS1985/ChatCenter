// v1.2.147: показывать ли экран входа поверх нативного окна.
// Причина фикса: после УСПЕШНОГО входа (добавления аккаунта) TDLib присылает
// authorizationStateReady → loginFlow становится { step: 'success' } и НЕ сбрасывается.
// Старое правило `showLogin || !!loginFlow` держало пустой экран входа поверх чатов —
// пользователь видел «чёрный экран» с чатами, спрятанными под завершённым входом.
//
// Правило: завершённый вход (step === 'success') НЕ держит экран входа. Всё остальное —
// как раньше: открытая вручную модалка (showLogin) или незавершённый вход (phone/code/
// password/ошибка/закрытие) показывают экран входа.
export function shouldShowLoginScreen(showLogin, loginFlow) {
  if (showLogin) return true
  if (!loginFlow) return false
  return loginFlow.step !== 'success'
}

// v1.2.149: сбрасывать ли «признак входа» при ОТКРЫТИИ окна входа. ТОЛЬКО если завис
// завершённый вход (step==='success') — иначе следующее открытие модалки закроется само
// (LoginModal на success сам зовёт onClose). НЕ сбрасываем незавершённый вход (phone/code/
// password) — панель аккаунтов с кнопкой «+» видна и во время ввода, случайный клик не
// должен обрывать активный вход.
export function shouldResetLoginFlowOnOpen(loginFlow) {
  return loginFlow?.step === 'success'
}
