// v0.89.17 — LRU-кеш для userData/tg-media/.
//
// КОНТЕКСТ:
// В v0.89.15 решено НЕ играть видео напрямую из TDLib папок (TDLib чистит
// temp/ и optimizeStorage). Каждое скачанное медиа копируется в
// userData/tg-media/<fileId>_<size>.<ext> через stabilizeForPlayback().
//
// ПРОБЛЕМА: tg-media/ растёт без ограничений. TDLib `optimizeStorage` чистит
// только tdlib-sessions/, нашу папку не трогает. Этот модуль решает 3 проблемы:
//   1. getCleanupStats не видел tg-media/ → UI «Очистить кеш» врёт о размере
//   2. removeAccountSessionFiles не чистит tg-media/ → файлы аккаунта остаются
//   3. Нет автоматической чистки по размеру/времени
//
// РЕШЕНИЕ — LRU-кеш с дефолтами как у Telegram Desktop:
//   • Лимит размера: 1 ГБ
//   • TTL: 7 дней (файлы старше — удаляем)
//   • Immunity: 5 минут (только что открытые — не трогать)
//   • LRU: при превышении лимита удаляем самые старые по mtime
//
// Алгоритм — тот же что в TDLib `optimizeStorage` (см. официальную doc:
// https://core.telegram.org/tdlib/getting-started#storage-optimization).
//
// ИНТЕГРАЦИЯ:
//   • getTgMediaStats — используется в `tdlibChatActions.getCleanupStats`
//     для UI «Очистить кеш»
//   • cleanupTgMedia — вызывается при старте бекенда (tdlibBackend.js) +
//     после каждой `media.download*` + при нажатии «Очистить кеш»
//   • touchTgMediaFile — обновляет mtime файла при чтении из cc-media handler.
//     Так играющие видео защищены от удаления (mtime «свежий»).

import fs from 'node:fs'
import path from 'node:path'

// Дефолты — как у Telegram Desktop (settings/storage_optimization)
export const TG_MEDIA_DEFAULTS = {
  maxSizeBytes: 1 * 1024 * 1024 * 1024,  // 1 ГБ
  ttlSeconds: 7 * 24 * 3600,              // 7 дней
  immunityDelay: 5 * 60,                  // 5 минут — не трогать недавно открытые
}

// Помощник: безопасный stat (возвращает null вместо throw на пропавшем файле).
function safeStat(p) {
  try { return fs.statSync(p) } catch (_) { return null }
}

/**
 * Сканирует tg-media/ — возвращает суммарную статистику.
 *
 * @param {string} userDataDir
 * @returns {{ totalBytes: number, fileCount: number, oldestMtime: number|null }}
 */
export function getTgMediaStats(userDataDir) {
  const result = { totalBytes: 0, fileCount: 0, oldestMtime: null }
  if (!userDataDir) return result
  const dir = path.join(userDataDir, 'tg-media')
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
  catch (_) { return result }
  for (const e of entries) {
    if (!e.isFile()) continue
    const s = safeStat(path.join(dir, e.name))
    if (!s) continue
    result.totalBytes += s.size
    result.fileCount += 1
    const mtime = s.mtimeMs || s.mtime?.getTime() || 0
    if (result.oldestMtime === null || mtime < result.oldestMtime) {
      result.oldestMtime = mtime
    }
  }
  return result
}

/**
 * LRU + TTL очистка tg-media/.
 *
 * @param {string} userDataDir
 * @param {object} [opts]
 * @param {number} [opts.maxSizeBytes] — лимит общего размера. 0 = удалить ВСЁ
 *   (используется при ручной «Очистить кеш»). undefined = TG_MEDIA_DEFAULTS.
 * @param {number} [opts.ttlSeconds] — макс. возраст файла. 0 = без ограничения.
 *   Если файл старше — удаляем независимо от размера. undefined = default.
 * @param {number} [opts.immunityDelay] — секунд защиты для недавно открытых
 *   файлов (по mtime). undefined = default. Не применяется при maxSizeBytes:0.
 * @returns {{ ok: true, freedBytes: number, removedCount: number, remainingBytes: number }}
 */
export function cleanupTgMedia(userDataDir, opts = {}) {
  const result = { ok: true, freedBytes: 0, removedCount: 0, remainingBytes: 0 }
  if (!userDataDir) return result
  const dir = path.join(userDataDir, 'tg-media')
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
  catch (_) { return result }

  const maxSizeBytes = opts.maxSizeBytes === undefined
    ? TG_MEDIA_DEFAULTS.maxSizeBytes : opts.maxSizeBytes
  const ttlSeconds = opts.ttlSeconds === undefined
    ? TG_MEDIA_DEFAULTS.ttlSeconds : opts.ttlSeconds
  const immunityDelay = opts.immunityDelay === undefined
    ? TG_MEDIA_DEFAULTS.immunityDelay : opts.immunityDelay
  const wipeAll = maxSizeBytes === 0 // ручная чистка = удалить всё

  const now = Date.now()
  const files = []
  for (const e of entries) {
    if (!e.isFile()) continue
    const full = path.join(dir, e.name)
    const s = safeStat(full)
    if (!s) continue
    const mtimeMs = s.mtimeMs || s.mtime?.getTime() || 0
    files.push({ path: full, size: s.size, mtimeMs })
  }

  // Шаг 1: TTL — удаляем файлы старше `ttlSeconds`. immunity не применяется,
  // потому что immunity < TTL по смыслу. wipeAll пропускает этот шаг
  // (всё равно удалится на шаге 3).
  if (!wipeAll && ttlSeconds > 0) {
    const ttlCutoffMs = now - ttlSeconds * 1000
    for (const f of files) {
      if (f.mtimeMs >= ttlCutoffMs) continue
      try {
        fs.unlinkSync(f.path)
        result.freedBytes += f.size
        result.removedCount += 1
        f.deleted = true
      } catch (_) { /* файл занят/пропал — пропускаем */ }
    }
  }

  // Шаг 2: LRU — если суммарный размер > maxSizeBytes, удаляем самые старые.
  // immunityDelay защищает только что открытые файлы (играющее видео).
  const remaining = files.filter(f => !f.deleted)
  let currentSize = remaining.reduce((sum, f) => sum + f.size, 0)
  if (!wipeAll && maxSizeBytes > 0 && currentSize > maxSizeBytes) {
    const immunityCutoffMs = now - immunityDelay * 1000
    // Сортируем по mtime по возрастанию (старые первыми)
    remaining.sort((a, b) => a.mtimeMs - b.mtimeMs)
    for (const f of remaining) {
      if (currentSize <= maxSizeBytes) break
      if (f.mtimeMs >= immunityCutoffMs) continue // immunity — не трогаем
      try {
        fs.unlinkSync(f.path)
        result.freedBytes += f.size
        result.removedCount += 1
        currentSize -= f.size
        f.deleted = true
      } catch (_) {}
    }
  }

  // Шаг 3: wipeAll — удаляем ВСЁ что осталось (для ручной «Очистить кеш»).
  if (wipeAll) {
    for (const f of files) {
      if (f.deleted) continue
      try {
        fs.unlinkSync(f.path)
        result.freedBytes += f.size
        result.removedCount += 1
        f.deleted = true
      } catch (_) {}
    }
  }

  // Финальный remainingBytes — для UI «после чистки осталось X МБ»
  result.remainingBytes = files
    .filter(f => !f.deleted)
    .reduce((sum, f) => sum + f.size, 0)
  return result
}

/**
 * Обновляет mtime файла на «сейчас» — вызывается при каждом чтении файла из
 * cc-media handler. Это правильный LRU: пока файл играется, его mtime
 * обновляется, и cleanup его не тронет.
 *
 * Безопасно если файл не существует — возвращает false без throw.
 *
 * @param {string} absPath
 * @returns {boolean}
 */
export function touchTgMediaFile(absPath) {
  if (!absPath) return false
  try {
    const now = new Date()
    fs.utimesSync(absPath, now, now)
    return true
  } catch (_) { return false }
}
