// v0.6 — Tray, сохранение позиции окна, CRUD мессенджеров, ИИ-помощник, тема, ChatMonitor
import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, Notification } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// ─── Простое хранилище (JSON-файл, без ESM-зависимостей) ────────────────────

let storage = null

function initStorage() {
  const filePath = path.join(app.getPath('userData'), 'chatcenter.json')
  let data = {}
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch {}

  const save = () => {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8') } catch (e) {
      console.error('[Storage] Ошибка сохранения:', e.message)
    }
  }

  return {
    get: (key, def = null) => (key in data ? data[key] : def),
    set: (key, val) => { data[key] = val; save() },
    delete: (key) => { delete data[key]; save() }
  }
}

// ─── Дефолтные мессенджеры (копия для main-process) ─────────────────────────

const DEFAULT_MESSENGERS = [
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/k/', color: '#2AABEE', partition: 'persist:telegram', emoji: '✈️', isDefault: true },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', color: '#25D366', partition: 'persist:whatsapp', emoji: '💬', isDefault: true },
  { id: 'vk', name: 'ВКонтакте', url: 'https://vk.com/im', color: '#4C75A3', partition: 'persist:vk', emoji: '🔵', isDefault: true }
]

// ─── Трей ─────────────────────────────────────────────────────────────────────

let tray = null
let forceQuit = false

function createTrayIcon() {
  // Рисуем синий круг 16x16 в формате BGRA
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const r = size / 2 - 1.5

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (d <= r) {
        buf[i] = 238     // B
        buf[i + 1] = 171 // G
        buf[i + 2] = 42  // R
        buf[i + 3] = 255 // A
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function createTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('ЦентрЧатов')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Открыть ЦентрЧатов',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        forceQuit = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)

  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow.show()
    }
  })
}

// ─── Настройка preload-пути ────────────────────────────────────────────────────

function getPreloadPath() {
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/app.preload.js')
  }
  return path.join(__dirname, '../preload/index.js')
}

// ─── Настройка сессий для WebView ─────────────────────────────────────────────

// User-Agent без слова "Electron" — WhatsApp и другие сайты блокируют Electron-браузеры
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

function setupSession(ses) {
  ses.setUserAgent(CHROME_UA)
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
  ses.setPermissionCheckHandler(() => true)

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']

    const csp = headers['content-security-policy'] || headers['Content-Security-Policy']
    if (csp) {
      const fixed = (Array.isArray(csp) ? csp : [csp])
        .map(v => v.replace(/frame-ancestors[^;]*(;|$)/gi, ''))
      headers['content-security-policy'] = fixed
    }
    callback({ responseHeaders: headers })
  })
}

// ─── Главное окно ─────────────────────────────────────────────────────────────

let mainWindow = null

function createWindow() {
  const bounds = storage.get('windowBounds', { width: 1400, height: 900 })

  mainWindow = new BrowserWindow({
    width: bounds.width || 1400,
    height: bounds.height || 900,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#16213e',
      symbolColor: '#ffffff',
      height: 48
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

  // Сохраняем размер/позицию при изменении
  const saveBounds = () => {
    if (mainWindow) storage.set('windowBounds', mainWindow.getBounds())
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  // Свернуть в трей вместо закрытия
  mainWindow.on('close', (e) => {
    const settings = storage.get('settings', { minimizeToTray: true })
    if (!forceQuit && tray && settings.minimizeToTray !== false) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function setupIPC() {
  // Ping
  ipcMain.handle('app:ping', () => ({ ok: true, message: 'ChatCenter работает' }))

  // Информация о приложении
  ipcMain.handle('app:info', () => ({
    ok: true,
    data: { version: app.getVersion(), name: 'ЦентрЧатов', platform: process.platform }
  }))

  // Управление окном
  ipcMain.handle('window:hide', () => {
    mainWindow?.hide()
    return { ok: true }
  })

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
    return { ok: true }
  })

  // Мессенджеры — загрузка
  ipcMain.handle('messengers:load', () => {
    const stored = storage.get('messengers')
    const list = (stored && stored.length > 0) ? stored : DEFAULT_MESSENGERS

    if (!stored || stored.length === 0) {
      storage.set('messengers', DEFAULT_MESSENGERS)
    }

    // Инициализируем сессии для всех мессенджеров
    list.forEach(m => {
      if (m.partition) {
        try { setupSession(session.fromPartition(m.partition)) } catch {}
      }
    })

    return list
  })

  // Мессенджеры — сохранение
  ipcMain.handle('messengers:save', (event, messengers) => {
    storage.set('messengers', messengers)
    // Настраиваем сессии для новых мессенджеров
    messengers.forEach(m => {
      if (m.partition) {
        try { setupSession(session.fromPartition(m.partition)) } catch {}
      }
    })
    return { ok: true }
  })

  // Настройки — загрузка
  ipcMain.handle('settings:get', () => {
    return storage.get('settings', { soundEnabled: true, minimizeToTray: true })
  })

  // Настройки — сохранение
  ipcMain.handle('settings:save', (event, settings) => {
    storage.set('settings', settings)
    return { ok: true }
  })

  // Уведомление (системное)
  ipcMain.handle('app:notify', (event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: true }).show()
    }
    return { ok: true }
  })

  // Пути к preload-файлам (для WebView-мониторинга)
  ipcMain.handle('app:get-paths', () => ({
    monitorPreload: isDev
      ? path.join(__dirname, '../../main/preloads/monitor.preload.js')
      : path.join(__dirname, '../preload/monitor.js')
  }))

  // Смена цвета нативного titlebar при переключении темы
  ipcMain.handle('window:set-titlebar-theme', (event, theme) => {
    if (mainWindow) {
      mainWindow.setTitleBarOverlay({
        color: theme === 'light' ? '#f0f4f8' : '#16213e',
        symbolColor: theme === 'light' ? '#1e293b' : '#ffffff',
        height: 48
      })
    }
    return { ok: true }
  })

  // ИИ-генерация ответов (OpenAI / Anthropic)
  ipcMain.handle('ai:generate', async (event, { messages, settings: aiCfg }) => {
    const { provider, apiKey, model, systemPrompt } = aiCfg || {}
    if (!apiKey) return { ok: false, error: 'API-ключ не указан' }

    try {
      if (provider === 'anthropic') {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model || 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: systemPrompt || '',
            messages
          })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: data.error.message || JSON.stringify(data.error) }
        return { ok: true, result: data.content?.[0]?.text || '' }

      } else {
        // OpenAI (default)
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt || '' },
              ...messages
            ]
          })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: data.error.message || JSON.stringify(data.error) }
        return { ok: true, result: data.choices?.[0]?.message?.content || '' }
      }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
}

// ─── Запуск ───────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Инициализируем хранилище
  storage = initStorage()

  // Настраиваем сессии
  setupSession(session.defaultSession)
  const storedMessengers = storage.get('messengers', DEFAULT_MESSENGERS)
  storedMessengers.forEach(m => {
    if (m.partition) {
      try { setupSession(session.fromPartition(m.partition)) } catch {}
    }
  })

  setupIPC()
  createTray()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // На Windows/Linux выходим только если это явный выход (не сворачивание в трей)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
