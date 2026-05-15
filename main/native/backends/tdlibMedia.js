// v0.89.0 — Stage 4 / Этап 2.5: TDLib media (downloadFile + updateFile events)
//
// TDLib работает с файлами через асинхронный API:
//   1. `client.invoke({'@type': 'downloadFile', file_id, priority, ...})` — запуск
//   2. TDLib присылает `updateFile` events по мере прогресса:
//        file.local.downloaded_size растёт, на каждом chunk
//   3. Когда `file.local.is_downloading_completed === true` — `file.local.path`
//        указывает на реальный путь файла на диске.
//
// Архитектурно: TdlibClientManager уже эмитит `file:update` events при получении
// `updateFile`. Эта обёртка `downloadFile` подписывается на manager (а не на client
// напрямую), чтобы было разделение ответственности.
//
// Также: если файл уже скачан до запуска downloadFile — invoke сразу вернёт
// объект с is_downloading_completed=true. Тогда промис резолвится мгновенно.

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
 * v0.89.7: конвертирует абсолютный путь к файлу TDLib в cc-media:// URL.
 *
 * Раньше backend.media.download возвращал raw path (например
 * `C:\Users\...\tdlib-sessions\pending\files\videos\WAIFF_1.mp4`) — UI пытался
 * загрузить через `file:///` URL, и Chromium падал с DECODER_ERROR_NOT_SUPPORTED
 * для некоторых видео (file:/// scheme не имеет stream/bypassCSP privileges
 * cc-media протокола). Фото тоже не отображались — Chromium не загружал
 * через file:/// в этом контексте.
 *
 * Новый формат URL: `cc-media://tdlib/{accountSubdir}/files/{kind}/{filename}`
 * → resolves в `userData/tdlib-sessions/{accountSubdir}/files/{kind}/{filename}`
 * через расширенный ccMediaProtocol handler.
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
 * v0.89.14: для файлов в `tdlib-sessions/.../files/temp/` TDLib может удалять
 * или перезаписывать их в любой момент (это temp директория). Логи показали
 * «no video file» — UI получал путь, потом TDLib удалял файл, и cc-media
 * handler возвращал 404.
 *
 * Решение: копируем temp/ файлы в стабильный `userData/tg-media/` (как делал
 * GramJS). Возвращаем cc-media://media/ URL — там TDLib не достанет.
 *
 * @param {string} absPath — TDLib file.local.path
 * @param {string} userDataDir — корневой userData (для tg-media/)
 * @returns {string|null} cc-media://media/<filename> или null если не temp
 */
export function stabilizeTempFile(absPath, userDataDir) {
  if (!absPath || !userDataDir) return null
  const normalized = absPath.replace(/\\/g, '/')
  if (!normalized.includes('/files/temp/')) return null
  try {
    if (!fs.existsSync(absPath)) return null
    const size = fs.statSync(absPath).size
    if (size <= 0) return null
    const ext = path.extname(absPath) || '.bin'
    // Используем size + базовое имя как ключ — если TDLib переоткроет тот же
    // файл, мы переиспользуем копию (не дублируем диск). Если изменился размер
    // — копируем заново.
    const baseName = path.basename(absPath, ext).replace(/[^a-zA-Z0-9_-]/g, '_')
    const stableName = `${baseName}_${size}${ext}`
    const mediaDir = path.join(userDataDir, 'tg-media')
    try { fs.mkdirSync(mediaDir, { recursive: true }) } catch (_) {}
    const destPath = path.join(mediaDir, stableName)
    if (!fs.existsSync(destPath) || fs.statSync(destPath).size !== size) {
      fs.copyFileSync(absPath, destPath)
    }
    return `cc-media://media/${encodeURIComponent(stableName)}`
  } catch (_) { return null }
}

// ──────────────────────────────────────────────────────────────────────
// downloadFile
// ──────────────────────────────────────────────────────────────────────

/**
 * Запускает скачивание файла и ждёт завершения.
 *
 * @param {object} opts
 * @param {object} opts.manager — TdlibClientManager (нужен для подписки на file:update)
 * @param {string} opts.accountId
 * @param {number} opts.fileId — TDLib file.id (целое число)
 * @param {number} [opts.priority=1] — 1 (low) ... 32 (high)
 * @param {(file: object) => void} [opts.onProgress] — вызывается на каждом chunk
 * @param {boolean} [opts.progressive=false] — для streamable видео (см. TDLib
 *   `video.supports_streaming` — True если moov atom в начале файла). Если true,
 *   резолвим раньше при downloaded_prefix_size >= 256 KB чтобы UI начал играть
 *   пока остаток скачивается. Для НЕ-streamable видео (supports_streaming=false)
 *   moov atom в конце — без него плеер показывает 0:00. ВСЕГДА false по дефолту
 *   во избежание чёрного экрана.
 * @returns {Promise<{ ok, path?: string, file?: object, partial?: boolean, error? }>}
 */
export function downloadFile({ manager, accountId, fileId, priority = 1, onProgress, progressive = false }) {
  if (!manager) return Promise.resolve({ ok: false, error: 'manager required' })
  if (!accountId) return Promise.resolve({ ok: false, error: 'accountId required' })
  if (fileId == null) return Promise.resolve({ ok: false, error: 'fileId required' })
  const client = manager.getClient(accountId)
  if (!client?.invoke) return Promise.resolve({ ok: false, error: 'client not ready' })

  return new Promise((resolve) => {
    let settled = false

    // v0.89.9: progressive playback ТОЛЬКО для streamable видео (TDLib
    // `video.supports_streaming === true`). Caller передаёт progressive: true
    // только если флаг есть на medias. Иначе ждём полной загрузки —
    // для non-streamable файлов moov atom в конце, без него <video> показывает
    // 0:00 и чёрный экран. См. TDLib docs:
    //   https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1video.html
    //   field supports_streaming — "True, if the video is expected to be streamed"
    const PROGRESSIVE_THRESHOLD = 256 * 1024
    // Слушатель updateFile — фильтруем по accountId + fileId.
    const onFileUpdate = ({ accountId: aid, file }) => {
      if (settled || aid !== accountId || file?.id !== Number(fileId)) return
      // Прогресс
      try { onProgress?.(file) } catch (_) {}
      const completed = !!file?.local?.is_downloading_completed
      const earlyReady = progressive
        && !completed
        && file?.local?.path
        && Number(file.local?.downloaded_prefix_size || 0) >= PROGRESSIVE_THRESHOLD
      if (completed || earlyReady) {
        settled = true
        manager.off('file:update', onFileUpdate)
        resolve({
          ok: true,
          path: tdlibPathToCcMediaUrl(file.local.path) || file.local.path,
          file,
          partial: !completed,
        })
      } else if (file?.local?.download_error) {
        // TDLib может пометить ошибку в local.download_error
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
        resolve({ ok: true, path: tdlibPathToCcMediaUrl(result.local.path) || result.local.path, file: result })
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
