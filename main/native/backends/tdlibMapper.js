// v0.89.0 — Stage 4 / Этап 2.1: TDLib mapper (message/chat/entities → наш формат)
//
// Конвертирует TDLib JSON-API объекты в формат который рендерит UI:
//   - mapMessage(tdMsg, chatId, { senderName?, senderAvatar? }) → NativeMessage
//   - mapChat(tdChat, accountId, { avatar?, isOnline? }) → Chat
//   - mapEntities(tdEntities) → entities[]
//   - messagePreview(tdMsg) → string (плашка для списка чатов)
//
// СТРУКТУРА TDLib message (см. https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message.html):
//   {
//     '@type': 'message',
//     id, chat_id, sender_id, is_outgoing, date (unix seconds), edit_date,
//     media_album_id (string '0' = нет альбома), reply_to, forward_info,
//     content: { '@type': 'messageText' | 'messagePhoto' | ... }
//   }
//
// TDLib formattedText:  { '@type': 'formattedText', text, entities: textEntity[] }
// TDLib textEntity:     { '@type': 'textEntity', offset, length, type: { '@type': 'textEntityTypeBold' | ... } }
//
// senderName + senderAvatar НЕ извлекаются из tdMsg напрямую (TDLib хранит users/chats
// отдельно от messages — синхронизируются через updateUser / updateChat events).
// Эти поля передаются опционально через `extras` параметр — заполняются на стороне
// tdlibClientManager (Этап 2.2), который держит user/chat cache.

// ──────────────────────────────────────────────────────────────────────────
// ENTITIES
// ──────────────────────────────────────────────────────────────────────────

// Маппинг TDLib textEntityType → наш формат (строки-теги совместимые с GramJS).
// GramJS использует lowercase без префикса (см. main/native/telegramMessageMapper.js
// → mapEntities: e.className.replace(/^MessageEntity/, '').toLowerCase()).
const TDLIB_ENTITY_TYPE_MAP = {
  textEntityTypeBold: 'bold',
  textEntityTypeItalic: 'italic',
  textEntityTypeUnderline: 'underline',
  textEntityTypeStrikethrough: 'strike',
  textEntityTypeSpoiler: 'spoiler',
  textEntityTypeCode: 'code',
  textEntityTypePre: 'pre',
  textEntityTypePreCode: 'pre',
  textEntityTypeUrl: 'url',
  textEntityTypeTextUrl: 'texturl',
  textEntityTypeEmailAddress: 'email',
  textEntityTypePhoneNumber: 'phone',
  textEntityTypeMention: 'mention',
  textEntityTypeMentionName: 'mentionname',
  textEntityTypeHashtag: 'hashtag',
  textEntityTypeCashtag: 'cashtag',
  textEntityTypeBotCommand: 'botcommand',
  textEntityTypeBankCardNumber: 'bankcardnumber',
  textEntityTypeBlockQuote: 'blockquote',
  textEntityTypeExpandableBlockQuote: 'blockquote',
  textEntityTypeCustomEmoji: 'customemoji',
  textEntityTypeMediaTimestamp: 'mediatimestamp',
}

export function mapEntities(tdEntities) {
  if (!Array.isArray(tdEntities)) return []
  return tdEntities.map(e => {
    const typeName = e?.type?.['@type'] || ''
    return {
      type: TDLIB_ENTITY_TYPE_MAP[typeName] || typeName.replace(/^textEntityType/, '').toLowerCase(),
      offset: Number(e.offset) || 0,
      length: Number(e.length) || 0,
      url: e.type?.url || null,
      userId: e.type?.user_id != null ? String(e.type.user_id) : null,
      language: e.type?.language || null,
    }
  })
}

// ──────────────────────────────────────────────────────────────────────────
// MEDIA — внутри messageContent
// ──────────────────────────────────────────────────────────────────────────

// TDLib minithumbnail: { width, height, data: base64 string } — мгновенное превью.
// Возвращает 'data:image/jpeg;base64,...' или null.
function extractMinithumbnail(content) {
  // photo/document/video имеют minithumbnail на разных уровнях:
  //   messagePhoto.photo.minithumbnail
  //   messageVideo.video.minithumbnail
  //   messageDocument.document.minithumbnail
  //   messageAnimation.animation.minithumbnail
  const sources = [
    content?.photo?.minithumbnail,
    content?.video?.minithumbnail,
    content?.document?.minithumbnail,
    content?.animation?.minithumbnail,
    content?.audio?.album_cover_minithumbnail,
    content?.sticker?.thumbnail?.minithumbnail,
  ]
  for (const mini of sources) {
    if (mini?.data) return 'data:image/jpeg;base64,' + mini.data
  }
  return null
}

// Выделяем largest size фото для известных width/height.
function extractPhotoDimensions(content) {
  const photo = content?.photo
  if (!photo?.sizes?.length) return { width: null, height: null }
  const largest = photo.sizes.reduce((a, b) => {
    const aArea = (a.width || 0) * (a.height || 0)
    const bArea = (b.width || 0) * (b.height || 0)
    return bArea > aArea ? b : a
  })
  return { width: Number(largest.width) || null, height: Number(largest.height) || null }
}

// Определяем mediaType + связанные поля из tdMsg.content.
function extractMediaInfo(content) {
  if (!content) return { mediaType: null, info: {} }
  const cn = content['@type']
  const out = { mediaType: null, info: {} }

  if (cn === 'messageText') {
    // Текстовое сообщение. Если есть web_page — это link preview.
    if (content.web_page) {
      const wp = content.web_page
      out.mediaType = 'link'
      out.info.webPage = {
        url: wp.url || wp.display_url || '',
        title: wp.title || '',
        description: wp.description?.text || wp.description || '',
        siteName: wp.site_name || '',
        photoUrl: null,
      }
    }
    return out
  }

  if (cn === 'messagePhoto') {
    out.mediaType = 'photo'
    const dim = extractPhotoDimensions(content)
    out.info.mediaWidth = dim.width
    out.info.mediaHeight = dim.height
    return out
  }

  if (cn === 'messageVideo') {
    out.mediaType = 'video'
    out.info.mediaWidth = Number(content.video?.width) || null
    out.info.mediaHeight = Number(content.video?.height) || null
    out.info.duration = Number(content.video?.duration) || null
    out.info.fileSize = Number(content.video?.video?.size) || null
    out.info.mediaPreview = content.video?.file_name || null
    return out
  }

  if (cn === 'messageAudio') {
    out.mediaType = 'audio'
    out.info.duration = Number(content.audio?.duration) || null
    out.info.fileSize = Number(content.audio?.audio?.size) || null
    out.info.mediaPreview = content.audio?.file_name || content.audio?.title || null
    return out
  }

  if (cn === 'messageVoiceNote') {
    out.mediaType = 'voice'
    out.info.duration = Number(content.voice_note?.duration) || null
    out.info.fileSize = Number(content.voice_note?.voice?.size) || null
    return out
  }

  if (cn === 'messageVideoNote') {
    out.mediaType = 'videonote'
    out.info.duration = Number(content.video_note?.duration) || null
    out.info.fileSize = Number(content.video_note?.video?.size) || null
    return out
  }

  if (cn === 'messageAnimation') {
    // GIF — отдаём как video (с duration), UI рендерит одинаково
    out.mediaType = 'video'
    out.info.mediaWidth = Number(content.animation?.width) || null
    out.info.mediaHeight = Number(content.animation?.height) || null
    out.info.duration = Number(content.animation?.duration) || null
    out.info.fileSize = Number(content.animation?.animation?.size) || null
    return out
  }

  if (cn === 'messageDocument') {
    const mime = content.document?.mime_type || ''
    if (mime.startsWith('image/')) out.mediaType = 'photo'
    else if (mime.startsWith('video/')) out.mediaType = 'video'
    else if (mime.startsWith('audio/')) out.mediaType = 'audio'
    else out.mediaType = 'file'
    out.info.mediaPreview = content.document?.file_name || 'файл'
    out.info.fileSize = Number(content.document?.document?.size) || null
    return out
  }

  if (cn === 'messageSticker') {
    out.mediaType = 'other'  // UI не имеет специального рендера для стикеров — общий
    out.info.mediaWidth = Number(content.sticker?.width) || null
    out.info.mediaHeight = Number(content.sticker?.height) || null
    return out
  }

  if (cn === 'messageLocation' || cn === 'messageVenue') { out.mediaType = 'location'; return out }
  if (cn === 'messageContact') { out.mediaType = 'contact'; return out }
  if (cn === 'messagePoll') { out.mediaType = 'poll'; return out }
  if (cn === 'messageGame') { out.mediaType = 'other'; return out }
  if (cn === 'messageInvoice') { out.mediaType = 'other'; return out }

  // Сервисные сообщения (messageChatAddMembers, messagePinMessage и т.п.) —
  // mediaType остаётся null, текст формируется в messagePreview.
  out.mediaType = null
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// SENDER + REPLY + FORWARD
// ──────────────────────────────────────────────────────────────────────────

function extractSenderId(tdMsg) {
  const s = tdMsg?.sender_id
  if (!s) return ''
  if (s['@type'] === 'messageSenderUser') return String(s.user_id || '')
  if (s['@type'] === 'messageSenderChat') return String(s.chat_id || '')
  return ''
}

function extractReplyToId(tdMsg) {
  const r = tdMsg?.reply_to
  if (!r) return null
  if (r['@type'] === 'messageReplyToMessage' && r.message_id) return String(r.message_id)
  return null
}

function extractFwdFrom(tdMsg) {
  const fi = tdMsg?.forward_info
  if (!fi) return null
  const origin = fi.origin || {}
  const cn = origin['@type'] || ''
  let name = ''
  let id = ''
  if (cn === 'messageOriginUser' && origin.sender_user_id) {
    id = String(origin.sender_user_id)
  } else if (cn === 'messageOriginChat' && origin.sender_chat_id) {
    id = String(origin.sender_chat_id)
    name = origin.author_signature || ''
  } else if (cn === 'messageOriginChannel' && origin.chat_id) {
    id = String(origin.chat_id)
    name = origin.author_signature || ''
  } else if (cn === 'messageOriginHiddenUser') {
    name = origin.sender_name || ''
  }
  return { name, id }
}

// ──────────────────────────────────────────────────────────────────────────
// MAIN: mapMessage
// ──────────────────────────────────────────────────────────────────────────

/**
 * Конвертирует TDLib message в NativeMessage.
 *
 * @param {object} tdMsg — TDLib message объект (`@type: 'message'`)
 * @param {string} chatId — наш составной id `${accountId}:${tdMsg.chat_id}`
 * @param {object} [extras] — { senderName, senderAvatar } из user/chat cache
 * @returns {object} NativeMessage
 */
export function mapMessage(tdMsg, chatId, extras = {}) {
  if (!tdMsg) return null
  const content = tdMsg.content || {}

  // Текст / caption
  const formattedText = content.text || content.caption || null
  const text = formattedText?.text || ''
  const entities = mapEntities(formattedText?.entities)

  const media = extractMediaInfo(content)
  const strippedThumb = extractMinithumbnail(content)

  // groupedId: TDLib даёт media_album_id как string. '0' означает «не в альбоме».
  const albumIdRaw = tdMsg.media_album_id
  const groupedId = (albumIdRaw && albumIdRaw !== '0') ? String(albumIdRaw) : null

  return {
    id: String(tdMsg.id),
    chatId,
    senderId: extractSenderId(tdMsg),
    senderName: extras.senderName || '',
    senderAvatar: extras.senderAvatar || null,
    text,
    entities,
    timestamp: (Number(tdMsg.date) || 0) * 1000,
    isOutgoing: !!tdMsg.is_outgoing,
    isEdited: !!(tdMsg.edit_date && Number(tdMsg.edit_date) > 0),
    mediaType: media.mediaType,
    mediaPreview: media.info.mediaPreview || null,
    strippedThumb,
    mediaWidth: media.info.mediaWidth || null,
    mediaHeight: media.info.mediaHeight || null,
    webPage: media.info.webPage || null,
    duration: media.info.duration || null,
    fileSize: media.info.fileSize || null,
    groupedId,
    replyToId: extractReplyToId(tdMsg),
    fwdFrom: extractFwdFrom(tdMsg),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MAIN: mapChat
// ──────────────────────────────────────────────────────────────────────────

/**
 * Конвертирует TDLib chat в Chat.
 *
 * @param {object} tdChat — TDLib chat объект (`@type: 'chat'`)
 * @param {string} accountId — например 'tg_638454350' (из state.accounts)
 * @param {object} [extras] — { avatar, isOnline, isBot, verified } из user/photo cache
 * @returns {object} Chat
 */
export function mapChat(tdChat, accountId, extras = {}) {
  if (!tdChat || !accountId) return null
  const type = tdChat.type || {}
  const cn = type['@type'] || ''
  let chatKind = 'user'
  let rawId = String(tdChat.id)
  let isForum = false

  if (cn === 'chatTypePrivate' || cn === 'chatTypeSecret') {
    chatKind = 'user'
  } else if (cn === 'chatTypeBasicGroup') {
    chatKind = 'group'
  } else if (cn === 'chatTypeSupergroup') {
    chatKind = type.is_channel ? 'channel' : 'group'
    isForum = !!type.is_forum
  }

  const muteFor = Number(tdChat.notification_settings?.mute_for || 0)
  const muteUntil = muteFor > 0 ? Math.floor(Date.now() / 1000) + muteFor : 0

  return {
    id: `${accountId}:${rawId}`,
    accountId,
    title: tdChat.title || 'Без названия',
    type: chatKind,
    lastMessage: messagePreview(tdChat.last_message),
    lastMessageTs: tdChat.last_message?.date ? Number(tdChat.last_message.date) * 1000 : 0,
    unreadCount: Number(tdChat.unread_count) || 0,
    readInboxMaxId: Number(tdChat.last_read_inbox_message_id) || 0,
    rawId,
    hasPhoto: !!tdChat.photo,
    avatar: extras.avatar || null,
    isOnline: !!extras.isOnline,
    isBot: !!extras.isBot,
    verified: !!extras.verified,
    isMuted: muteUntil > Math.floor(Date.now() / 1000),
    muteUntil,
    isForum,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// MESSAGE PREVIEW — для списка чатов
// ──────────────────────────────────────────────────────────────────────────

/**
 * Возвращает текстовое представление сообщения для plashka в списке чатов.
 * Аналог `messagePreview` из telegramMessageMapper.js (GramJS), но для TDLib формата.
 *
 * @param {object} tdMsg — TDLib message (или null/undefined)
 * @returns {string}
 */
export function messagePreview(tdMsg) {
  if (!tdMsg) return ''
  const content = tdMsg.content || {}
  const cn = content['@type'] || ''

  // Текстовое сообщение или сообщение с caption
  const ftext = content.text || content.caption
  if (ftext?.text) return ftext.text

  // Media-сообщения
  if (cn === 'messagePhoto') return '🖼 Фото'
  if (cn === 'messageVideo') return '📹 Видео'
  if (cn === 'messageAudio') return '🎵 Аудио'
  if (cn === 'messageVoiceNote') return '🎤 Голосовое'
  if (cn === 'messageVideoNote') return '⭕ Видеосообщение'
  if (cn === 'messageAnimation') return '📹 GIF'
  if (cn === 'messageSticker') return '🎴 Стикер'
  if (cn === 'messageDocument') {
    const fname = content.document?.file_name
    return `📎 ${fname || 'Файл'}`
  }
  if (cn === 'messageLocation' || cn === 'messageVenue') return '📍 Геолокация'
  if (cn === 'messageContact') return '👤 Контакт'
  if (cn === 'messagePoll') return '📊 Опрос'
  if (cn === 'messageGame') return '🎮 Игра'
  if (cn === 'messageInvoice') return '💳 Оплата'

  // Сервисные сообщения
  if (cn === 'messageChatAddMembers') return '👤 добавлен участник'
  if (cn === 'messageChatDeleteMember') return '👤 участник вышел'
  if (cn === 'messageChatJoinByLink') return '👤 присоединился по ссылке'
  if (cn === 'messagePinMessage') return '📌 закреплено сообщение'
  if (cn === 'messageChatChangePhoto') return '🖼 фото чата изменено'
  if (cn === 'messageChatChangeTitle') return '✏️ название чата изменено'
  if (cn === 'messageBasicGroupChatCreate' || cn === 'messageSupergroupChatCreate') return '📢 канал создан'
  if (cn === 'messageCall') return '📞 звонок'

  if (cn) return '⚙️ служебное сообщение'
  return ''
}
