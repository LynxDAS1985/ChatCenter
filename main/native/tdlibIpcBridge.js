// v0.89.34: вынесено из tdlibIpcHandlers.js (был 410 строк, лимит 500).
// Мост manager.on() события → sendToRenderer('tg:*') каналы.
//
// Используется из tdlibIpcHandlers.js setupEventBridge(manager, sendToRenderer, logFn).
// Возвращает массив subscriptions для последующей отписки в unregister().

/**
 * Преобразует TDLib auth state в формат tg:login-step (совместимый с GramJS UI).
 * UI LoginModal ожидает: { step: 'phone'|'code'|'password'|null, phone?, error? }.
 */
export function stateToLoginStep(state, accountId, payload) {
  switch (state) {
    case 'authorizationStateWaitPhoneNumber':
      return { step: 'phone', accountId }
    case 'authorizationStateWaitCode':
      return { step: 'code', accountId, codeInfo: payload?.code_info }
    case 'authorizationStateWaitPassword':
      return { step: 'password', accountId, passwordInfo: payload?.password_info }
    case 'authorizationStateReady':
      return { step: 'success', accountId }
    case 'authorizationStateClosed':
    case 'authorizationStateLoggingOut':
      return { step: null, accountId, closed: true }
    default:
      return { step: null, accountId, raw: state }
  }
}

/**
 * Подписывает renderer на события от manager. Возвращает subscriptions[] —
 * массив { event, handler } для отписки в unregister.
 *
 * @param {object} manager — TdlibClientManager (backend._manager)
 * @param {(channel: string, data: object) => void} sendToRenderer
 * @param {(level: string, message: string) => void} logFn
 * @returns {Array<{event: string, handler: Function}>}
 */
export function setupEventBridge(manager, sendToRenderer, logFn) {
  const subscriptions = []
  if (!manager?.on) return subscriptions

  const subscribe = (managerEvent, mapToRenderer) => {
    const handler = (payload) => {
      try {
        const r = mapToRenderer(payload)
        if (r) sendToRenderer(r.channel, r.data)
      } catch (e) { logFn('error', `[tdlib-ipc] bridge ${managerEvent}: ${e?.message}`) }
    }
    manager.on(managerEvent, handler)
    subscriptions.push({ event: managerEvent, handler })
  }

  subscribe('message:new', ({ chatId, message }) => ({
    channel: 'tg:new-message', data: { chatId, message },
  }))
  subscribe('message:edited', ({ chatId, messageId, editDate }) => ({
    channel: 'tg:message-edited', data: { chatId, messageId, editDate },
  }))
  subscribe('message:deleted', ({ chatId, messageIds }) => ({
    channel: 'tg:message-deleted', data: { chatId, messageIds },
  }))
  subscribe('chat:unread-sync', ({ chatId, unreadCount }) => ({
    channel: 'tg:chat-unread-sync', data: { chatId, unreadCount },
  }))
  // v0.91.9: TDLib шлёт updateChatLastMessage отдельно от updateNewMessage
  // (например при оптимизации больших супергрупп). Без этого превью в списке
  // чатов застывало на старом значении. См. .memory-bank/api.md.
  subscribe('chat:last-message', ({ chatId, lastMessage, lastMessageTs }) => ({
    channel: 'tg:chat-last-message', data: { chatId, lastMessage, lastMessageTs },
  }))
  // v0.89.4: typing-индикатор (UI nativeStoreIpc.js:266 ждёт {chatId, userId, typing}).
  subscribe('chat:typing', ({ chatId, userId, typing }) => ({
    channel: 'tg:typing', data: { chatId, userId, typing },
  }))
  // v0.89.4: outgoing read-receipts (UI ждёт {chatId, outgoing:true, maxId}).
  subscribe('chat:read-outbox', ({ chatId, maxId }) => ({
    channel: 'tg:read', data: { chatId, outgoing: true, maxId },
  }))
  subscribe('account:auth-state', ({ accountId, state, payload }) => ({
    channel: 'tg:login-step',
    data: stateToLoginStep(state, accountId, payload),
  }))
  subscribe('account:error', ({ accountId, error }) => ({
    channel: 'tg:account-update',
    data: { id: accountId, messenger: 'telegram', status: 'error', error: error?.message || String(error) },
  }))
  // v0.89.0 / Этап 3.5: после успешного логина backend.auth._finalizePending
  // эмитит account:update с полным набором полей. Мостим как tg:account-update
  // — UI sidebar добавит аккаунт в список (через nativeStoreIpc.js handler).
  subscribe('account:update', (data) => ({
    channel: 'tg:account-update',
    data,
  }))
  subscribe('account:connection', ({ accountId, state }) => ({
    channel: 'tg:account-connection',
    data: { accountId, state },
  }))
  subscribe('user:status', ({ accountId, userId, status }) => ({
    channel: 'tg:user-status', data: { accountId, userId, online: status === 'userStatusOnline' },
  }))
  // v0.89.0 / Этап 3.9: аватарки чатов и пользователей (sender)
  subscribe('chat:avatar', ({ chatId, avatarPath }) => ({
    channel: 'tg:chat-avatar', data: { chatId, avatarPath },
  }))
  // v0.89.4: UI ждёт `{ senderId, avatarUrl }` (не accountId/userId/avatarPath).
  // chatId не передаём — аватарка пользователя не привязана к конкретному чату,
  // UI handler iterates все state.messages и обновляет matching senderId.
  subscribe('user:avatar', ({ userId, avatarPath }) => ({
    channel: 'tg:sender-avatar', data: { senderId: String(userId), avatarUrl: avatarPath },
  }))

  return subscriptions
}
