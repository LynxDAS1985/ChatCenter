// v0.89.0 — Stage 4 / Этап 4: IPC handlers для TDLib backend (TDLib-only)
//
// Регистрирует все IPC каналы (`tg:get-messages`, `tg:send-message`, etc),
// направляет их через MessengerBackend → tdlibBackend.
// После Этапа 4 это единственный набор Telegram-обработчиков в проекте.
//
// АРХИТЕКТУРА:
//   - `initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer })` — единая точка
//     регистрации.
//   - `sendToRenderer(channel, payload)` — функция для emit-событий в renderer
//     (в production: mainWindow.webContents.send).
//   - Подписывается на manager events (message:new, chat:unread-sync, etc) и
//     проксирует их как tg:* events в UI.
//
// IPC КАНАЛЫ (см. .memory-bank/api.md):
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
 * @param {string} [deps.userDataPath] — нужен для tg:send-clipboard-image (tmp file)
 * @param {(level: string, msg: string) => void} [deps.log] — опциональный логгер
 * @returns {() => void} — функция unregister (для тестов и cleanup)
 */
export function initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer, userDataPath, log }) {
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

  // v0.89.6: возвращаем cached name/phone/username/avatar из record (если уже
  // получены через getMe + avatar download). Это нужно потому что UI может
  // запросить tg:get-accounts ПОСЛЕ того как event tg:account-update уже эмитился
  // (race на старте: autoRestore → finalizeAccount запускается до mount UI).
  // Раньше (v0.89.4 фикс #7) возвращали только id/messenger/status чтобы избежать
  // race с merge — но без cache в snapshot данные терялись навсегда если UI
  // подписался слишком поздно. Теперь cache решает это: данные есть с момента
  // когда они получены backend'ом.
  handle('tg:get-accounts', () => {
    const manager = backend._manager
    if (!manager) return { ok: false, accounts: [] }
    const accounts = manager.listAccounts().map(accountId => {
      const authState = manager.getAuthState(accountId)
      const record = manager.accounts.get(accountId)
      const acc = {
        id: accountId,
        messenger: 'telegram',
        status: authState === 'authorizationStateReady' ? 'connected' : 'connecting',
      }
      const ownUserId = record?.ownUserId
      const me = ownUserId ? record.userCache.get(ownUserId) : null
      if (me) {
        const fullName = `${me.first_name || ''} ${me.last_name || ''}`.trim()
        const username = me.usernames?.active_usernames?.[0] || me.username || ''
        const phone = me.phone_number ? `+${me.phone_number}` : ''
        const displayName = fullName || (username ? `@${username}` : '') || phone || `Telegram ${ownUserId}`
        acc.name = displayName
        acc.phone = phone
        acc.username = username
        acc.userId = String(ownUserId)
        const avatar = record.userAvatars?.get(ownUserId)
        if (avatar) acc.avatar = avatar
      }
      return acc
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
  // afterId). Без emit UI store не получит сообщения и зависает на «загрузка».
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
  // v0.89.3: реальная реализация через TDLib setChatNotificationSettings.
  // Контракт UI (nativeStore.js:787-788): `{ chatId, muteUntil }` где muteUntil —
  // Unix timestamp (секунды) до которого приглушено (0 = unmute, 2147483647 =
  // «навсегда»). backend.chats.setMute сама конвертирует в TDLib `mute_for = now`.
  handle('tg:set-mute', ({ chatId, muteUntil } = {}) =>
    backend.chats.setMute(chatId, muteUntil))
  // v0.89.3: pin/unpin СООБЩЕНИЯ в чате (TDLib pinChatMessage/unpinChatMessage).
  // Контракт UI (nativeStore.js:473-475): `{ chatId, messageId, unpin }`. Раньше
  // handler был toggleChatIsPinned (закреп ЧАТА в Main-list) — это была регрессия
  // от GramJS контракта где tg:pin закреплял именно сообщение.
  handle('tg:pin', ({ chatId, messageId, unpin } = {}) => {
    if (unpin) return backend.messages.unpinMessage(chatId, messageId)
    return backend.messages.pinMessage(chatId, messageId, { disableNotification: true })
  })
  handle('tg:send-file', ({ chatId, filePath, caption } = {}) =>
    backend.messages.sendFile(chatId, filePath, caption))
  // v0.89.4: clipboard-paste картинки (UI useDropAndPaste.js шлёт Uint8Array).
  // Пишем во временный файл userDataDir/tdlib-tmp/paste-X.ext + backend.messages.sendFile.
  // После отправки запланирована очистка (background — не блокируем).
  handle('tg:send-clipboard-image', async ({ chatId, data, ext, caption } = {}) => {
    if (!chatId) return { ok: false, error: 'chatId required' }
    if (!data || !data.length) return { ok: false, error: 'empty clipboard data' }
    const { writeFile, mkdir, unlink } = await import('node:fs/promises')
    const path = await import('node:path')
    if (!userDataPath) return { ok: false, error: 'userDataPath not configured' }
    const tmpDir = path.join(userDataPath, 'tdlib-tmp')
    try { await mkdir(tmpDir, { recursive: true }) } catch (_) {}
    const safeExt = String(ext || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'png'
    const tmpPath = path.join(tmpDir, `paste-${Date.now()}.${safeExt}`)
    try { await writeFile(tmpPath, Buffer.from(data)) }
    catch (e) { return { ok: false, error: 'tmp write failed: ' + (e?.message || e) } }
    const r = await backend.messages.sendFile(chatId, tmpPath, caption)
    // Удаляем tmp с задержкой — TDLib uploads асинхронно из локального пути.
    setTimeout(() => { unlink(tmpPath).catch(() => {}) }, 60_000)
    return r
  })
  // v0.89.3: реальная реализация через fs-скан tdlib-sessions/ + tg-avatars/.
  // Возвращает { totalFiles, totalBytes, byCategory: { session, avatars, cache,
  // media, tmp } } совместимо с UI AccountContextMenu (см. nativeStore.js:780-783).
  handle('tg:get-cleanup-stats', () => backend.chats.getCleanupStats())

  // ────────────────────────────────────────────────────────────────────
  // MEDIA
  // ────────────────────────────────────────────────────────────────────

  // v0.89.4: onProgress колбэк эмитит tg:media-progress в renderer.
  // UI VideoTile.jsx и MediaAlbum.jsx подписаны на этот канал для прогресс-бара.
  const makeProgressCallback = (chatId, messageId) => (file) => {
    if (!file?.local || !file?.size) return
    sendToRenderer('tg:media-progress', {
      chatId,
      messageId: String(messageId),
      bytes: Number(file.local.downloaded_size) || 0,
      total: Number(file.size) || 0,
    })
  }
  handle('tg:download-media', ({ chatId, messageId, thumb } = {}) =>
    backend.media.download({
      chatId, msgId: messageId, thumb,
      onProgress: makeProgressCallback(chatId, messageId),
    }))
  handle('tg:download-video', ({ chatId, messageId } = {}) =>
    backend.media.downloadVideo({
      chatId, msgId: messageId,
      onProgress: makeProgressCallback(chatId, messageId),
    }))
  // v0.89.16: качаем ТОЛЬКО превью (thumbnail JPEG ~10-100 КБ) для постера.
  // Используется VideoTile.jsx + MediaAlbum.jsx при монтировании. Без этого
  // канала постеры качались как полные видео (десятки МБ в фон на каждое
  // сообщение) — см. ловушка #10 в mistakes/tdlib-video-player.md.
  handle('tg:download-thumbnail', ({ chatId, messageId } = {}) =>
    backend.media.downloadThumbnail({
      chatId, msgId: messageId,
      onProgress: makeProgressCallback(chatId, messageId),
    }))

  // ────────────────────────────────────────────────────────────────────
  // FORUM
  // ────────────────────────────────────────────────────────────────────

  // v0.89.24: diagnostic — расследование почему forum-чаты не показывают темы.
  handle('tg:get-forum-topics', async ({ chatId, limit } = {}) => {
    console.log('[forum-ipc] tg:get-forum-topics chatId=' + chatId + ' limit=' + limit)
    const result = await backend.forum.getTopics(chatId, limit)
    console.log('[forum-ipc] result ok=' + !!result?.ok +
      ' isForum=' + !!result?.isForum +
      ' topicsCount=' + (result?.topics?.length || 0) +
      ' error=' + (result?.error || 'none'))
    return result
  })

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
