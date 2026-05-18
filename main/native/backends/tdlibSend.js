// v0.89.34: вынесено из tdlibMessages.js (был 475 строк, лимит 500).
// Содержит sendFile — отправка медиа/документов через inputMessage<Type>.
//
// Используется в tdlibBackend через прозрачный re-export из tdlibMessages.js.

// ──────────────────────────────────────────────────────────────────────
// sendFile (inputMessagePhoto / inputMessageVideo / inputMessageDocument)
// ──────────────────────────────────────────────────────────────────────

/**
 * Отправляет файл. Тип определяется по расширению:
 *  - .jpg/.jpeg/.png/.webp → inputMessagePhoto (HEIC исключён — TDLib не поддерживает
 *    HEIC как Photo, серверная сторона делает Telegram-клиент через preview)
 *  - .gif → inputMessageAnimation (с required duration/width/height — TDLib читает
 *    метаданные из файла, передаём 0 — он сам подставит)
 *  - .mp4/.m4v/.mov/.webm/.avi → inputMessageVideo
 *  - .mp3/.m4a/.aac/.flac/.wav/.ogg/.opus → inputMessageAudio
 *  - всё остальное (включая .heic, .pdf, .docx, .zip, ...) → inputMessageDocument
 *
 * Все required-поля inputMessage<Type> заполняются (см. TDLib docs):
 *  - inputMessagePhoto: added_sticker_file_ids=[], width=0, height=0,
 *    show_caption_above_media=false, has_spoiler=false
 *  - inputMessageAnimation: added_sticker_file_ids=[], duration=0, width=0, height=0,
 *    show_caption_above_media=false, has_spoiler=false
 *  - inputMessageVideo: added_sticker_file_ids=[], duration=0, width=0, height=0,
 *    supports_streaming=true, show_caption_above_media=false, has_spoiler=false
 *  - inputMessageAudio: duration=0, title='', performer=''
 *
 * TDLib читает реальные размеры/длительность из файла на сервере (FFprobe-like),
 * передача 0 — стандартный паттерн для Telegram Desktop / Android клиентов.
 *
 * Документация типов: https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1send_message.html
 *
 * @param {object} client
 * @param {string|number} chatId — TDLib chat_id
 * @param {string} filePath — абсолютный путь к локальному файлу
 * @param {object} [opts] — { caption, replyTo, chatIdStr }
 * @returns {Promise<{ ok, messageId?, error? }>}
 */
export async function sendFile(client, chatId, filePath, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  if (!filePath) return { ok: false, error: 'no filePath' }

  const lower = String(filePath).toLowerCase()
  const ext = lower.slice(lower.lastIndexOf('.') + 1)

  const inputFile = { '@type': 'inputFileLocal', path: String(filePath) }
  const caption = opts.caption
    ? { '@type': 'formattedText', text: String(opts.caption), entities: [] }
    : null

  let content
  if (/^(jpg|jpeg|png|webp)$/.test(ext)) {
    // Photo — JPEG/PNG/WEBP. HEIC намеренно исключён: TDLib не конвертирует HEIC
    // в Photo, попытка отправить как Photo даёт ошибку «PHOTO_INVALID_DIMENSIONS».
    // Лучше отправить HEIC как Document — клиенты iOS/desktop откроют через preview.
    content = {
      '@type': 'inputMessagePhoto',
      photo: inputFile,
      added_sticker_file_ids: [],
      width: 0, height: 0,
      show_caption_above_media: false,
      has_spoiler: false,
      ...(caption ? { caption } : {}),
    }
  } else if (ext === 'gif') {
    // Animation — TDLib поле inputMessageAnimation для GIF. Без него GIF
    // отправлялся как inputMessagePhoto и Telegram сохранял как статичный PNG,
    // теряя анимацию.
    content = {
      '@type': 'inputMessageAnimation',
      animation: inputFile,
      added_sticker_file_ids: [],
      duration: 0, width: 0, height: 0,
      show_caption_above_media: false,
      has_spoiler: false,
      ...(caption ? { caption } : {}),
    }
  } else if (/^(mp4|m4v|mov|webm|avi)$/.test(ext)) {
    content = {
      '@type': 'inputMessageVideo',
      video: inputFile,
      added_sticker_file_ids: [],
      duration: 0, width: 0, height: 0,
      supports_streaming: true,
      show_caption_above_media: false,
      has_spoiler: false,
      ...(caption ? { caption } : {}),
    }
  } else if (/^(mp3|m4a|aac|flac|wav|ogg|opus)$/.test(ext)) {
    content = {
      '@type': 'inputMessageAudio',
      audio: inputFile,
      duration: 0,
      title: '',
      performer: '',
      ...(caption ? { caption } : {}),
    }
  } else {
    // Document — всё остальное (включая HEIC, PDF, DOCX, ZIP и т.п.).
    content = {
      '@type': 'inputMessageDocument',
      document: inputFile,
      disable_content_type_detection: false,
      ...(caption ? { caption } : {}),
    }
  }

  try {
    const request = {
      '@type': 'sendMessage',
      chat_id: Number(chatId),
      input_message_content: content,
    }
    if (opts.replyTo) {
      request.reply_to = { '@type': 'inputMessageReplyToMessage', message_id: Number(opts.replyTo) }
    }
    const result = await client.invoke(request)
    return { ok: true, messageId: result?.id != null ? String(result.id) : null }
  } catch (e) {
    if (e && typeof e === 'object' && e['@type'] === 'error') {
      return { ok: false, error: e.message || String(e.code), code: e.code }
    }
    return { ok: false, error: e?.message || String(e), code: e?.code }
  }
}
