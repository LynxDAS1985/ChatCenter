// v0.87.0: IPC handlers для нативного Telegram клиента через GramJS.
// Пока STUB — реальная GramJS интеграция подключится после `npm install telegram`.
// Контракт IPC зафиксирован: tg:login-start, tg:login-code, tg:login-password, tg:login-cancel,
// tg:get-chats, tg:get-messages, tg:send-message, tg:remove-account.
// События в обратную сторону: tg:account-update, tg:login-step, tg:chats, tg:messages, tg:new-message.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

let client = null           // GramJS клиент (инстанс)
let mainWindowRef = null    // для отправки событий
let pendingLogin = null     // { phoneResolve, codeResolve, passwordResolve }
let sessionPath = null

export function initTelegramHandler({ mainWindow, userDataPath }) {
  mainWindowRef = mainWindow
  sessionPath = path.join(userDataPath, 'tg-session.txt')

  ipcMain.handle('tg:login-start', async (_, { phone }) => {
    console.log('[tg-stub] login-start phone=' + phone)
    return {
      ok: false,
      stub: true,
      error: 'GramJS не установлен. Выполните: npm install telegram input better-sqlite3 — затем перезапустите программу.'
    }
  })

  ipcMain.handle('tg:login-code', async (_, { code }) => {
    try {
      if (pendingLogin?.codeResolve) {
        pendingLogin.codeResolve(code)
        return { ok: true }
      }
      return { ok: false, error: 'Нет активной авторизации (STUB режим)', stub: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('tg:login-password', async (_, { password }) => {
    try {
      if (pendingLogin?.passwordResolve) {
        pendingLogin.passwordResolve(password)
        return { ok: true }
      }
      return { ok: false, error: 'Нет активного шага 2FA (STUB режим)', stub: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('tg:login-cancel', async () => {
    pendingLogin = null
    emit('tg:login-step', null)
    return { ok: true }
  })

  ipcMain.handle('tg:get-chats', async (_, { accountId }) => {
    return { ok: false, error: 'GramJS не подключён', stub: true, chats: [] }
  })

  ipcMain.handle('tg:get-messages', async (_, { chatId, limit }) => {
    return { ok: false, error: 'GramJS не подключён', stub: true, messages: [] }
  })

  ipcMain.handle('tg:send-message', async (_, { chatId, text }) => {
    return { ok: false, error: 'GramJS не подключён', stub: true }
  })

  ipcMain.handle('tg:remove-account', async (_, { accountId }) => {
    try {
      if (client) { try { await client.disconnect() } catch(_) {} client = null }
      if (sessionPath && fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // При старте — восстановить сохранённую сессию если есть
  if (fs.existsSync(sessionPath)) {
    // TODO: восстановление через GramJS
    console.log('[tg] Session file exists, will restore after GramJS install')
  }
}

function emit(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data)
  }
}
