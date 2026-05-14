// v0.87.85: IPC handlers по сообщениям + NewMessage event listener.
// Извлечён из telegramHandler.js (Шаг 7/7 разбиения).
// v0.87.111: downloadSenderAvatarsInBackground — скачивает аватарки отправителей
// группового чата после загрузки сообщений (loadAvatarsAsync покрывает только диалоги).
import { ipcMain } from 'electron'

import fs from 'node:fs'
import path from 'node:path'
import { NewMessage } from 'telegram/events/index.js'
import { state, chatEntityMap, maxOutgoingRead, lastPerChatSync, log, emit, Api, getClientForChat, getAccountForChat } from './telegramState.js'
// v0.87.118: mapMessage + messagePreview вынесены в отдельный файл (достигли лимита 500 строк)
import { mapMessage, messagePreview } from './telegramMessageMapper.js'
export { mapMessage, messagePreview }  // re-export для обратной совместимости импортеров

// v0.87.35: точный sync unreadCount для одного чата через GetPeerDialogs
// v0.87.105 (ADR-016): client передаётся явно (multi-account).
// Backward-compat: без второго аргумента — берём по chatId через getClientForChat.
async function syncPerChatUnread(chatId, client) {
  try {
    const last = lastPerChatSync.get(chatId) || 0
    if (Date.now() - last < 3000) return  // не чаще раз в 3 сек на чат
    lastPerChatSync.set(chatId, Date.now())
    const entity = chatEntityMap.get(chatId)
    const tgClient = client || getClientForChat(chatId)
    if (!entity || !tgClient) return
    const dialog = await tgClient.invoke(new Api.messages.GetPeerDialogs({ peers: [new Api.InputDialogPeer({ peer: entity })] }))
    const d = dialog.dialogs?.[0]
    if (d) emit('tg:chat-unread-sync', { chatId, unreadCount: d.unreadCount || 0 })
  } catch (e) { /* silent */ }
}

// v0.87.111: фоновая загрузка аватарок отправителей группового чата.
// loadAvatarsAsync обрабатывает только диалоги (чаты из списка), но не участников групп.
// Вызывается после tg:get-messages без await — не блокирует UI.
// Скачанные аватарки эмитируют tg:sender-avatar → фронт обновляет senderAvatar в сообщениях.
async function downloadSenderAvatarsInBackground(msgs, chatId, client) {
  if (!client || !state.avatarsDir) return
  // Собираем уникальных отправителей (не исходящих) без кэша аватарки
  const senderMap = new Map()
  for (const m of msgs) {
    if (m.out) continue
    const senderId = String(m.senderId || m.fromId?.userId || '')
    if (!senderId || senderMap.has(senderId) || !m.sender) continue
    if (!fs.existsSync(path.join(state.avatarsDir, `${senderId}.jpg`))) senderMap.set(senderId, m.sender)
  }
  if (senderMap.size === 0) return
  log(`sender avatars: скачиваем ${senderMap.size} отправителей для chat=${chatId}`)
  let lastReqTs = 0
  for (const [senderId, sender] of senderMap) {
    try {
      const wait = Math.max(0, 200 - (Date.now() - lastReqTs))
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      lastReqTs = Date.now()
      // Если у User нет photo в базовом entity — берём полный профиль через GetFullUser
      // (то же что loadAvatarsAsync делает для диалогов — иначе downloadProfilePhoto вернёт null)
      let resolvedSender = sender
      if (!sender?.photo || sender.photo?.className === 'UserProfilePhotoEmpty') {
        try {
          const full = await client.invoke(new Api.users.GetFullUser({ id: sender }))
          const fullUser = full.users?.find(u => String(u.id) === senderId) || full.users?.[0]
          if (fullUser?.photo && fullUser.photo?.className !== 'UserProfilePhotoEmpty') {
            resolvedSender = fullUser
            log(`sender avatar GetFullUser OK: ${senderId} photo=${fullUser.photo?.className}`)
          } else {
            log(`sender avatar no-photo: ${senderId}`)
            continue
          }
        } catch (fe) { log(`sender avatar GetFullUser err: ${senderId} ${fe.message}`); continue }
      }
      const buffer = await client.downloadProfilePhoto(resolvedSender, { isBig: false })
      if (!buffer || buffer.length === 0) { log(`sender avatar empty-buffer: ${senderId}`); continue }
      const avatarPath = path.join(state.avatarsDir, `${senderId}.jpg`)
      fs.writeFileSync(avatarPath, buffer)
      const avatarUrl = `cc-media://avatars/${encodeURIComponent(senderId + '.jpg')}`
      emit('tg:sender-avatar', { chatId, senderId, avatarUrl })
      log(`sender avatar OK: ${senderId}`)
    } catch (e) {
      const flood = String(e?.message || '').match(/FLOOD_WAIT.*?(\d+)/)
      if (flood) {
        const sec = Number(flood[1]) || 30
        log(`sender avatar FLOOD_WAIT ${sec}s`)
        await new Promise(r => setTimeout(r, (sec + 1) * 1000))
      } else {
        log(`sender avatar err: ${senderId} ${e.message}`)
      }
    }
  }
}

// v0.87.85: NewMessage event listener — главный канал входящих в реальном времени.
// v0.87.105 (ADR-016): принимает (client, accountId) — multi-account.
// Вызывается ПОСЛЕ успешного login / connect для КАЖДОГО клиента в state.clients.
// Если забыть привязать — входящие на этом аккаунте не приходят.
// Backward-compat: если вызвано без аргументов, использует state.client + state.activeAccountId.
export function attachMessageListener(client, accountId) {
  const tgClient = client || state.client
  const aid = accountId || state.activeAccountId || state.currentAccount?.id
  if (!tgClient || !aid) return
  try {
    tgClient.addEventHandler(async (event) => {
      try {
        const m = event.message
        if (!m) return
        const chatIdRaw = String(m.chatId || m.peerId?.userId || m.peerId?.chatId || m.peerId?.channelId || '')
        const chatId = `${aid}:${chatIdRaw}`
        emit('tg:new-message', { chatId, message: mapMessage(m, chatId) })
        // v0.87.35: точный sync unreadCount для этого чата через GetPeerDialogs
        // (чтобы UI показывал реальное число сразу, не ждал mark-read / periodic rescan)
        setTimeout(() => syncPerChatUnread(chatId, tgClient), 600)
      } catch (e) { log('new-message handler err: ' + e.message) }
    }, new NewMessage({}))

    // v0.87.14: raw updates — typing + read receipts
    tgClient.addEventHandler((update) => {
      try {
        const cn = update?.className
        // Typing: UpdateUserTyping / UpdateChatUserTyping / UpdateChannelUserTyping
        if (cn === 'UpdateUserTyping' || cn === 'UpdateChatUserTyping' || cn === 'UpdateChannelUserTyping') {
          const userIdRaw = String(update.userId || update.fromId?.userId || '')
          const chatIdRaw = String(update.chatId || update.channelId || update.userId || '')
          const chatId = `${aid}:${chatIdRaw}`
          const isTyping = update.action?.className === 'SendMessageTypingAction'
          emit('tg:typing', { chatId, userId: userIdRaw, typing: isTyping })
        }
        // Read receipts (собеседник прочитал наши сообщения) — для галочек ✓✓
        if (cn === 'UpdateReadHistoryOutbox' || cn === 'UpdateReadChannelOutbox') {
          const chatIdRaw = String(update.peer?.userId || update.peer?.chatId || update.channelId || '')
          const chatId = `${aid}:${chatIdRaw}`
          const maxId = Number(update.maxId || 0)
          maxOutgoingRead.set(chatId, Math.max(maxOutgoingRead.get(chatId) || 0, maxId))
          emit('tg:read', { chatId, maxId, outgoing: true })
          log(`outgoing read: chat=${chatId} maxId=${maxId}`)
        }
        // Read inbox (мы прочитали)
        if (cn === 'UpdateReadHistoryInbox' || cn === 'UpdateReadChannelInbox') {
          const chatIdRaw = String(update.peer?.userId || update.peer?.chatId || update.channelId || '')
          const chatId = `${aid}:${chatIdRaw}`
          emit('tg:read', { chatId, maxId: Number(update.maxId || 0), outgoing: false, stillUnread: Number(update.stillUnreadCount || 0) })
        }
      } catch (e) { /* silent */ }
    })
    log(`event handler + raw updates attached (${aid})`)
  } catch (e) { log('attach listener err: ' + e.message) }
}

export function initMessagesHandlers() {
  // v0.87.16: отправка картинки из буфера обмена (Ctrl+V)
  // v0.87.105 (ADR-016): client определяется по chatId (multi-account)
  ipcMain.handle('tg:send-clipboard-image', async (_, { chatId, data, ext }) => {
    log(`send-clipboard-image: chat=${chatId} bytes=${data?.length} ext=${ext}`)
    try {
      const client = getClientForChat(chatId)
      if (!client) { log('send-clipboard: client null'); return { ok: false, error: 'Не подключён' } }
      const tmpDir = path.join(path.dirname(state.cachePath), 'tg-tmp')
      try { fs.mkdirSync(tmpDir, { recursive: true }) } catch(_) {}
      const tmpFile = path.join(tmpDir, `clip_${Date.now()}.${ext}`)
      fs.writeFileSync(tmpFile, Buffer.from(data))
      log(`send-clipboard: saved tmp ${tmpFile}`)
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      await client.sendFile(entity, { file: tmpFile })
      log(`send-clipboard: sent OK`)
      try { fs.unlinkSync(tmpFile) } catch(_) {}
      return { ok: true }
    } catch (e) { log('send-clipboard err: ' + e.message); return { ok: false, error: e.message } }
  })

  ipcMain.handle('tg:send-file', async (_, { chatId, filePath, caption }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const result = await client.sendFile(entity, { file: filePath, caption: caption || '' })
      return { ok: true, messageId: String(result.id) }
    } catch (e) {
      log('send-file err: ' + e.message)
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('tg:forward', async (_, { fromChatId, toChatId, messageId }) => {
    log(`forward: ${fromChatId} → ${toChatId} msgId=${messageId}`)
    try {
      // v0.87.105: ВАЖНО — forward между аккаунтами невозможен (другой client),
      // поэтому используем client отправляющего чата (fromChatId)
      const client = getClientForChat(fromChatId)
      if (!client) return { ok: false, error: 'Не подключён' }
      const fromAcc = String(fromChatId).split(':')[0]
      const toAcc = String(toChatId).split(':')[0]
      if (fromAcc !== toAcc) return { ok: false, error: 'Пересылка между разными аккаунтами не поддерживается' }
      const fromEntity = chatEntityMap.get(fromChatId) || String(fromChatId).split(':').pop()
      const toEntity = chatEntityMap.get(toChatId) || String(toChatId).split(':').pop()
      await client.forwardMessages(toEntity, { messages: [Number(messageId)], fromPeer: fromEntity })
      log(`forward: OK`)
      return { ok: true }
    } catch (e) { log('forward err: ' + e.message); return { ok: false, error: e.message } }
  })

  // v0.87.15: messages с типом медиа и возможностью дозагрузки вверх (offsetId)
  // v0.88.0: afterId — догрузка НОВЫХ сообщений вниз (Telegram MTProto min_id).
  // Используется в Telegram-style infinite scroll down: после прочтения последних
  // загруженных сообщений берём следующую пачку из 100 по min_id = afterId.
  ipcMain.handle('tg:get-messages', async (_, { chatId, limit = 50, offsetId = 0, aroundId = 0, addOffset, afterId = 0 }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, error: 'Не подключён', messages: [] }
      // v0.87.117: диагностика «1 сообщение в чате» — логируем источник entity и кол-во
      const hasMapEntity = chatEntityMap.has(chatId)
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      if (!hasMapEntity) log(`get-messages WARN: entity-fallback chat=${chatId} mapSize=${chatEntityMap.size}`)
      state.msgRequestTs = Date.now()  // v0.87.118: сигнал loadAvatarsAsync — уступи канал
      const effectiveOffsetId = Number(aroundId || offsetId) || 0
      const numAfterId = Number(afterId) || 0
      const numLimit = Number(limit) || 50
      // v0.88.0: догрузка вниз через min_id. offset_id=0 + add_offset=-limit
      // даёт окно из limit сообщений с id > afterId (новее).
      const request = numAfterId
        ? { limit: numLimit, offsetId: 0, minId: numAfterId, addOffset: -numLimit }
        : { limit: numLimit, offsetId: effectiveOffsetId }
      if (!numAfterId && aroundId) request.addOffset = Number.isFinite(Number(addOffset)) ? Number(addOffset) : -Math.floor(numLimit / 3)
      const msgs = await client.getMessages(entity, request)
      log(`get-messages: chat=${chatId} got=${msgs.length}/${limit} hasEntity=${hasMapEntity} around=${aroundId || 0} after=${numAfterId} addOffset=${request.addOffset ?? ''}`)
      // v0.87.17: пытаемся узнать max outgoing read через getFullEntity (для галочек)
      try {
        const full = await client.invoke(
          entity.className === 'InputPeerUser' || entity.userId
            ? new Api.users.GetFullUser({ id: entity })
            : new Api.channels.GetFullChannel({ channel: entity })
        )
        const readOutboxMaxId = Number(full.fullUser?.pFlags?.readOutboxMaxId || full.fullChat?.readOutboxMaxId || 0)
        if (readOutboxMaxId) maxOutgoingRead.set(chatId, readOutboxMaxId)
      } catch(_) {}
      const readUpTo = maxOutgoingRead.get(chatId) || 0
      const messages = msgs.map(m => {
        const mapped = mapMessage(m, chatId)
        if (mapped.isOutgoing) mapped.isRead = Number(mapped.id) <= readUpTo
        return mapped
      }).reverse()
      // v0.88.1: при afterId-запросе с пустым массивом — НЕ эмитим, чтобы не дёргать UI.
      // Это типичный случай «конец чата достигнут» (новее ничего нет). Фронт сам ставит
      // флаг noMoreNewer по ok:true + hasMore:false и больше не зовёт prefetch для этого ключа.
      if (!(numAfterId && msgs.length === 0)) {
        emit('tg:messages', { chatId, messages, append: offsetId > 0 && !aroundId && !numAfterId, appendNewer: !!numAfterId, readUpTo, aroundId: Number(aroundId) || 0, afterId: numAfterId })
      }
      // v0.87.111: фоновая загрузка аватарок отправителей (без await — не блокирует UI)
      downloadSenderAvatarsInBackground(msgs, chatId, client).catch(() => {})
      return { ok: true, messages, hasMore: msgs.length >= limit, aroundId: Number(aroundId) || 0 }
    } catch (e) {
      const flood = String(e?.message || '').match(/FLOOD_WAIT.*?(\d+)/)
      log('get-messages err: ' + e.message + (flood ? ` [FLOOD_WAIT ${flood[1]}s]` : ''))
      return { ok: false, error: e.message, messages: [] }
    }
  })

  // v0.87.15: sendMessage с поддержкой reply
  // v0.87.105 (ADR-016): client по chatId — отправка от правильного аккаунта
  // v0.87.137: messages for selected Telegram forum topic/thread.
  // v0.88.0: afterId для догрузки новых сообщений темы вниз (Telegram min_id).
  // This keeps ordinary tg:get-messages behavior unchanged.
  ipcMain.handle('tg:get-topic-messages', async (_, { chatId, topicId, topMessageId, limit = 50, offsetId = 0, aroundId = 0, addOffset, afterId = 0 }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, error: 'Не подключён', messages: [] }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const msgId = Number(topicId || topMessageId)
      if (!msgId) return { ok: false, error: 'Не выбрана тема', messages: [] }
      state.msgRequestTs = Date.now()
      const numAfterId = Number(afterId) || 0
      const numLimit = Number(limit) || 50
      // v0.88.0: для afterId — offsetId=0 + minId=afterId + addOffset=-limit.
      // Без afterId — поведение как было (aroundId-окно или классическая пагинация вверх).
      const effectiveOffsetId = numAfterId ? 0 : (Number(aroundId || offsetId) || 0)
      const effectiveAddOffset = numAfterId
        ? -numLimit
        : (aroundId
          ? (Number.isFinite(Number(addOffset)) ? Number(addOffset) : -Math.floor(numLimit / 3))
          : 0)
      const res = await client.invoke(new Api.messages.GetReplies({
        peer: entity,
        msgId,
        offsetId: effectiveOffsetId,
        offsetDate: 0,
        addOffset: effectiveAddOffset,
        limit: numLimit,
        maxId: 0,
        minId: numAfterId,
        hash: 0,
      }))
      let rawMessages = (res.messages || []).filter(m => m.className !== 'MessageEmpty')
      let source = 'replies'
      if (rawMessages.length === 0) {
        const search = await client.invoke(new Api.messages.Search({
          peer: entity,
          q: '',
          topMsgId: msgId,
          filter: new Api.InputMessagesFilterEmpty(),
          minDate: 0,
          maxDate: 0,
          offsetId: effectiveOffsetId,
          addOffset: effectiveAddOffset,
          limit: numLimit,
          maxId: 0,
          minId: numAfterId,
          hash: 0,
        }))
        rawMessages = (search.messages || []).filter(m => m.className !== 'MessageEmpty')
        source = 'search-topMsgId'
      }
      log(`get-topic-messages: chat=${chatId} topic=${topicId || msgId} top=${msgId} source=${source} got=${rawMessages.length}/${limit} around=${aroundId || 0} after=${numAfterId} addOffset=${effectiveAddOffset}`)
      const messages = rawMessages.map(m => mapMessage(m, chatId)).reverse()
      // v0.88.0: для afterId эмитим как форум-тема через tg:messages с topic key.
      // v0.88.1: НЕ эмитим если пусто — избегаем дёрга UI при «конце темы».
      const emitKey = numAfterId && (topicId || msgId) ? `${chatId}:topic:${topicId || msgId}` : chatId
      if (numAfterId && messages.length > 0) {
        emit('tg:messages', { chatId: emitKey, messages, append: false, appendNewer: true, afterId: numAfterId })
      }
      downloadSenderAvatarsInBackground(rawMessages, chatId, client).catch(() => {})
      return { ok: true, messages, hasMore: rawMessages.length >= numLimit, aroundId: Number(aroundId) || 0, afterId: numAfterId }
    } catch (e) {
      const flood = String(e?.message || '').match(/FLOOD_WAIT.*?(\d+)/)
      log('get-topic-messages err: ' + e.message + (flood ? ` [FLOOD_WAIT ${flood[1]}s]` : ''))
      return { ok: false, error: e.message, messages: [] }
    }
  })

  ipcMain.handle('tg:send-message', async (_, { chatId, text, replyTo }) => {
    // v0.87.55: полные логи — ловим почему юзер нажимает "Отпр." а ничего не происходит
    log(`send-message START: chat=${chatId} len=${text?.length} replyTo=${replyTo || 'none'}`)
    try {
      const client = getClientForChat(chatId)
      if (!client) {
        log(`send-message FAIL: client=null for chat=${chatId}`)
        return { ok: false, error: 'Не подключён' }
      }
      const hasEntity = chatEntityMap.has(chatId)
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      log(`send-message: hasEntity=${hasEntity} entity=${hasEntity ? 'from-map' : 'fallback-id'}`)
      const params = { message: text }
      if (replyTo) params.replyTo = Number(replyTo)
      const result = await client.sendMessage(entity, params)
      log(`send-message OK: chat=${chatId} messageId=${result.id}`)
      // v0.87.59: emit tg:new-message с МИНИМАЛЬНЫМ корректным msg-объектом.
      // Раньше (v0.87.58) прогоняли result через mapMessage — но MTProto Message
      // содержит поля (peerId, fromId, nested senders), которые mapMessage обрабатывает
      // по-разному для in/out. Результат: у нас text рендерился в bubble, но поля
      // senderId/senderName были объектами/пустыми → группировка в messageGrouping
      // ломалась → native-msg-group-row не растягивался → bubble становился ~40px
      // ширины → каждая буква на своей строке. Теперь строим минимальный plain msg
      // строго по нашему формату (те же поля что у входящих).
      try {
        // v0.87.68: лог для диагностики link preview — видно что сервер вернул
        const resultMediaCn = result.media?.className || 'none'
        log(`send-message: result.media=${resultMediaCn} text.len=${(result.message || text).length}`)

        // v0.87.68: извлекаем webPage из result.media если Telegram распарсил ссылку.
        // Раньше mediaType был всегда null → LinkPreview в MessageBubble не рендерился.
        let mediaType = null
        let webPage = null
        if (result.media?.className === 'MessageMediaWebPage') {
          const wp = result.media.webpage
          if (wp && wp.className === 'WebPage') {
            mediaType = 'link'
            webPage = {
              url: wp.url || wp.displayUrl || '',
              title: wp.title || '',
              description: wp.description || '',
              siteName: wp.siteName || '',
              photoUrl: null,
            }
            log(`send-message: webPage title="${webPage.title}" site="${webPage.siteName}"`)
          }
        }

        // v0.87.105: используем аккаунт связанный с этим chatId (а не активный)
        const senderAccount = getAccountForChat(chatId) || state.currentAccount
        const myUserId = (senderAccount?.id || 'me').replace(/^tg_/, '')
        const msg = {
          id: String(result.id),
          chatId,
          senderId: myUserId,
          senderName: senderAccount?.name || '',
          text: text,  // используем исходный параметр, не result.message
          entities: [],
          timestamp: (result.date || Math.floor(Date.now() / 1000)) * 1000,
          // v0.87.65: localSentAt — client-time отправки (мс). Отличается от timestamp
          // (serverDate * 1000, секундная точность + задержка сервера). Используется
          // в MessageBubble для точного "msg был отправлен только что" — анимация
          // отправки стабильно срабатывает для каждого, не только через один.
          localSentAt: Date.now(),
          isOutgoing: true,
          isEdited: false,
          mediaType,
          webPage,  // v0.87.68: Link preview для отправленных ссылок
          replyToId: replyTo ? String(replyTo) : null,
          groupedId: null,
        }
        emit('tg:new-message', { chatId, message: msg })
        log(`send-message: emitted tg:new-message id=${msg.id} mediaType=${mediaType || 'text'}`)
      } catch (emitErr) {
        log(`send-message: emit tg:new-message failed: ${emitErr.message}`)
      }
      return { ok: true, messageId: String(result.id) }
    } catch (e) {
      log(`send-message ERROR: chat=${chatId} ${e.message} (${e.constructor?.name})`)
      return { ok: false, error: e.message }
    }
  })

  // v0.87.15: удаление сообщения
  ipcMain.handle('tg:delete-message', async (_, { chatId, messageId, forAll = true }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      await client.deleteMessages(entity, [Number(messageId)], { revoke: forAll })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.15: редактирование сообщения
  ipcMain.handle('tg:edit-message', async (_, { chatId, messageId, text }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      await client.editMessage(entity, { message: Number(messageId), text })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })
}
