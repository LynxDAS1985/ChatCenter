// v0.89.0 — Stage 4 / Этап 3.2: IPC handlers для TDLib backend
//
// Регистрирует те же IPC каналы (`tg:get-messages`, `tg:send-message`, etc),
// что и существующие GramJS-handlers, но направляет их через MessengerBackend
// → tdlibBackend. Это позволяет UI работать без знания какой backend активен.
//
// АРХИТЕКТУРА:
//   - `initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer })` — единая точка
//     регистрации.
//   - `sendToRenderer(channel, payload)` — функция для emit-событий в renderer
//     (в production: mainWindow.webContents.send).
//   - Подписывается на manager events (message:new, chat:unread-sync, etc) и
//     проксирует их как tg:* events в UI.
//
// БЕЗОПАСНОСТЬ:
//   - Регистрируется ТОЛЬКО при USE_TDLIB_BACKEND=1 — иначе обычные GramJS
//     handlers (telegramHandler.js) продолжают работать.
//   - НЕ удаляет существующие handlers — main.js при флаге выбирает один из двух.
//
// IPC КАНАЛЫ (совместимы с GramJS-контрактом, см. .memory-bank/api.md):
//   Login: tg:login-start, tg:login-code, tg:login-password, tg:login-cancel
//   Account: tg:get-accounts, tg:remove-account
//   Chats: tg:get-chats, tg:get-cached-chats, tg:rescan-unread, tg:health-check
//   Messages: tg:get-messages, tg:send-message, tg:edit-message,
//             tg:delete-message, tg:mark-read, tg:get-pinned-message

/**
 * @param {object} deps
 * @param {object} deps.ipcMain — electron's ipcMain (или mock в тестах)
 * @param {object} deps.backend — результат createTdlibBackend()
 * @param {(channel: string, payload: any) => void} deps.sendToRenderer
 * @param {(level: string, msg: string) => void} [deps.log] — опциональный логгер
 * @returns {() => void} — функция unregister (для тестов и cleanup)
 */
export function initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer, log }) {
  if (!ipcMain?.handle) throw new Error('initTdlibIpcHandlers: ipcMain.handle required')
  if (!backend) throw new Error('initTdlibIpcHandlers: backend required')
  if (typeof sendToRenderer !== 'function') throw new Error('initTdlibIpcHandlers: sendToRenderer required')

  const logFn = log || (() => {})
  const registered = []
  const subscriptions = []

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (_event, payload) => {
      try { return await fn(payload || {}) }
      catch (e) {
        logFn('error', `[tdlib-ipc] ${channel}: ${e?.message || e}`)
        return { ok: false, error: e?.message || String(e) }
      }
    })
    registered.push(channel)
  }

  // ────────────────────────────────────────────────────────────────────
  // LOGIN
  // ────────────────────────────────────────────────────────────────────

  handle('tg:login-start', ({ phone } = {}) => backend.auth.startLogin(phone))
  handle('tg:login-code', ({ code } = {}) => backend.auth.submitCode(code))
  handle('tg:login-password', ({ password } = {}) => backend.auth.submitPassword(password))
  handle('tg:login-cancel', () => backend.auth.cancelLogin())

  // ────────────────────────────────────────────────────────────────────
  // ACCOUNTS
  // ────────────────────────────────────────────────────────────────────

  handle('tg:get-accounts', () => {
    const manager = backend._manager
    if (!manager) return { ok: false, accounts: [] }
    const accounts = manager.listAccounts().map(accountId => {
      const authState = manager.getAuthState(accountId)
      return {
        id: accountId,
        messenger: 'telegram',
        status: authState === 'authorizationStateReady' ? 'connected' : 'connecting',
        name: '',   // Заполнится через updateUser → tg:account-update event
        phone: '',
      }
    })
    return { ok: true, accounts, activeAccountId: accounts[0]?.id || null }
  })

  handle('tg:remove-account', ({ accountId } = {}) => backend.auth.removeAccount(accountId))

  // ────────────────────────────────────────────────────────────────────
  // CHATS
  // ────────────────────────────────────────────────────────────────────

  // v0.89.0 / Этап 3.7: после get-chats / get-cached-chats эмитим `tg:chats` event
  // чтобы UI store (nativeStoreIpc.js) подхватил чаты. GramJS делает то же самое.
  // Без emit UI обновляется только через event — invoke response не обновляет store.
  handle('tg:get-chats', async ({ accountId } = {}) => {
    const r = await backend.chats.getChats(accountId)
    if (r?.ok && Array.isArray(r.chats)) {
      // Группируем по accountId — UI ожидает per-account events
      const byAccount = new Map()
      for (const c of r.chats) {
        if (!byAccount.has(c.accountId)) byAccount.set(c.accountId, [])
        byAccount.get(c.accountId).push(c)
      }
      for (const [aid, chats] of byAccount.entries()) {
        sendToRenderer('tg:chats', { accountId: aid, chats, append: false })
      }
    }
    return r
  })
  handle('tg:get-cached-chats', async ({ accountId } = {}) => {
    const r = await backend.chats.getCachedChats(accountId)
    if (r?.ok && Array.isArray(r.chats) && r.chats.length > 0) {
      const targetAccountId = accountId || r.chats[0]?.accountId
      if (targetAccountId) {
        sendToRenderer('tg:chats', { accountId: targetAccountId, chats: r.chats, append: false })
      }
    }
    return r
  })
  handle('tg:rescan-unread', () => backend.chats.rescanUnread())
  handle('tg:health-check', () => backend.chats.healthCheck())

  // ────────────────────────────────────────────────────────────────────
  // MESSAGES
  // ────────────────────────────────────────────────────────────────────

  // v0.89.0 / Этап 3.8: после get-messages эмитим `tg:messages` event с
  // правильными полями (chatId, messages, append, appendNewer, readUpTo, aroundId,
  // afterId) — как делает GramJS (telegramMessages.js:242). Без emit UI store
  // не получит сообщения и зависает на «загрузка».
  handle('tg:get-messages', async (params = {}) => {
    const r = await backend.messages.get(params)
    if (r?.ok && Array.isArray(r.messages)) {
      sendToRenderer('tg:messages', {
        chatId: params.chatId,
        messages: r.messages,
        append: Boolean(params.offsetId) && !params.aroundId && !params.afterId,
        appendNewer: !!params.afterId,
        readUpTo: 0,
        aroundId: Number(params.aroundId) || 0,
        afterId: Number(params.afterId) || 0,
      })
    }
    return r
  })
  handle('tg:get-topic-messages', async (params = {}) => {
    const r = await backend.messages.getTopic(params)
    if (r?.ok && Array.isArray(r.messages)) {
      sendToRenderer('tg:messages', { chatId: params.chatId, messages: r.messages, append: false })
    }
    return r
  })
  handle('tg:send-message', ({ chatId, text, replyTo } = {}) =>
    backend.messages.send(chatId, text, replyTo))
  handle('tg:edit-message', ({ chatId, messageId, text } = {}) =>
    backend.messages.editMessage(chatId, messageId, text))
  handle('tg:delete-message', ({ chatId, messageId, forAll } = {}) =>
    backend.messages.deleteMessage(chatId, messageId, forAll))
  handle('tg:forward', ({ fromChatId, toChatId, messageId } = {}) =>
    backend.messages.forwardMessage(fromChatId, toChatId, messageId))
  handle('tg:mark-read', ({ chatId, maxId } = {}) =>
    backend.messages.markRead(chatId, maxId))
  handle('tg:mark-topic-read', ({ chatId, topicId, maxId } = {}) =>
    backend.messages.markTopicRead(chatId, topicId, maxId))
  handle('tg:get-pinned-message', ({ chatId } = {}) => backend.messages.getPinned(chatId))
  // v0.89.0 / Этап 3.8: UI зовёт 'tg:get-pinned' (без -message). Alias.
  handle('tg:get-pinned', ({ chatId } = {}) => backend.messages.getPinned(chatId))
  // 'tg:refresh-avatar' — GramJS-only концепция (force-обновить кэш аватарки чата).
  // В TDLib аватарки приходят через updateChatPhoto / updateUser events автоматически.
  // Регистрируем noop чтобы UI не получал «No handler» error.
  handle('tg:refresh-avatar', () => ({ ok: true }))

  // v0.89.0 / Этап 3.8: noop-stubs для остальных IPC которые UI зовёт, но
  // мы пока не реализовали через TDLib backend. Возвращают { ok: true } — UI
  // не падает на errors. Реальная реализация — отдельный этап (4).
  handle('tg:set-typing', async ({ chatId } = {}) => {
    // TDLib: sendChatAction. Не критично — без typing-индикатора UI работает.
    if (!chatId) return { ok: true }
    try {
      const { client, rawId } = (() => {
        const colon = String(chatId).indexOf(':')
        if (colon < 0) return {}
        const accountId = String(chatId).slice(0, colon)
        return { client: backend._manager.getClient(accountId), rawId: Number(String(chatId).slice(colon + 1)) }
      })()
      if (client?.invoke) {
        await client.invoke({
          '@type': 'sendChatAction', chat_id: rawId,
          action: { '@type': 'chatActionTyping' },
        })
      }
    } catch (_) {}
    return { ok: true }
  })
  handle('tg:set-mute', () => ({ ok: true }))  // TODO: TDLib setChatNotificationSettings
  handle('tg:pin', () => ({ ok: true }))        // TODO: TDLib toggleChatIsPinned
  handle('tg:send-file', ({ chatId, filePath, caption } = {}) =>
    backend.messages.sendFile(chatId, filePath, caption))
  handle('tg:get-cleanup-stats', async () => {
    // Простой возврат — для UI «очистить кеш». TDLib имеет getStorageStatistics
    // но синтаксис другой; пока возвращаем минимум.
    return { ok: true, bytes: 0, fileCount: 0 }
  })

  // ────────────────────────────────────────────────────────────────────
  // MEDIA
  // ────────────────────────────────────────────────────────────────────

  handle('tg:download-media', ({ chatId, messageId, thumb } = {}) =>
    backend.media.download({ chatId, msgId: messageId, thumb }))
  handle('tg:download-video', ({ chatId, messageId } = {}) =>
    backend.media.downloadVideo({ chatId, msgId: messageId }))

  // ────────────────────────────────────────────────────────────────────
  // FORUM
  // ────────────────────────────────────────────────────────────────────

  handle('tg:get-forum-topics', ({ chatId, limit } = {}) =>
    backend.forum.getTopics(chatId, limit))

  // ────────────────────────────────────────────────────────────────────
  // EVENT BRIDGE: manager events → renderer tg:* events
  // ────────────────────────────────────────────────────────────────────

  const manager = backend._manager
  if (manager?.on) {
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
    subscribe('user:avatar', ({ accountId, userId, avatarPath }) => ({
      channel: 'tg:sender-avatar', data: { accountId, userId, avatarPath },
    }))
  }

  // Возвращает unregister функцию — для тестов и graceful shutdown
  return function unregister() {
    for (const channel of registered) {
      try { ipcMain.removeHandler?.(channel) } catch (_) {}
    }
    if (manager?.off) {
      for (const { event, handler } of subscriptions) {
        try { manager.off(event, handler) } catch (_) {}
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Преобразует TDLib auth state в формат tg:login-step (совместимый с GramJS UI).
 * UI LoginModal ожидает: { step: 'phone'|'code'|'password'|null, phone?, error? }.
 */
function stateToLoginStep(state, accountId, payload) {
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
