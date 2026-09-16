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
    // v0.95.25: waveform — base64-кодированная байтовая строка с 100 sample'ами
    // по 5 бит каждый. TDLib сам сэмплирует аудио → нам нужно только декодировать
    // и рисовать в canvas. Decode в src/native/utils/voiceWaveform.js.
    // По TDLib spec: `bytes waveform` в `voiceNote`.
    out.info.waveform = content.voice_note?.waveform || null
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
    // v0.95.47: mediaType=null чтобы text-ветка с emoji fallback из tdlibMapper.js
    // отрисовала большой emoji (isLargeEmoji=true). Раньше mediaType='other' плюс
    // пустой text давал ПОЛНОСТЬЮ ПУСТОЙ bubble (баг найден по скрину 8 июня 2026).
    // Полный рендер WEBP/TGS lottie — отдельная фича.
    out.mediaType = null
    out.info.mediaWidth = Number(content.sticker?.width) || null
    out.info.mediaHeight = Number(content.sticker?.height) || null
    return out
  }

  // v0.95.47: messageDice (🎲🎯🎰🏀⚽🎳) — emoji-anim тоже падал в пустой bubble.
  // TDLib spec: https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message_dice.html
  if (cn === 'messageDice') {
    out.mediaType = null
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

// ──────────────────────────────────────────────────────────────────────
// v1.2.461 — «ПУСТОЕ СООБЩЕНИЕ» БОЛЬШЕ НЕ МОЛЧИТ
//
// ЖАЛОБА 2026-09-15: в уведомлении «[медиа]», в чате пустой пузырь, в списке чатов
// «вложение» — три разные надписи для ОДНОГО сообщения (канал Forbes Russia, 16:34).
// КОРЕНЬ: пришёл вид сообщения, которого нет в extractMediaInfo выше → mediaType=null,
// текста тоже нет → показывать нечего. Три места берут ответ у РАЗНЫХ составителей и
// подставляют свои заглушки: уведомление — «[медиа]» (src/native/store/nativeStoreIpc.js),
// список чатов — «📎 вложение» (tdlibPreview.js), чат — НИЧЕГО (MessageBubble.jsx рисует
// только знакомые виды).
//
// Почему это повторяется: то же самое уже ловили ДВАЖДЫ по скриншотам пользователя —
// анимированный эмодзи (v0.95.40) и стикер/кубик (v0.95.47). Каждый раз узнавали случайно,
// потому что программа о незнакомом виде НИГДЕ не писала. Эта запись закрывает цикл:
// теперь вид попадает в журнал сам, и добавить ему обработку можно точечно.
//
// 🔴 ПОЧЕМУ ПИШЕМ ПО ФАКТУ «ПУСТО», А НЕ ПО ФАКТУ «НЕЗНАКОМЫЙ ВИД»: стикер, кубик и
// анимированный эмодзи ТОЖЕ дают mediaType=null, но пустыми НЕ выглядят — у них вместо
// текста подставляется эмодзи (см. tdlibMapper.js). Писали бы по «незнакомому виду» —
// журнал бы засорялся ими без всякой пользы.
//
// Свёртка: каждый вид пишется ОДИН раз за запуск (приём проекта — так же свёрнут шторм
// ошибок webview в v1.2.418). Значит поток одинаковых сообщений даст одну строку, а не сотни.
// ──────────────────────────────────────────────────────────────────────
// v1.2.465 — ЧЕСТНАЯ ПОДПИСЬ ВМЕСТО «[медиа]»
//
// Запись из v1.2.461 сработала и НАЗВАЛА вид: журнал 2026-09-16 08:30:51 показал
// `[tdlib-empty] вид сообщения "messageUnsupported"`. Значит гадать больше не нужно.
//
// 🥇 ФАКТ УРОВНЯ 1 (официальная документация TDLib, класс messageUnsupported):
//    «A message content that is not supported in the current TDLib version.»
//    То есть содержимое НЕВОЗМОЖНО показать в принципе — библиотека его не понимает.
//    Значит правильный ответ пользователю — честная подпись, а НЕ «[медиа]»
//    (обещает вложение, которого нет) и не пустой пузырь (выглядит как сбой программы).
//
// 🔴 ПОЧЕМУ ПОДСТАВЛЯЕМ ТЕКСТ В РАЗБОРЕ, А НЕ В ТРЁХ МЕСТАХ ПОКАЗА: заглушку сейчас
// подставляет каждый показ по-своему («[медиа]» в уведомлении, «📎 вложение» в списке
// чатов, ничего в пузыре). Правка в разборе чинит все три разом и не плодит копий.
//
// 🔴 СПИСОК УМЫШЛЕННО КОРОТКИЙ. Сюда попадают ТОЛЬКО виды, про которые точно известно,
// что содержимого нет и не будет. Служебные записи («добавлен участник» и т.п.) сюда НЕ
// добавляем: у них свои подписи в messagePreview (tdlibMapper.js), и в чате Telegram их
// показывает отдельной строкой — это другая задача.
// 🔴 Object.create(null) — словарь БЕЗ унаследованных свойств. Обычный объект на запросы
// вида 'constructor' / 'toString' / 'valueOf' отдаёт СВОИ ВСТРОЕННЫЕ функции, и подпись стала бы
// не текстом, а функцией (поймано придирчивым ревью v1.2.465: `typeof text` было 'function').
// TDLib таких имён не присылает, но функция обязана ВСЕГДА возвращать текст — иначе всё, что
// ниже работает с текстом (длина, обрезка, показ), сломается непредсказуемо.
const EMPTY_FALLBACK_TEXT = Object.assign(Object.create(null), {
  messageUnsupported: '\u26A0\uFE0F Сообщение не поддерживается этой версией программы',
})

/**
 * Подпись для сообщения, у которого НЕТ ни текста, ни вложения.
 * @param {string} contentType значение content['@type'] от TDLib
 * @returns {string} подпись или '' — если про этот вид ничего не известно (оставляем как было)
 */
export function emptyMessageFallbackText(contentType) {
  const v = EMPTY_FALLBACK_TEXT[String(contentType || '')]
  return typeof v === 'string' ? v : ''
}

const reportedEmptyTypes = new Set()

/**
 * Записать в журнал, что сообщение вышло пустым (ни текста, ни вложения).
 * @param {string} contentType значение content['@type'] от TDLib
 * @returns {boolean} true — записали сейчас; false — про этот вид уже писали
 */
export function noteEmptyMessage(contentType) {
  const cn = String(contentType || 'unknown')
  if (reportedEmptyTypes.has(cn)) return false
  reportedEmptyTypes.add(cn)
  // console.warn в главном процессе пишется в chatcenter.log автоматически
  // (main/utils/logger.js) — правило проекта про логи соблюдено.
  try {
    console.warn('[tdlib-empty] вид сообщения "' + cn + '" — показывать нечего: нет ни текста, ни вложения. '
      + 'Пользователь видит пустой пузырь в чате и «[медиа]» в уведомлении. '
      + 'Если вид нужный — добавить ему разбор в extractMediaInfo (tdlibMapperMedia.js).')
  } catch (_) { /* журнал недоступен — не роняем разбор сообщения */ }
  return true
}
