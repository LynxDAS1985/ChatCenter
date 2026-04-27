// v0.87.85: общий state Telegram-клиента (singleton).
// Node.js модули кэшируются — один объект на процесс. Все telegram*.js модули
// импортируют отсюда state и Map'ы и используют через state.client, chatEntityMap.get(...).
// НЕ заводить локальные let client = state.client — потеряется обновление.
import { Api } from 'telegram'

// api_id / api_hash зашиты — ChatCenter (Demo33) app на my.telegram.org
export const API_ID = 8392940
export const API_HASH = '33a9605b6f86a176e240cc141e864bf5'

// Изменяемый state клиента — через объект, чтобы все модули видели изменения
export const state = {
  client: null,
  getMainWindowFn: null,
  sessionPath: null,
  avatarsDir: null,
  cachePath: null,
  pendingLogin: null,
  currentAccount: null,
  unreadRescanTimer: null,
}

// v0.87.14: chatId → entity (для markAsRead / sendMessage)
export const chatEntityMap = new Map()

// v0.87.37: chatId → максимальный отправленный maxId (watermark guard в tg:mark-read)
export const markReadMaxSent = new Map()

// v0.87.17: chatId → maxId — собеседник прочитал наши сообщения до этого id (для галочек ✓✓)
export const maxOutgoingRead = new Map()

// v0.87.35: debounce — chatId → timestamp последнего syncPerChatUnread
export const lastPerChatSync = new Map()

export const log = (msg) => { try { console.log('[tg]', msg) } catch(_) {} }

export function emit(channel, data) {
  const win = state.getMainWindowFn?.()
  if (win && !win.isDestroyed()) {
    log(`emit ${channel} ` + (data?.step || (data?.status) || ''))
    win.webContents.send(channel, data)
  } else {
    log(`emit ${channel} SKIPPED — no mainWindow`)
  }
}

export { Api }
