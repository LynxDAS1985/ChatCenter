// v0.89.0 — Stage 4 / Этап 3.11: загрузка аватарок (chat / user profile photos)
//
// Вынесено из tdlibClient.js (тот достиг лимита 500 строк).
//
// Pipeline:
//   1. При updateNewChat/updateUser → scheduleAvatarDownload(record, kind, ownerId, photoFile)
//      - Если file уже скачан (local.is_downloading_completed=true) — мгновенный emit
//      - Иначе сохраняем _pendingAvatars + invoke downloadFile (priority=1, background)
//   2. При updateFile → handleAvatarReady(record, file)
//      - Если file.id есть в _pendingAvatars и file completed → emitAvatarReady
//   3. emitAvatarReady → копируем TDLib file в userData/tg-avatars/${ownerId}.jpg
//      → emit chat:avatar или user:avatar с cc-media://avatars/${ownerId}.jpg URL
//      (cc-media:// — это custom protocol зарегистрированный в ccMediaProtocol.js,
//      Electron renderer security блокирует прямой file:// scheme).

import fs from 'node:fs'
import path from 'node:path'

/**
 * Запускает фоновую загрузку аватарки (low priority).
 * Если photo уже скачана — мгновенно эмитит. Иначе ставит в _pendingAvatars.
 *
 * @param {object} manager — TdlibClientManager (для emit + _pendingAvatars Map)
 * @param {object} record — manager.accounts.get(accountId)
 * @param {'chat'|'user'} kind
 * @param {number|string} ownerId
 * @param {object} photoFile — TDLib `file` объект (обычно chat.photo.small или user.profile_photo.small)
 */
export function scheduleAvatarDownload(manager, record, kind, ownerId, photoFile) {
  if (!photoFile?.id) return
  const fileId = Number(photoFile.id)
  if (photoFile.local?.is_downloading_completed && photoFile.local?.path) {
    emitAvatarReady(manager, record, kind, ownerId, photoFile.local.path)
    return
  }
  manager._pendingAvatars.set(fileId, {
    accountId: record.accountId, kind, ownerId: Number(ownerId),
  })
  if (record.client?.invoke) {
    record.client.invoke({
      '@type': 'downloadFile', file_id: fileId, priority: 1,
      offset: 0, limit: 0, synchronous: false,
    }).then((r) => {
      if (r?.local?.is_downloading_completed && r.local.path) {
        handleAvatarReady(manager, record, r)
      }
    }).catch((e) => {
      // v0.89.0 / Этап 3.12: логируем (раньше silent скрывал FILE_REFERENCE_INVALID
      // и подобные ошибки → не было видно почему аватарки не качаются).
      // v0.89.2: чистим pending запись чтобы не висела вечно если TDLib никогда
      // не пришлёт `updateFile` для этого fileId (например, чат удалён или
      // FILE_REFERENCE_INVALID — TDLib не делает retry автоматически).
      manager._pendingAvatars.delete(fileId)
      try {
        manager.emit('avatar:error', { accountId: record.accountId, fileId, kind, ownerId, error: e?.message || String(e) })
      } catch (_) {}
    })
  }
}

/**
 * Обрабатывает updateFile event — если это аватарка из _pendingAvatars и
 * она готова, эмитит chat:avatar / user:avatar.
 */
export function handleAvatarReady(manager, record, file) {
  if (!file?.id || !file.local?.is_downloading_completed || !file.local?.path) return
  const pending = manager._pendingAvatars.get(Number(file.id))
  if (!pending) return
  if (pending.accountId !== record.accountId) return
  manager._pendingAvatars.delete(Number(file.id))
  emitAvatarReady(manager, record, pending.kind, pending.ownerId, file.local.path)
}

/**
 * Копирует TDLib file в tg-avatars/, СОХРАНЯЕТ в snapshot cache и эмитит event.
 *
 * v0.89.6 — кеширование url в record.chatAvatars / record.userAvatars (cache)
 * до emit, чтобы tg:get-chats / tg:get-accounts snapshot вернули url даже если
 * UI пропустил event (race на старте — UI монтируется после autoRestore →
 * finalizeAccount → download → emitAvatarReady).
 *
 * Для kind='user' если ownerId === record.ownUserId — эмитим дополнительно
 * `account:update {id, avatar}` чтобы UI обновил аватарку аккаунта в боковой
 * панели (не только в сообщениях — там через tg:sender-avatar).
 */
export function emitAvatarReady(manager, record, kind, ownerId, absPath) {
  const accountId = record.accountId
  const url = copyToAvatarsDir(absPath, ownerId)
  if (!url) return
  const numericOwnerId = Number(ownerId)
  if (kind === 'chat') {
    record.chatAvatars?.set(numericOwnerId, url)
    manager.emit('chat:avatar', { accountId, chatId: `${accountId}:${ownerId}`, avatarPath: url })
  } else if (kind === 'user') {
    record.userAvatars?.set(numericOwnerId, url)
    manager.emit('user:avatar', { accountId, userId: String(ownerId), avatarPath: url })
    // v0.89.6: если это own avatar — эмитим account:update для обновления sidebar
    if (record.ownUserId && numericOwnerId === Number(record.ownUserId)) {
      manager.emit('account:update', { id: accountId, messenger: 'telegram', avatar: url })
    }
  }
}

/**
 * Копирует TDLib downloaded avatar в %APPDATA%/ЦентрЧатов/tg-avatars/${ownerId}.jpg.
 * Совместимо с cc-media:// protocol handler (см. ccMediaProtocol.js).
 * Возвращает cc-media URL или null если что-то не так.
 *
 * @param {string} srcPath — абсолютный путь к файлу TDLib
 * @param {number|string} ownerId
 * @returns {string|null}
 */
export function copyToAvatarsDir(srcPath, ownerId) {
  try {
    if (!srcPath || !fs.existsSync(srcPath)) return null
    // Из TDLib path извлекаем userData dir.
    // TDLib files: %APPDATA%/ЦентрЧатов/tdlib-sessions/X/files/profile_photos/...jpg
    // → userData = %APPDATA%/ЦентрЧатов/
    const tdlibSessionsIdx = srcPath.indexOf('tdlib-sessions')
    if (tdlibSessionsIdx < 0) return null
    const userDataDir = srcPath.slice(0, tdlibSessionsIdx)
    const avatarsDir = path.join(userDataDir, 'tg-avatars')
    try { fs.mkdirSync(avatarsDir, { recursive: true }) } catch (_) {}
    const fileName = `${String(ownerId)}.jpg`
    const destPath = path.join(avatarsDir, fileName)
    const srcSize = fs.statSync(srcPath).size
    if (srcSize <= 0) return null
    if (!fs.existsSync(destPath) || fs.statSync(destPath).size !== srcSize) {
      fs.copyFileSync(srcPath, destPath)
    }
    return `cc-media://avatars/${encodeURIComponent(fileName)}`
  } catch (_) { return null }
}
