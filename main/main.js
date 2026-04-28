// v0.84.4 — Refactored: notification, login, backup, window, tray extracted
// v0.87.81 — Refactored: storage, gigachat, ruError extracted to main/utils/
// v0.87.103 — Refactored: setupIPC вынесен в handlers/mainIpcHandlers.js (~230 строк)
import { app, BrowserWindow, session, nativeImage, screen } from 'electron'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { fileURLToPath } from 'url'

import { initLogger, readLogFile, setLogViewerOpener } from './utils/logger.js'
import { setupSession } from './utils/sessionSetup.js'
import { initStorage, migrateSettings } from './utils/storage.js'
import { httpsPostSkipSsl, getGigaChatToken, GIGACHAT_CHAT_URL } from './utils/gigachat.js'
import { ruError } from './utils/ruError.js'
import { initTelegramHandler } from './native/telegramHandler.js'
import { registerCcMediaScheme, registerCcMediaHandler } from './native/ccMediaProtocol.js'
import { initNotifHandlers } from './handlers/notifHandlers.js'
import { initDockPinSystem } from './handlers/dockPinHandlers.js'
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

// ─── GPU стабильность (v0.85.5: fix чёрный экран WebView) ─────────────────────
// Без этих флагов WebView может потерять GPU контекст при переключении вкладок
app.commandLine.appendSwitch('disable-gpu-compositing') // предотвращает потерю GPU контекста
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

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
  console.log('=== ChatCenter v0.87.2 start ===')

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
  storedMessengers.forEach(m => {
    if (m.partition) {
      try { setupSession(session.fromPartition(m.partition)) } catch (e) { console.warn(`[Session] Ошибка для ${m.id}:`, e.message) }
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

  // v0.87.4: инициализация Telegram handler после создания окна (mainWindow ready)
  try {
    initTelegramHandler({ getMainWindow: () => mainWindow, userDataPath: app.getPath('userData') })
    __slog('initTelegramHandler done')
  } catch (e) { console.error('[main] initTelegramHandler error:', e.message) }

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
