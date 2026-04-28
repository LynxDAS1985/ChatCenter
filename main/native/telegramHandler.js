// v0.87.85: тонкий роутер. Логика разнесена по telegram*.js модулям (Шаг 7/7 разбиения).
// Архитектура: telegramState.js — singleton state + Map'ы + emit. Все остальные модули
// импортируют отсюда и используют через state.client / chatEntityMap.get(...).
//
// IPC каналы: tg:login-start/code/password/cancel (telegramAuth)
//             tg:get-chats / get-cached-chats / mark-read / pin / rescan-unread /
//             get-pinned / refresh-avatar / set-typing / remove-account (telegramChats)
//             tg:get-messages / send-message / send-file / send-clipboard-image /
//             forward / delete-message / edit-message (telegramMessages)
//             tg:download-video / download-media / cleanup-media / media-cache-size (telegramMedia)
// События: tg:account-update, tg:login-step, tg:chats, tg:messages, tg:new-message,
//          tg:chat-unread-sync, tg:unread-bulk-sync, tg:chat-avatar, tg:typing, tg:read.
import path from 'node:path'
import fs from 'node:fs'
import { state, log } from './telegramState.js'
import { initAuthHandlers, autoRestoreSession } from './telegramAuth.js'
import { initChatsHandlers } from './telegramChatsIpc.js'
import { initMessagesHandlers } from './telegramMessages.js'
import { initMediaHandlers } from './telegramMedia.js'

export function initTelegramHandler({ getMainWindow, userDataPath }) {
  state.getMainWindowFn = getMainWindow
  state.sessionPath = path.join(userDataPath, 'tg-session.txt')
  state.avatarsDir = path.join(userDataPath, 'tg-avatars')
  state.cachePath = path.join(userDataPath, 'tg-cache.json')
  try { fs.mkdirSync(state.avatarsDir, { recursive: true }) } catch(_) {}
  log(`init, session=${state.sessionPath}, avatars=${state.avatarsDir}, cache=${state.cachePath}`)

  cleanupOldMediaOnStart(userDataPath)

  // Регистрируем все IPC handlers
  initAuthHandlers()
  initChatsHandlers()
  initMessagesHandlers()
  initMediaHandlers()

  // v0.87.12: дожидаемся когда renderer точно готов принять events
  const startRestore = () => {
    const win = state.getMainWindowFn?.()
    if (!win || win.isDestroyed()) {
      setTimeout(startRestore, 500)
      return
    }
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => autoRestoreSession().catch(e => log('autoRestore error: ' + e.message)), 500)
      })
    } else {
      autoRestoreSession().catch(e => log('autoRestore error: ' + e.message))
    }
  }
  setTimeout(startRestore, 1000)
}

// v0.87.27 / v0.87.35: авто-очистка старых медиа при старте — по возрасту + LRU-квоте (2 ГБ)
function cleanupOldMediaOnStart(userDataPath) {
  try {
    const mediaDir = path.join(userDataPath, 'tg-media')
    if (!fs.existsSync(mediaDir)) return
    const MAX_AGE = 30 * 86400000  // 30 дней
    const MAX_BYTES = 2 * 1024 * 1024 * 1024  // 2 ГБ квота
    const cutoff = Date.now() - MAX_AGE
    const entries = []
    for (const f of fs.readdirSync(mediaDir)) {
      const fp = path.join(mediaDir, f)
      try {
        const st = fs.statSync(fp)
        entries.push({ fp, size: st.size, mtime: st.mtimeMs })
      } catch(_) {}
    }
    let removed = 0, freed = 0
    // По возрасту
    for (const e of entries) {
      if (e.mtime < cutoff) {
        try { fs.unlinkSync(e.fp); freed += e.size; removed++; e.deleted = true } catch(_) {}
      }
    }
    // LRU квота
    const rem = entries.filter(e => !e.deleted).sort((a, b) => a.mtime - b.mtime)
    let total = rem.reduce((s, e) => s + e.size, 0)
    for (const e of rem) {
      if (total <= MAX_BYTES) break
      try { fs.unlinkSync(e.fp); total -= e.size; freed += e.size; removed++ } catch(_) {}
    }
    if (removed > 0) log(`auto cleanup: removed=${removed} freed=${(freed/1024/1024).toFixed(1)}MB keep=${(total/1024/1024).toFixed(1)}MB`)
  } catch(_) {}
}
