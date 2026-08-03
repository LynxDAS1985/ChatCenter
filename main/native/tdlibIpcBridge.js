// v0.89.34: вынесено из tdlibIpcHandlers.js (был 410 строк, лимит 500).
// Мост manager.on() события → sendToRenderer('tg:*') каналы.
import { mapUserStatus } from '../../shared/userStatusMap.js' // v1.2.171: разбор статуса собеседника
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
  // v0.95.44: прогресс загрузки файлов (sendFile / sendAlbum). Throttle по Math.floor(%)
  // здесь же — иначе на быстром upload летит 100+ events/сек → React perf.
  // Кэш `lastPercent` per fileId; emit ТОЛЬКО при изменении целого %.
  // Эталон: Telegram Web K appDownloadManager throttle на 1%.
  const _uploadLastPercent = new Map()
  subscribe('upload:progress', ({ fileId, uploaded, total, done }) => {
    const percent = total > 0 ? Math.min(100, Math.floor((uploaded / total) * 100)) : 0
    const prev = _uploadLastPercent.get(fileId)
    if (!done && prev === percent) return null  // skip — целый % не изменился
    if (done) _uploadLastPercent.delete(fileId)
    else _uploadLastPercent.set(fileId, percent)
    return {
      channel: 'tg:upload-progress',
      data: { fileId, uploaded, total, percent, done: !!done },
    }
  })
  // v0.95.38: server ACK после отправки — заменяем provisional message на финальный
  // (TDLib меняет id). Корень исправления «дубля сообщений» — см.
  // .memory-bank/mistakes/outgoing-two-cases.md (Известная незакрытая проблема).
  subscribe('message:send-succeeded', ({ chatId, oldId, newMessage }) => ({
    channel: 'tg:send-succeeded', data: { chatId, oldId, newMessage },
  }))
  subscribe('message:edited', ({ chatId, messageId, editDate }) => ({
    channel: 'tg:message-edited', data: { chatId, messageId, editDate },
  }))
  subscribe('message:deleted', ({ chatId, messageIds }) => ({
    channel: 'tg:message-deleted', data: { chatId, messageIds },
  }))
  subscribe('chat:unread-sync', ({ chatId, unreadCount, lastReadInboxId }) => ({
    channel: 'tg:chat-unread-sync', data: { chatId, unreadCount, lastReadInboxId },
  }))
  // v0.91.9: TDLib шлёт updateChatLastMessage отдельно от updateNewMessage
  // (например при оптимизации больших супергрупп). Без этого превью в списке
  // чатов застывало на старом значении. См. .memory-bank/api.md.
  subscribe('chat:last-message', ({ chatId, lastMessage, lastMessageTs, senderName, isOutgoing }) => ({
    channel: 'tg:chat-last-message', data: { chatId, lastMessage, lastMessageTs, senderName, isOutgoing },
  }))
  // v0.89.4: индикатор действий. v1.2.170: action (типы действий), не только typing:boolean.
  // v0.95.31: senderName для multi-user (formatTypingUsers).
  subscribe('chat:typing', ({ chatId, userId, senderName, action }) => ({
    channel: 'tg:typing', data: { chatId, userId, senderName, action },
  }))
  // v0.89.4: outgoing read-receipts (UI ждёт {chatId, outgoing:true, maxId}).
  subscribe('chat:read-outbox', ({ chatId, maxId }) => ({
    channel: 'tg:read', data: { chatId, outgoing: true, maxId },
  }))
  subscribe('account:auth-state', ({ accountId, state, payload }) => {
    // v1.2.142 (диаг): каждый переход авторизации (WaitPhone/WaitCode/Ready/Closed…).
    console.log(`[acct-auth] id=${accountId} state=${state}`)
    return { channel: 'tg:login-step', data: stateToLoginStep(state, accountId, payload) }
  })
  subscribe('account:error', ({ accountId, error }) => ({
    channel: 'tg:account-update',
    data: { id: accountId, messenger: 'telegram', status: 'error', error: error?.message || String(error) },
  }))
  // v0.89.0 / Этап 3.5: после успешного логина backend.auth._finalizePending
  // эмитит account:update с полным набором полей. Мостим как tg:account-update
  // — UI sidebar добавит аккаунт в список (через nativeStoreIpc.js handler).
  subscribe('account:update', (data) => {
    // v1.2.142 (диаг): что уходит на экран про аккаунт (подключён / удалён / переименован-финал).
    console.log(`[acct-update] id=${data?.id} status=${data?.status || ''} removed=${!!data?.removed} name=${data?.name || ''}`)
    return { channel: 'tg:account-update', data }
  })
  // v1.2.146: переименование временного аккаунта в настоящий (tg_pending_X → tg_<userId>).
  // Раньше на экран НЕ пробрасывалось → старая метка временного id могла зависнуть призраком.
  // Теперь экран убирает осиротевшую запись сразу (см. nativeStoreIpc tg:account-renamed).
  subscribe('account:renamed', ({ oldId, newId }) => {
    console.log(`[acct-renamed] ${oldId} -> ${newId}`)
    return { channel: 'tg:account-renamed', data: { oldId, newId } }
  })
  subscribe('account:connection', ({ accountId, state }) => ({
    channel: 'tg:account-connection',
    data: { accountId, state },
  }))
  // v1.2.171: живой статус собеседника (в сети / был(а) …). status — сырой объект TDLib.
  // mapUserStatus достаёт isOnline + точное lastSeenAt (was_online) + тип статуса.
  subscribe('user:status', ({ accountId, userId, status }) => ({
    channel: 'tg:user-status', data: { accountId, userId, ...mapUserStatus(status) },
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
