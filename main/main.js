// v0.2 — основное окно Electron, IPC handlers (ESM для electron-vite)
import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// electron-vite устанавливает NODE_ENV='development' в dev-режиме
const isDev = process.env.NODE_ENV === 'development'

function getPreloadPath() {
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/app.preload.js')
  }
  return path.join(__dirname, '../preload/index.js')
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#ffffff',
      height: 38
    },
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('app:ping', () => {
  return { ok: true, message: 'ChatCenter работает' }
})

ipcMain.handle('app:info', () => {
  return {
    ok: true,
    data: {
      version: app.getVersion(),
      name: 'ЦентрЧатов',
      platform: process.platform
    }
  }
})

// ─── Настройка сессий для WebView мессенджеров ────────────────────────────────

function setupSession(ses) {
  // Разрешаем все сетевые запросы (снимаем блокировки)
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true)
  })
  ses.setPermissionCheckHandler(() => true)

  // Убираем заголовки, мешающие встраиванию в WebView
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']
    // Разрешаем встраивание через CSP (убираем frame-ancestors none/self)
    const csp = headers['content-security-policy'] || headers['Content-Security-Policy']
    if (csp) {
      const fixed = (Array.isArray(csp) ? csp : [csp])
        .map(v => v.replace(/frame-ancestors[^;]*(;|$)/gi, ''))
      headers['content-security-policy'] = fixed
    }
    callback({ responseHeaders: headers })
  })
}

// ─── Запуск ───────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Настраиваем дефолтную сессию
  setupSession(session.defaultSession)

  // Настраиваем сессии мессенджеров
  const partitions = ['persist:telegram', 'persist:whatsapp', 'persist:vk']
  partitions.forEach(p => setupSession(session.fromPartition(p)))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
