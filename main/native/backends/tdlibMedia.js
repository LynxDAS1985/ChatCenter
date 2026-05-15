// v0.89.0 — Stage 4 / Этап 2.5: TDLib media (downloadFile + updateFile events)
// v0.89.15 — РАДИКАЛЬНОЕ упрощение: убран progressive playback целиком.
//
// TDLib работает с файлами через асинхронный API:
//   1. `client.invoke({'@type': 'downloadFile', file_id, priority, ...})` — запуск
//   2. TDLib присылает `updateFile` events по мере прогресса:
//        file.local.downloaded_size растёт, на каждом chunk
//   3. Когда `file.local.is_downloading_completed === true` — `file.local.path`
//        указывает на ФИНАЛЬНЫЙ стабильный путь файла на диске.
//
// КРИТИЧНО (v0.89.15): мы НЕ резолвим раньше is_downloading_completed=true.
// По официальной TDLib docs (td_api::file::local::path):
//   «path of the local file. Empty if not available […]. Can be changed remotely
//    AT ANY TIME before the file is downloaded to the local filesystem.»
// До завершения путь нестабилен: TDLib может переименовать temp/<N> → videos/<hash>.mp4
// или удалить temp/<N> при чистке. Серия v0.89.7–v0.89.14 шла по кругу из-за
// попыток отдать temp-путь в <video> — TDLib его убирал, плеер падал в ENOENT.
//
// Поэтому: ждём ПОЛНОЙ загрузки → каллер вызывает stabilizeForPlayback() →
// копия в userData/tg-media/ (наша папка, TDLib её не трогает) → cc-media://media/...

import fs from 'node:fs'
import path from 'node:path'

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Извлекает file_id из TDLib message content для основного медиа.
 * Возвращает { fileId, kind: 'photo'|'video'|'document'|...|null }.
 *
 * Используется когда UI вызывает «скачай медиа из msg X» — мы достаём fileId
 * из mapped/raw сообщения.
 */
export function extractMediaFileId(content) {
  if (!content) return { fileId: null, kind: null }
  const cn = content['@type']
  if (cn === 'messagePhoto') {
    // Берём наибольший доступный размер
    const sizes = content.photo?.sizes || []
    if (!sizes.length) return { fileId: null, kind: 'photo' }
    const largest = sizes.reduce((a, b) => {
      const aArea = (a.width || 0) * (a.height || 0)
      const bArea = (b.width || 0) * (b.height || 0)
      return bArea > aArea ? b : a
    })
    return { fileId: largest.photo?.id ?? null, kind: 'photo' }
  }
  if (cn === 'messageVideo') return { fileId: content.video?.video?.id ?? null, kind: 'video' }
  if (cn === 'messageAudio') return { fileId: content.audio?.audio?.id ?? null, kind: 'audio' }
  if (cn === 'messageVoiceNote') return { fileId: content.voice_note?.voice?.id ?? null, kind: 'voice' }
  if (cn === 'messageVideoNote') return { fileId: content.video_note?.video?.id ?? null, kind: 'videonote' }
  if (cn === 'messageAnimation') return { fileId: content.animation?.animation?.id ?? null, kind: 'animation' }
  if (cn === 'messageDocument') return { fileId: content.document?.document?.id ?? null, kind: 'document' }
  if (cn === 'messageSticker') return { fileId: content.sticker?.sticker?.id ?? null, kind: 'sticker' }
  return { fileId: null, kind: null }
}

/**
 * Возвращает путь к уже скачанному файлу (или null если не скачан).
 * Не делает invoke — синхронная проверка по полю file.local.path.
 */
export function getCachedFilePath(tdFile) {
  if (!tdFile?.local?.is_downloading_completed) return null
  return tdFile.local.path || null
}

/**
 * v0.89.16: извлекает file_id ПРЕВЬЮ (thumbnail) для медиа-сообщения.
 *
 * TDLib хранит ТРИ слоя превью для видео/анимаций/документов:
 *   1. minithumbnail — base64 в самом сообщении (~200 байт, размытый)
 *   2. thumbnail.file — JPEG (~10-100 КБ, чёткий кадр) — ЭТО ИЗВЛЕКАЕМ ЗДЕСЬ
 *   3. video.video / animation.animation / document.document — само медиа
 *
 * Раньше (до v0.89.16) VideoTile.jsx вызывал `tg:download-media` для постера,
 * но `extractMediaFileId` возвращал file_id САМОГО видео (не превью!) — каждое
 * появление видео в чате запускало фоновое скачивание полного файла (десятки МБ).
 * Это исчерпывало трафик, забивало TDLib priority queue, и постер всё равно не
 * рендерился (Chromium не показывает mp4 в `<img>`).
 *
 * См. [td_api::video](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1video.html):
 *   field `thumbnail` — type `thumbnail { format, width, height, file: file }`.
 *
 * @param {object} content — tdMsg.content (messageVideo/Animation/Document/...)
 * @returns {number|null} file_id превью или null если у сообщения нет thumbnail
 */
export function extractThumbnailFileId(content) {
  if (!content) return null
  const cn = content['@type']
  if (cn === 'messageVideo')     return content.video?.thumbnail?.file?.id ?? null
  if (cn === 'messageAnimation') return content.animation?.thumbnail?.file?.id ?? null
  if (cn === 'messageDocument')  return content.document?.thumbnail?.file?.id ?? null
  if (cn === 'messageVideoNote') return content.video_note?.thumbnail?.file?.id ?? null
  if (cn === 'messageAudio')     return content.audio?.album_cover_thumbnail?.file?.id ?? null
  // messagePhoto: для фото "превью" — это меньший из sizes (обычно type='m').
  // Используем самый маленький размер с file.id.
  if (cn === 'messagePhoto') {
    const sizes = content.photo?.sizes || []
    if (!sizes.length) return null
    const smallest = sizes.reduce((a, b) => {
      const aArea = (a.width || 0) * (a.height || 0)
      const bArea = (b.width || 0) * (b.height || 0)
      return aArea < bArea ? a : b
    })
    return smallest.photo?.id ?? null
  }
  return null
}

/**
 * v0.89.7: конвертирует абсолютный путь к файлу TDLib в cc-media:// URL.
 *
 * ВНИМАНИЕ (v0.89.15): этот helper оставлен как fallback для случаев когда
 * stabilizeForPlayback не смог скопировать файл (диск переполнен и т.п.).
 * Основной путь воспроизведения — через `stabilizeForPlayback`, а не отсюда.
 * См. ловушку «временные файлы TDLib» в `.memory-bank/mistakes/tdlib-video-player.md`.
 *
 * Формат URL: `cc-media://tdlib/{accountSubdir}/files/{kind}/{filename}`.
 *
 * @param {string} absPath — TDLib `file.local.path` (абсолютный OS-путь)
 * @returns {string|null} cc-media:// URL или null если путь не из tdlib-sessions
 */
export function tdlibPathToCcMediaUrl(absPath) {
  if (!absPath || typeof absPath !== 'string') return null
  const marker = 'tdlib-sessions'
  const idx = absPath.indexOf(marker)
  if (idx < 0) return null
  const after = absPath.slice(idx + marker.length + 1) // +1 за trailing slash/backslash
  // Нормализуем backslash → slash для URL.
  const normalized = after.replace(/\\/g, '/')
  // encodeURI пропускает разделители /, но кодирует Cyrillic и пробелы.
  return `cc-media://tdlib/${encodeURI(normalized)}`
}

/**
 * v0.89.15: КОПИРУЕТ скачанный TDLib-файл в стабильную папку userData/tg-media/.
 *
 * Почему НЕ играем напрямую из tdlib-sessions/:
 *   1. `temp/<N>` файлы TDLib удаляет при чистке (ENOENT в логах v0.89.14)
 *   2. Даже completed файлы TDLib может удалить через optimizeStorage()
 *      (вызывается нашим UI «Очистить кеш»)
 *   3. Путь может измениться между partial→completed (temp/N → videos/hash.mp4)
 *      → Chromium <video> теряет src
 *
 * Папка `tg-media/` — НАША, TDLib её не трогает. Гарантия стабильности URL
 * на всё время жизни приложения (до явного `cleanupTgMedia` если будет).
 *
 * Дедуп: имя файла = `<fileId>_<size>.<ext>`. Если файл с таким именем
 * и таким же размером уже на диске — копировать не надо.
 *
 * @param {string} absPath — TDLib `file.local.path` (после is_downloading_completed=true)
 * @param {string} userDataDir — корневой userData (для tg-media/)
 * @param {number|string} [fileId] — TDLib file.id (для стабильного имени)
 * @returns {string|null} cc-media://media/<name> или null если что-то пошло не так
 */
export function stabilizeForPlayback(absPath, userDataDir, fileId) {
  if (!absPath || !userDataDir || typeof absPath !== 'string') return null
  try {
    if (!fs.existsSync(absPath)) return null
    const stat = fs.statSync(absPath)
    if (!stat.isFile() || stat.size <= 0) return null
    const size = stat.size
    const ext = (path.extname(absPath) || '.bin').toLowerCase()
    // Стабильное имя:
    //   - предпочитаем `<fileId>_<size><ext>` (детерминированно, дедуп между чатами)
    //   - fallback `<basename>_<size><ext>` — если fileId не передан
    const idPart = (fileId !== undefined && fileId !== null && fileId !== '')
      ? String(fileId).replace(/[^a-zA-Z0-9_-]/g, '_')
      : path.basename(absPath, path.extname(absPath)).replace(/[^a-zA-Z0-9_-]/g, '_')
    const stableName = `${idPart}_${size}${ext}`
    const mediaDir = path.join(userDataDir, 'tg-media')
    try { fs.mkdirSync(mediaDir, { recursive: true }) } catch (_) {}
    const destPath = path.join(mediaDir, stableName)
    // Дедуп: если копия с тем же размером уже есть — пропускаем copy.
    let needCopy = true
    try {
      if (fs.existsSync(destPath) && fs.statSync(destPath).size === size) needCopy = false
    } catch (_) {}
    if (needCopy) fs.copyFileSync(absPath, destPath)
    return `cc-media://media/${encodeURIComponent(stableName)}`
  } catch (_) { return null }
}

// ──────────────────────────────────────────────────────────────────────
// downloadFile
// ──────────────────────────────────────────────────────────────────────

/**
 * Запускает скачивание файла и ждёт ПОЛНОГО завершения (is_downloading_completed=true).
 *
 * v0.89.15: убран флаг `progressive`. См. шапку файла — резолвить раньше
 * полной загрузки запрещено из-за нестабильности temp-путей TDLib.
 * Для UX «не блокировать UI на больших видео» — caller показывает прогресс-бар
 * через onProgress (см. VideoTile.jsx — spinner с процентами на постере).
 *
 * @param {object} opts
 * @param {object} opts.manager — TdlibClientManager (нужен для подписки на file:update)
 * @param {string} opts.accountId
 * @param {number} opts.fileId — TDLib file.id (целое число)
 * @param {number} [opts.priority=1] — 1 (low) ... 32 (high)
 * @param {(file: object) => void} [opts.onProgress] — вызывается на каждом chunk
 * @returns {Promise<{ ok, path?: string, file?: object, error? }>}
 *   `path` — RAW TDLib file.local.path. Caller ОБЯЗАН пропустить через
 *   `stabilizeForPlayback` перед передачей в renderer.
 */
export function downloadFile({ manager, accountId, fileId, priority = 1, onProgress }) {
  if (!manager) return Promise.resolve({ ok: false, error: 'manager required' })
  if (!accountId) return Promise.resolve({ ok: false, error: 'accountId required' })
  if (fileId == null) return Promise.resolve({ ok: false, error: 'fileId required' })
  const client = manager.getClient(accountId)
  if (!client?.invoke) return Promise.resolve({ ok: false, error: 'client not ready' })

  return new Promise((resolve) => {
    let settled = false

    // Слушатель updateFile — фильтруем по accountId + fileId.
    const onFileUpdate = ({ accountId: aid, file }) => {
      if (settled || aid !== accountId || file?.id !== Number(fileId)) return
      // Прогресс
      try { onProgress?.(file) } catch (_) {}
      if (file?.local?.is_downloading_completed) {
        settled = true
        manager.off('file:update', onFileUpdate)
        // Возвращаем RAW путь — caller должен стабилизировать.
        resolve({ ok: true, path: file.local.path, file })
      } else if (file?.local?.download_error) {
        settled = true
        manager.off('file:update', onFileUpdate)
        resolve({ ok: false, error: `download failed: file ${fileId}` })
      }
    }
    manager.on('file:update', onFileUpdate)

    // Запускаем downloadFile. TDLib сразу вернёт file объект с partial info.
    Promise.resolve(client.invoke({
      '@type': 'downloadFile',
      file_id: Number(fileId),
      priority: Math.max(1, Math.min(32, Number(priority) || 1)),
      offset: 0,
      limit: 0,           // 0 = весь файл
      synchronous: false, // ждём через updateFile, не блокируем
    })).then((result) => {
      // Если файл уже скачан — TDLib возвращает file с is_downloading_completed=true
      if (!settled && result?.local?.is_downloading_completed) {
        settled = true
        manager.off('file:update', onFileUpdate)
        resolve({ ok: true, path: result.local.path, file: result })
      }
    }).catch((err) => {
      if (!settled) {
        settled = true
        manager.off('file:update', onFileUpdate)
        resolve({ ok: false, error: err?.message || String(err) })
      }
    })
  })
}

/**
 * Отменяет начатую загрузку.
 */
export async function cancelDownload({ manager, accountId, fileId }) {
  if (!manager) return { ok: false, error: 'manager required' }
  const client = manager.getClient(accountId)
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  try {
    await client.invoke({
      '@type': 'cancelDownloadFile',
      file_id: Number(fileId),
      only_if_pending: false,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * Возвращает текущий размер кеша TDLib (используется UI «Очистить кеш»).
 */
export async function getStorageStatistics(client) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  try {
    const stats = await client.invoke({
      '@type': 'getStorageStatisticsFast',
    })
    return {
      ok: true,
      bytes: Number(stats?.files_size) || 0,
      fileCount: Number(stats?.file_count) || 0,
      databaseSize: Number(stats?.database_size) || 0,
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * Очищает кеш TDLib (удаляет скачанные файлы).
 */
export async function optimizeStorage(client) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  try {
    const result = await client.invoke({
      '@type': 'optimizeStorage',
      size: 0,
      ttl: 0,
      count: 0,
      immunity_delay: 0,
      file_types: [],
      chat_ids: [],
      exclude_chat_ids: [],
      return_deleted_file_statistics: false,
      chat_limit: 0,
    })
    return { ok: true, freedBytes: Number(result?.size) || 0 }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}
