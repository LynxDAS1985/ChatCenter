// v0.89.3 — Stage 4 / Этап 4-аудит-2: chat-level admin actions через TDLib.
//
// Покрывает три IPC-канала которые до v0.89.2 были stub'ами:
//   - setMute        → setChatNotificationSettings (полный 16-полевой объект)
//   - getCleanupStats → fs-scan tdlib-sessions/ с byCategory разбивкой
//
// v0.89.3 фиксы UI-контрактов:
//   - setMute теперь принимает `muteUntil` (Unix timestamp, как шлёт UI MuteMenu),
//     конвертирует в TDLib `mute_for = max(0, muteUntil - now)`. Раньше handler
//     читал поле `muteFor` которого UI не шлёт — `setMute` всегда давал unmute.
//   - getCleanupStats теперь возвращает { totalFiles, totalBytes, byCategory:
//     { session, avatars, cache, media, tmp } } сканом filesystem (как GramJS делал).
//     Раньше возвращал { bytes, dbBytes, fileCount } через `getStorageStatisticsFast`
//     и UI показывал пустоту в предпросмотре logout.
//   - togglePin (toggleChatIsPinned) удалён — UI не зовёт его. Закреп СООБЩЕНИЯ
//     (`pinMessage`/`unpinMessage`) живёт в tdlibMessages.js.
//
// Документация:
//   https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1set_chat_notification_settings.html

import fs from 'node:fs'
import path from 'node:path'

/**
 * Mute/unmute чат через TDLib setChatNotificationSettings.
 *
 * UI MuteMenu.jsx:36 формирует:
 *   - «Включить»  → muteUntil = 0
 *   - «На час»    → muteUntil = Math.floor(Date.now()/1000) + 3600
 *   - «Навсегда»  → muteUntil = 2147483647 (INT_MAX)
 *
 * TDLib `mute_for` — duration в секундах от now (а не absolute timestamp).
 * Конвертация: mute_for = max(0, muteUntil - now).
 *
 * @param {object} client
 * @param {number|string} chatId — TDLib chat_id
 * @param {number} muteUntil — Unix timestamp (секунды) до которого приглушено,
 *   0 = unmute
 * @returns {Promise<{ ok: boolean, error?: string, code?: number }>}
 */
export async function setMute(client, chatId, muteUntil) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  const until = Number(muteUntil) || 0
  const now = Math.floor(Date.now() / 1000)
  // mute_for — это int32 по TDLib спеке. Math.max защищает от отрицательных
  // (если UI прислал устаревший timestamp). Очень большое значение (≈ INT_MAX
  // для «навсегда») TDLib примет — это допустимый int32.
  const muteFor = Math.max(0, until - now)
  try {
    await client.invoke({
      '@type': 'setChatNotificationSettings',
      chat_id: Number(chatId),
      notification_settings: {
        '@type': 'chatNotificationSettings',
        use_default_mute_for: false,
        mute_for: muteFor,
        use_default_sound: true,
        sound_id: 0,
        use_default_show_preview: true,
        show_preview: false,
        use_default_mute_stories: true,
        mute_stories: false,
        use_default_story_sound: true,
        story_sound_id: 0,
        use_default_show_story_poster: true,
        show_story_poster: false,
        use_default_disable_pinned_message_notifications: true,
        disable_pinned_message_notifications: false,
        use_default_disable_mention_notifications: true,
        disable_mention_notifications: false,
      },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || String(e), code: e?.code }
  }
}

// ──────────────────────────────────────────────────────────────────────
// getCleanupStats — filesystem scan по TDLib session-папкам
// ──────────────────────────────────────────────────────────────────────

/**
 * Категоризация подпапок TDLib `filesDirectory` (tdlib-sessions/{accountId}/files/).
 * Структура взята из TDLib исходников (Td/telegram/files/FileLoader.cpp) —
 * TDLib создаёт строго эти имена директорий для каждого file_type.
 *
 * UI ожидает 5 категорий (AccountContextMenu.jsx CleanupRow):
 *   - session  → db.sqlite + journal/wal (в корне tdlib-sessions/{accountId}/)
 *   - avatars  → profile_photos/ + ../../tg-avatars/{accountId}*.jpg
 *   - media    → photos, videos, voice, video_notes, documents, music
 *   - cache    → stickers, thumbnails, wallpapers, animations
 *   - tmp      → temp
 */
const FILES_CATEGORY = {
  profile_photos: 'avatars',
  photos: 'media',
  videos: 'media',
  voice: 'media',
  video_notes: 'media',
  documents: 'media',
  music: 'media',
  audio: 'media',
  animations: 'cache',
  stickers: 'cache',
  thumbnails: 'cache',
  wallpapers: 'cache',
  temp: 'tmp',
}

function statFile(p) {
  try { return fs.statSync(p) } catch (_) { return null }
}

function walkAndCategorize(rootDir, category, acc) {
  let entries
  try { entries = fs.readdirSync(rootDir, { withFileTypes: true }) }
  catch (_) { return }
  for (const e of entries) {
    const full = path.join(rootDir, e.name)
    if (e.isDirectory()) {
      walkAndCategorize(full, category, acc)
    } else if (e.isFile()) {
      const s = statFile(full)
      if (!s) continue
      acc.byCategory[category] = acc.byCategory[category] || { files: 0, bytes: 0 }
      acc.byCategory[category].files += 1
      acc.byCategory[category].bytes += s.size
      acc.totalFiles += 1
      acc.totalBytes += s.size
    }
  }
}

/**
 * Сканирует TDLib session-папки и общую tg-avatars/ папку, возвращает breakdown
 * по категориям совместимый с UI AccountContextMenu предпросмотром logout.
 *
 * @param {object} manager — TdlibClientManager (для listAccounts)
 * @param {string} userDataDir — корневой userData (для tg-avatars/ и tdlib-sessions/)
 * @returns {{ ok: true, totalFiles: number, totalBytes: number, byCategory: {} }}
 */
export function getCleanupStats(manager, userDataDir) {
  const acc = { totalFiles: 0, totalBytes: 0, byCategory: {} }
  if (!userDataDir) return { ok: true, ...acc }

  const sessionsDir = path.join(userDataDir, 'tdlib-sessions')
  let accounts = []
  try {
    accounts = fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
  } catch (_) { /* no sessions yet */ }

  for (const accountDir of accounts) {
    const root = path.join(sessionsDir, accountDir)

    // 1. session — корневые db.sqlite + журналы (НЕ заходя в files/)
    let topEntries
    try { topEntries = fs.readdirSync(root, { withFileTypes: true }) }
    catch (_) { topEntries = [] }
    for (const e of topEntries) {
      if (e.isDirectory()) continue
      if (!e.isFile()) continue
      const s = statFile(path.join(root, e.name))
      if (!s) continue
      acc.byCategory.session = acc.byCategory.session || { files: 0, bytes: 0 }
      acc.byCategory.session.files += 1
      acc.byCategory.session.bytes += s.size
      acc.totalFiles += 1
      acc.totalBytes += s.size
    }

    // 2. files/{subdir} — категоризируем по таблице FILES_CATEGORY
    const filesDir = path.join(root, 'files')
    let fileSubdirs
    try { fileSubdirs = fs.readdirSync(filesDir, { withFileTypes: true }) }
    catch (_) { continue }
    for (const sub of fileSubdirs) {
      if (!sub.isDirectory()) continue
      const category = FILES_CATEGORY[sub.name] || 'cache'
      walkAndCategorize(path.join(filesDir, sub.name), category, acc)
    }
  }

  // 3. tg-avatars/ — наша cc-media кэш-папка (см. tdlibAvatars.js copyToAvatarsDir)
  const avatarsCacheDir = path.join(userDataDir, 'tg-avatars')
  walkAndCategorize(avatarsCacheDir, 'avatars', acc)

  return { ok: true, ...acc }
}
