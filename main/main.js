// v0.84.4 — Refactored: notification, login, backup, window, tray extracted
// v0.87.81 — Refactored: storage, gigachat, ruError extracted to main/utils/
// v0.87.135 — Added Windows installer packaging into root dist/
// v0.87.134 — Added start:prodlike script for production-like startup comparison
// v0.87.103 — Refactored: setupIPC вынесен в handlers/mainIpcHandlers.js (~230 строк)
import { app, BrowserWindow, session, nativeImage, screen, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { fileURLToPath } from 'url'

import { initLogger, readLogFile, setLogViewerOpener } from './utils/logger.js'
import { setupSession } from './utils/sessionSetup.js'
import { initStorage, migrateSettings } from './utils/storage.js'
import { httpsPostSkipSsl, getGigaChatToken, GIGACHAT_CHAT_URL } from './utils/gigachat.js'
import { ruError } from './utils/ruError.js'
// v0.89.0 / Этап 4: GramJS backend полностью удалён. Telegram-интеграция работает
// только через TDLib (initTdlibBackendStartup). USE_TDLIB_BACKEND env-флаг и
// fallback на GramJS убраны — больше нет смысла поддерживать две реализации.
import { initTdlibBackendStartup } from './native/backends/tdlibStartup.js'
import { registerCcMediaScheme, registerCcMediaHandler } from './native/ccMediaProtocol.js'
import { initNotifHandlers } from './handlers/notifHandlers.js'
import { initDockPinSystem } from './handlers/dockPinHandlers.js'
// v0.89.41: WebContentsView migration infrastructure (feature-flagged, default OFF)
import { initWebContentsViewIpcHandlers } from './handlers/webContentsViewIpcHandlers.js'
import { initNotificationManager } from './handlers/notificationManager.js'
import { initBackupNotifHandler } from './handlers/backupNotifHandler.js'
import { createWindow as createWindowFromManager } from './utils/windowManager.js'
import { createTray as createTrayFromManager, openLogViewer } from './utils/trayManager.js'
import { registerMainIpcHandlers } from './handlers/mainIpcHandlers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// v0.73.5: disable-features для Badge API НЕ существует в Chromium.
// Блокировка Badge реализована через убийство Service Worker в WebView (App.jsx + monitor.preload.js)

// Устанавливаем имя приложения для уведомлений Windows
// app.setName() НЕ влияет на заголовок тостов Windows — Windows берёт его из AppUserModelId
// По умолчанию Electron ставит "electron.app.Electron" — именно это показывалось в уведомлениях
app.setName('ЦентрЧатов')
if (process.platform === 'win32') {
  app.setAppUserModelId('ЦентрЧатов')
}

// v0.84.4: Logger, session — вынесены в main/utils/logger.js, main/utils/sessionSetup.js
// v0.87.81: SETTINGS_VERSION, migrateSettings, initStorage — вынесены в main/utils/storage.js

let storage = null

// ─── Дефолтные мессенджеры (копия для main-process) ─────────────────────────

const DEFAULT_MESSENGERS = [
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/k/', color: '#2AABEE', partition: 'persist:telegram', emoji: '✈️', isDefault: true },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', color: '#25D366', partition: 'persist:whatsapp', emoji: '💬', isDefault: true },
  { id: 'vk', name: 'ВКонтакте', url: 'https://vk.com/im', color: '#4C75A3', partition: 'persist:vk', emoji: '🔵', isDefault: true },
  { id: 'max', name: 'Макс', url: 'https://web.max.ru/', color: '#2688EB', partition: 'persist:max', emoji: '💎', isDefault: true }
]

// ─── Трей и окно ────────────────────────────────────────────────────────────

let tray = null
let forceQuit = false
let mainWindow = null

// v0.78.9: Overlay и шрифты вынесены в main/utils/overlayIcon.js

// v0.73.9: Блокируем app.setBadgeCount — Chromium вызывает при Badge API из WebView
app.setBadgeCount = function(count) {
  console.log(`[BADGE] app.setBadgeCount(${count}) — ЗАБЛОКИРОВАНО`)
  return false
}

// ─── Notification Manager (инициализация) ───────────────────────────────────

let notifManager = null
const webviewReadySet = new Set() // webContents ids прошедшие warm-up

// v0.80.0: Периодическая очистка кэша — cleanup при quit
app.on('will-quit', () => {
  if (notifManager) notifManager.cleanup()
  try { if (tray && !tray.isDestroyed()) tray.destroy() } catch {}
})

// v0.87.81: ГигаЧат HTTPS, getGigaChatToken — вынесены в main/utils/gigachat.js
// v0.87.81: ruError — вынесена в main/utils/ruError.js

// ─── Notification IPC setup ─────────────────────────────────────────────────

function setupNotifIPC() {
  // v0.82.4: Notification handlers вынесены в main/handlers/notifHandlers.js
  initNotifHandlers({
    getNotifItems: () => notifManager.getNotifItems(),
    setNotifItems: (items) => notifManager.setNotifItems(items),
    getNotifWin: () => notifManager.getNotifWin(),
    getMainWindow: () => mainWindow,
  })

  // v0.82.5: Dock/Pin/Timer система вынесена в main/handlers/dockPinHandlers.js
  initDockPinSystem({
    getMainWindow: () => mainWindow,
    storage,
    isDev,
    __dirname,
    path,
    DEFAULT_MESSENGERS,
  })

  // v0.89.41: WebContentsView migration infrastructure. Feature flag по умолчанию
  // OFF в settings — renderer продолжает использовать <webview> тег. Когда юзер
  // включает useWebContentsView в settings, WebContentsViewSlot создаёт view
  // через эти IPC handlers. Полная замена <webview> — отдельная фаза миграции.
  initWebContentsViewIpcHandlers({
    ipcMain,
    getMainWindow: () => mainWindow,
    sendToRenderer: (channel, payload) => {
      try { mainWindow?.webContents?.send(channel, payload) } catch (_) {}
    },
  })
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function setupIPC() {
  // v0.87.103: основные IPC handlers вынесены в main/handlers/mainIpcHandlers.js
  registerMainIpcHandlers({
    app, isDev, __dirname, BrowserWindow, session,
    storage, DEFAULT_MESSENGERS,
    getMainWindow: () => mainWindow,
    getTray: () => tray,
    getNotifManager: () => notifManager,
    getBackupNotif: () => backupNotif,
    httpsPostSkipSsl, getGigaChatToken, ruError, GIGACHAT_CHAT_URL,
  })

  // v0.87.4 FIX: initTelegramHandler ПЕРЕНЕСЁН — вызывается после создания mainWindow
  // (раньше был тут — mainWindow ещё null → emit в никуда → UI не получал login-step)
}

// ─── Backup notification handler (v0.84.4: extracted) ────────────────────────

let backupNotif = null

// ─── GPU стабильность ─────────────────────────────────────────────────────
// v0.85.6 (6 апреля 2026): `disable-gpu-compositing` добавлен как воркэраунд
// для `<webview>` тега — без него Telegram чернеет при переключении вкладок
// (потеря GPU compositor контекста).
// v0.89.55: switch НЕСОВМЕСТИМ с WebContentsView pilot — overlay рендеринг
// требует GPU compositor (доказано в логах v0.89.46-v0.89.54: даже `about:blank`
// крашит). Решение: условное применение по settings.useWebContentsView.
// Settings читаем СИНХРОННО из chatcenter.json через `app.getPath('userData')`
// (доступен до app.whenReady по Electron docs).
//
// pilot=OFF (default): switch применён → `<webview>` работает, нет чёрного экрана
// pilot=ON: switch НЕ применён → WebContentsView рендерится корректно,
//           `<webview>` не используется (условный рендер в App.jsx),
//           поэтому баг чёрного экрана webview не возникает.
;(function applyGpuStabilitySwitches() {
  let pilotEnabled = false
  try {
    const settingsPath = path.join(app.getPath('userData'), 'chatcenter.json')
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      pilotEnabled = !!data?.settings?.useWebContentsView
    }
  } catch (_) {}
  if (!pilotEnabled) {
    app.commandLine.appendSwitch('disable-gpu-compositing')
    console.log('[startup-main] gpu-compositing DISABLED (webview mode)')
  } else {
    console.log('[startup-main] gpu-compositing ENABLED (WebContentsView pilot mode)')
  }
  app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
})()

// ─── Запуск ──
const __mainStart = Date.now()
const __slog = (l) => console.log(`[startup-main] +${Date.now() - __mainStart}ms ${l}`)
registerCcMediaScheme()
app.whenReady().then(() => {
  __slog('app.whenReady')
  // v0.84.1: Инициализируем логгер ДО всего остального
  initLogger(app.getPath('userData'))
  setLogViewerOpener(openLogViewer)
  __slog('logger init')
  // v0.89.48 (Совет 3): глобальные error handlers в main. До этого тихие крахи
  // (например WebContentsView с битым preload в v0.89.46) не оставляли следа в
  // chatcenter.log — теперь любой uncaught error или promise rejection пишется.
  process.on('uncaughtException', (err) => {
    try { console.error('[main-uncaught]', err?.stack || err) } catch (_) {}
  })
  process.on('unhandledRejection', (reason) => {
    try { console.error('[main-unhandled-rejection]', reason?.stack || reason) } catch (_) {}
  })
  console.log('=== ChatCenter v0.87.135 start ===')

  registerCcMediaHandler(app.getPath('userData'))

  // Инициализируем хранилище (v0.87.81: initStorage в main/utils/storage.js)
  storage = initStorage(app.getPath('userData'))

  // v0.84.1: Миграция settings
  const settings = storage.get('settings', {})
  const storagePath = path.join(app.getPath('userData'), 'chatcenter.json')
  const migrated = migrateSettings(settings, storagePath)
  if (migrated._version !== settings._version) {
    storage.set('settings', migrated)
    console.log('[Settings] Migrated to version', migrated._version)
  }

  // Настраиваем сессии
  setupSession(session.defaultSession)
  const storedMessengers = storage.get('messengers', DEFAULT_MESSENGERS)
  console.log(`[startup-webview] main stored messengers count=${storedMessengers.length} ids=${storedMessengers.map(m => `${m.id}:${m.partition || 'no-partition'}`).join(',')}`)
  storedMessengers.forEach(m => {
    if (m.partition) {
      try {
        console.log(`[startup-webview] main setupSession id=${m.id} name="${m.name || ''}" partition=${m.partition} url=${m.url || ''}`)
        setupSession(session.fromPartition(m.partition))
      } catch (e) { console.warn(`[Session] Ошибка для ${m.id}:`, e.message) }
    }
  })

  // v0.84.4: Инициализируем Notification Manager
  notifManager = initNotificationManager({
    getMainWindow: () => mainWindow,
    storage,
    isDev,
    __dirname,
    path,
    BrowserWindow,
    screen,
    nativeImage,
    http,
    https,
  })

  // v0.84.4: Backup notification handler (web-contents-created)
  backupNotif = initBackupNotifHandler({
    app,
    storage,
    showCustomNotification: notifManager.showCustomNotification,
    getMainWindow: () => mainWindow,
    webviewReadySet,
  })

  setupIPC()
  setupNotifIPC()

  // v0.73.3: overlay рендерится BGRA buffer в main (Canvas удалён)
  tray = createTrayFromManager({
    app,
    path,
    isDev,
    __dirname,
    readLogFile,
    getMainWindow: () => mainWindow,
    setForceQuit: (v) => { forceQuit = v },
  })

  __slog('createWindowFromManager start')
  createWindowFromManager({
    BrowserWindow,
    path,
    isDev,
    __dirname,
    storage,
    getForceQuit: () => forceQuit,
    getTray: () => tray,
    setMainWindow: (w) => { mainWindow = w; __slog('mainWindow created') },
    getMainWindow: () => mainWindow,
  })
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => __slog('did-finish-load'))
    mainWindow.webContents.once('dom-ready', () => __slog('dom-ready'))
  }

  // v0.89.0 / Этап 4: только TDLib backend. GramJS полностью удалён.
  // v0.89.5: applicationVersion из package.json через app.getVersion() —
  // TDLib запишет актуальную версию в session-БД для новых login'ов
  // (видно в Telegram Settings → Active Sessions).
  try {
    const r = initTdlibBackendStartup({
      userDataPath: app.getPath('userData'),
      applicationVersion: app.getVersion(),
      getMainWindow: () => mainWindow,
      ipcMain,
      log: (level, msg) => __slog(`[tdlib] ${level}: ${msg}`),
    })
    if (r.ok) {
      __slog(`TDLib backend started (restored=${r.restoredAccountIds?.length || 0} accounts)`)
    } else {
      console.error('[main] TDLib startup failed:', r.error)
    }
  } catch (e) {
    console.error('[main] TDLib init exception:', e.message)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindowFromManager({
        BrowserWindow,
        path,
        isDev,
        __dirname,
        storage,
        getForceQuit: () => forceQuit,
        getTray: () => tray,
        setMainWindow: (w) => { mainWindow = w },
        getMainWindow: () => mainWindow,
      })
    }
  })
})

app.on('window-all-closed', () => {
  // На Windows/Linux выходим только если это явный выход (не сворачивание в трей)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
