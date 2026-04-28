// v0.87.85: IPC handlers по сообщениям + NewMessage event listener.
// Извлечён из telegramHandler.js (Шаг 7/7 разбиения).
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { NewMessage } from 'telegram/events/index.js'
import { strippedPhotoToJpg } from 'telegram/Utils.js'
import { state, chatEntityMap, maxOutgoingRead, lastPerChatSync, log, emit, Api, getClientForChat, getAccountForChat } from './telegramState.js'

// v0.87.24: stripped photo → data:URL для мгновенного превью (Вариант A)
// PhotoStrippedSize — 1-3КБ JPEG в минимальном формате (Telegram шлёт в самом сообщении)
function extractStrippedThumb(media) {
  try {
    const photo = media?.photo || media?.document
    if (!photo?.sizes && !photo?.thumbs) return null
    const sizes = photo.sizes || photo.thumbs || []
    const stripped = sizes.find(s => s.className === 'PhotoStrippedSize')
    if (!stripped?.bytes) return null
    const jpegBuffer = strippedPhotoToJpg(stripped.bytes)
    return 'data:image/jpeg;base64,' + Buffer.from(jpegBuffer).toString('base64')
  } catch (_) { return null }
}

// v0.87.23: маппер entities MTProto → наш формат. Telegram шлёт entities
// отдельным массивом от text. Типы: Bold, Italic, Code, Pre, Url, TextUrl,
// Mention, Hashtag, BotCommand, Email, Phone, Strike, Underline, Spoiler.
function mapEntities(entities) {
  if (!Array.isArray(entities)) return []
  return entities.map(e => ({
    type: (e.className || '').replace(/^MessageEntity/, '').toLowerCase(),
    offset: e.offset || 0,
    length: e.length || 0,
    url: e.url || null,
    userId: e.userId ? String(e.userId) : null,
    language: e.language || null,
  }))
}

// v0.87.15: маппер message → наш формат с поддержкой медиа + reply + entities
export function mapMessage(m, chatId) {
  const media = m.media
  let mediaType = null, mediaPreview = null, strippedThumb = null, mediaWidth = null, mediaHeight = null
  let webPage = null
  let duration = null, fileSize = null  // v0.87.34: для video
  if (media) {
    const cn = media.className
    if (cn === 'MessageMediaPhoto') {
      mediaType = 'photo'
      strippedThumb = extractStrippedThumb(media)
      const photo = media.photo
      const largest = photo?.sizes?.filter(s => s.w && s.h).sort((a, b) => (b.w * b.h) - (a.w * a.h))[0]
      if (largest) { mediaWidth = largest.w; mediaHeight = largest.h }
    }
    else if (cn === 'MessageMediaDocument') {
      const mime = media.document?.mimeType || ''
      if (mime.startsWith('video/')) mediaType = 'video'
      else if (mime.startsWith('audio/')) mediaType = 'audio'
      else if (mime.startsWith('image/')) mediaType = 'photo'
      else mediaType = 'file'
      mediaPreview = media.document?.attributes?.find(a => a.fileName)?.fileName || 'файл'
      strippedThumb = extractStrippedThumb(media)
      // v0.87.34: извлекаем duration + dimensions для video
      const videoAttr = media.document?.attributes?.find(a => a.className === 'DocumentAttributeVideo')
      if (videoAttr) {
        mediaWidth = Number(videoAttr.w) || null
        mediaHeight = Number(videoAttr.h) || null
        duration = Number(videoAttr.duration) || null
      }
      const audioAttr = media.document?.attributes?.find(a => a.className === 'DocumentAttributeAudio')
      if (audioAttr) duration = Number(audioAttr.duration) || null
      fileSize = Number(media.document?.size) || null
    }
    else if (cn === 'MessageMediaWebPage') {
      mediaType = 'link'
      // v0.87.27: полноценное превью ссылки — title/description/siteName/photo
      const wp = media.webpage
      if (wp && wp.className === 'WebPage') {
        webPage = {
          url: wp.url || wp.displayUrl || '',
          title: wp.title || '',
          description: wp.description || '',
          siteName: wp.siteName || '',
          photoUrl: null,
        }
      }
    }
    else if (cn === 'MessageMediaGeo') { mediaType = 'location' }
    else if (cn === 'MessageMediaContact') { mediaType = 'contact' }
    else if (cn === 'MessageMediaPoll') { mediaType = 'poll' }
    else mediaType = 'other'
  }
  return {
    id: String(m.id),
    chatId,
    senderId: String(m.senderId || ''),
    senderName: m.sender?.firstName || m.sender?.title || '',
    text: m.message || '',
    entities: mapEntities(m.entities),
    timestamp: (m.date || 0) * 1000,
    isOutgoing: !!m.out,
    isEdited: !!m.editDate,
    mediaType,
    mediaPreview,
    strippedThumb,  // v0.87.24: мгновенное размытое превью (data:URL)
    mediaWidth, mediaHeight,
    webPage,  // v0.87.27: превью ссылки
    duration, fileSize,  // v0.87.34: для video/audio
    // v0.87.29: groupedId — несколько медиа в одном сообщении (альбом)
    groupedId: m.groupedId ? String(m.groupedId) : null,
    replyToId: m.replyTo?.replyToMsgId ? String(m.replyTo.replyToMsgId) : null,
  }
}

// v0.87.28: плашка для сообщений без текста (медиа/сервисные)
export function messagePreview(m) {
  if (!m) return ''
  if (m.message) return m.message
  // Service/action messages
  const action = m.action
  if (action) {
    const cn = action.className
    if (cn === 'MessageActionChatAddUser') return '👤 добавлен участник'
    if (cn === 'MessageActionChatDeleteUser') return '👤 участник вышел'
    if (cn === 'MessageActionChatJoinedByLink') return '👤 присоединился по ссылке'
    if (cn === 'MessageActionPinMessage') return '📌 закреплено сообщение'
    if (cn === 'MessageActionChannelCreate') return '📢 канал создан'
    if (cn === 'MessageActionChatEditPhoto') return '🖼 фото чата изменено'
    if (cn === 'MessageActionChatEditTitle') return '✏️ название чата изменено'
    if (cn === 'MessageActionPhoneCall') return '📞 звонок'
    return '⚙️ служебное сообщение'
  }
  // Media messages
  const media = m.media
  if (media) {
    const cn = media.className
    if (cn === 'MessageMediaPhoto') return '🖼 Фото'
    if (cn === 'MessageMediaDocument') {
      const mime = media.document?.mimeType || ''
      const fname = media.document?.attributes?.find(a => a.fileName)?.fileName
      if (mime.startsWith('video/')) return '📹 Видео'
      if (mime.startsWith('audio/')) return '🎵 Аудио'
      if (mime.startsWith('image/')) return '🖼 Фото'
      if (media.document?.attributes?.some(a => a.className === 'DocumentAttributeSticker')) return '🎴 Стикер'
      if (media.document?.attributes?.some(a => a.className === 'DocumentAttributeVideo' && a.roundMessage)) return '⭕ Видеосообщение'
      if (media.document?.attributes?.some(a => a.className === 'DocumentAttributeAudio' && a.voice)) return '🎤 Голосовое'
      return `📎 ${fname || 'Файл'}`
    }
    if (cn === 'MessageMediaGeo' || cn === 'MessageMediaGeoLive') return '📍 Геолокация'
    if (cn === 'MessageMediaContact') return '👤 Контакт'
    if (cn === 'MessageMediaPoll') return '📊 Опрос'
    if (cn === 'MessageMediaWebPage') return '🔗 Ссылка'
    if (cn === 'MessageMediaGame') return '🎮 Игра'
    if (cn === 'MessageMediaInvoice') return '💳 Оплата'
    return '📎 вложение'
  }
  return ''
}

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
  ipcMain.handle('tg:get-messages', async (_, { chatId, limit = 50, offsetId = 0 }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, error: 'Не подключён', messages: [] }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const msgs = await client.getMessages(entity, { limit, offsetId })
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
      emit('tg:messages', { chatId, messages, append: offsetId > 0, readUpTo })
      return { ok: true, messages, hasMore: msgs.length >= limit }
    } catch (e) {
      log('get-messages err: ' + e.message)
      return { ok: false, error: e.message, messages: [] }
    }
  })

  // v0.87.15: sendMessage с поддержкой reply
  // v0.87.105 (ADR-016): client по chatId — отправка от правильного аккаунта
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
