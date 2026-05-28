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
// MEDIA — вынесено в tdlibMapperMedia.js (v0.89.34)
// ──────────────────────────────────────────────────────────────────────────

import { extractMinithumbnail, extractMediaInfo } from './tdlibMapperMedia.js'

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
    // v0.89.25: ловушка #24 — is_forum в TDLib хранится в supergroup объекте,
    // НЕ в chatTypeSupergroup. До v0.89.24 мы читали `type.is_forum` который
    // ВСЕГДА undefined → isForum=false для всех forum-чатов → панель тем
    // никогда не открывалась. Caller (tdlibClient.getAccountChats) теперь
    // передаёт supergroup через extras.
    isForum = !!extras.supergroup?.is_forum
    if (isForum) {
      // v0.91.4: расширенный лог — для диагностики «бейдж непрочитанных у forum-группы
      // пуст». Печатаем unread_count + unread_mention_count от TDLib, чтобы понять
      // что сервер шлёт для forum-чатов (агрегирует или 0).
      try {
        console.log('[forum-map] chatId=' + tdChat.id +
          ' title=' + JSON.stringify(tdChat.title || '') +
          ' is_forum=true' +
          ' unread_count=' + (tdChat.unread_count || 0) +
          ' unread_mention_count=' + (tdChat.unread_mention_count || 0))
      } catch (_) {}
    }
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
    // v0.95.11: lastMessageId — id последнего сообщения чата на сервере (для диагностики
    // gap между загруженным и сервером + потенциальный jump-to-end-of-chat).
    lastMessageId: tdChat.last_message?.id ? String(tdChat.last_message.id) : null,
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
