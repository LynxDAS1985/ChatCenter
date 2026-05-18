// v0.89.34: вынесено из tdlibMapper.js (был 417 строк, лимит 500).
// Содержит media-related хелперы для mapMessage:
//   - extractMinithumbnail — base64 minithumbnail из TDLib content
//   - extractPhotoDimensions — largest size фото
//   - extractMediaInfo — определение mediaType + info полей по content['@type']

// TDLib minithumbnail: { width, height, data: base64 string } — мгновенное превью.
// Возвращает 'data:image/jpeg;base64,...' или null.
export function extractMinithumbnail(content) {
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
export function extractPhotoDimensions(content) {
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
export function extractMediaInfo(content) {
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
