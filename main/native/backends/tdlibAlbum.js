// v0.95.43: отправка альбома (до 10 фото/видео одним сообщением).
//
// TDLib spec: https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1send_message_album.html
//
// sendMessageAlbum принимает массив input_message_contents до 10 элементов,
// каждый тип inputMessagePhoto / inputMessageVideo / inputMessageAudio /
// inputMessageDocument. Сервер группирует их в media album (один bubble в UI).
//
// Ограничения:
//   - максимум 10 файлов в одном альбоме
//   - все файлы одного типа предпочтительно (mixed Photo+Video поддерживается,
//     но не Photo+Document)
//   - caption обычно ставится только на первый элемент (или на любой один)
//
// Использование из renderer:
//   await window.api.invoke('tg:send-album', { chatId, files: [{path, caption?}], ... })
//
// Если массив > 10 файлов — split на батчи по 10 (TDLib не примет больше).

import path from 'node:path'

const MAX_ALBUM_SIZE = 10  // TDLib limit

const PHOTO_EXT = /^(jpg|jpeg|png|webp)$/
const VIDEO_EXT = /^(mp4|m4v|mov|webm|avi)$/
const AUDIO_EXT = /^(mp3|m4a|aac|flac|wav|ogg|opus)$/

function buildContent(filePath, caption, asDocument = false) {
  const lower = String(filePath).toLowerCase()
  const ext = lower.slice(lower.lastIndexOf('.') + 1)
  const inputFile = { '@type': 'inputFileLocal', path: String(filePath) }
  const captionFt = caption
    ? { '@type': 'formattedText', text: String(caption), entities: [] }
    : null

  // v1.2.207 (#1): «Без сжатия» — весь альбом документами (Telegram не сжимает).
  if (asDocument) {
    return {
      '@type': 'inputMessageDocument',
      document: inputFile,
      disable_content_type_detection: false,
      ...(captionFt ? { caption: captionFt } : {}),
    }
  }

  if (PHOTO_EXT.test(ext)) {
    return {
      '@type': 'inputMessagePhoto',
      photo: inputFile,
      added_sticker_file_ids: [],
      width: 0, height: 0,
      show_caption_above_media: false,
      has_spoiler: false,
      ...(captionFt ? { caption: captionFt } : {}),
    }
  }
  if (VIDEO_EXT.test(ext)) {
    return {
      '@type': 'inputMessageVideo',
      video: inputFile,
      added_sticker_file_ids: [],
      duration: 0, width: 0, height: 0,
      supports_streaming: true,
      show_caption_above_media: false,
      has_spoiler: false,
      ...(captionFt ? { caption: captionFt } : {}),
    }
  }
  if (AUDIO_EXT.test(ext)) {
    return {
      '@type': 'inputMessageAudio',
      audio: inputFile,
      duration: 0, title: '', performer: '',
      ...(captionFt ? { caption: captionFt } : {}),
    }
  }
  // Document — fallback
  return {
    '@type': 'inputMessageDocument',
    document: inputFile,
    disable_content_type_detection: false,
    ...(captionFt ? { caption: captionFt } : {}),
  }
}

/**
 * Отправляет альбом (1-10 файлов одним сообщением через TDLib sendMessageAlbum).
 * При > 10 файлах — разбивает на батчи (sequential).
 *
 * @param {object} client — TDLib client
 * @param {string|number} chatId — TDLib chat_id
 * @param {Array<{path: string, caption?: string}>} files — массив файлов
 * @param {object} [opts] — { albumCaption: string, replyTo: number }
 * @returns {Promise<{ ok, messageIds?: string[], error? }>}
 */
export async function sendMessageAlbum(client, chatId, files, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'no files' }

  // Split на батчи по 10 (TDLib max)
  const batches = []
  for (let i = 0; i < files.length; i += MAX_ALBUM_SIZE) {
    batches.push(files.slice(i, i + MAX_ALBUM_SIZE))
  }

  const allMessageIds = []
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]
    const contents = batch.map((f, idx) => {
      // Caption — на первом элементе батча из opts.albumCaption,
      // либо на каждом из f.caption.
      const cap = (idx === 0 && opts.albumCaption) ? opts.albumCaption : f.caption
      return buildContent(f.path, cap, !!opts.asDocument)
    })

    try {
      const request = {
        '@type': 'sendMessageAlbum',
        chat_id: Number(chatId),
        input_message_contents: contents,
      }
      if (opts.replyTo && bi === 0) {
        request.reply_to = {
          '@type': 'inputMessageReplyToMessage',
          message_id: Number(opts.replyTo),
        }
      }
      const result = await client.invoke(request)
      // Result: messages: Array<Message>
      const ids = (result?.messages || []).map(m => m?.id != null ? String(m.id) : null).filter(Boolean)
      allMessageIds.push(...ids)
    } catch (e) {
      if (e && typeof e === 'object' && e['@type'] === 'error') {
        return { ok: false, error: e.message || String(e.code), code: e.code, messageIds: allMessageIds }
      }
      return { ok: false, error: e?.message || String(e), messageIds: allMessageIds }
    }
  }

  return { ok: true, messageIds: allMessageIds }
}

// Для тестов
export const _internal = { buildContent, MAX_ALBUM_SIZE }
