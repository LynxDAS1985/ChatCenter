// v0.87.118: вынесено из telegramMessages.js — маппер GramJS → наш формат.
// mapMessage, messagePreview и их helpers. Выделено т.к. telegramMessages.js достиг 500 строк.
// Импортируется: telegramChats.js (messagePreview), telegramChatsIpc.js (mapMessage),
//                telegramMessages.js (mapMessage внутри attachMessageListener + initHandlers).
import fs from 'node:fs'
import path from 'node:path'
import { strippedPhotoToJpg } from 'telegram/Utils.js'
import { state } from './telegramState.js'

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
// v0.87.118: добавлен fwdFrom для красивых пересланных сообщений
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
  // v0.87.110: аватарка отправителя — берём из кэша если уже скачана loadAvatarsAsync
  const rawSenderId = String(m.senderId || m.fromId?.userId || '')
  let senderAvatar = null
  if (rawSenderId && state.avatarsDir) {
    const p = path.join(state.avatarsDir, `${rawSenderId}.jpg`)
    if (fs.existsSync(p) && fs.statSync(p).size > 0) senderAvatar = `cc-media://avatars/${encodeURIComponent(rawSenderId + '.jpg')}`
  }
  // v0.87.118: fwdFrom — пересланные сообщения (null если обычное)
  let fwdFrom = null
  if (m.fwdFrom) {
    const fw = m.fwdFrom
    fwdFrom = {
      name: fw.fromName || fw.from?.firstName || fw.from?.title || '',
      id: String(fw.fromId?.userId || fw.fromId?.channelId || fw.channelId || ''),
    }
  }
  return {
    id: String(m.id),
    chatId,
    senderId: rawSenderId,
    senderName: m.sender?.firstName || m.sender?.title || '',
    senderAvatar,  // v0.87.110: URL из кэша или null
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
    fwdFrom,  // v0.87.118: { name, id } или null
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
