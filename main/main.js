// v0.84.4 — Refactored: notification, login, backup, window, tray extracted
import { app, BrowserWindow, ipcMain, session, nativeImage, Notification, shell, clipboard, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'url'

import { createTrayBadgeIcon, createOverlayIcon } from './utils/overlayIcon.js'
import { initLogger, readLogFile, clearLogFile, setLogViewerOpener, getLogFilePath } from './utils/logger.js'
import { setupSession } from './utils/sessionSetup.js'
import { initAIHandlers } from './handlers/aiHandlers.js'
import { initTelegramHandler } from './native/telegramHandler.js'
import { registerCcMediaScheme, registerCcMediaHandler } from './native/ccMediaProtocol.js'
import { initNotifHandlers } from './handlers/notifHandlers.js'
import { initDockPinSystem } from './handlers/dockPinHandlers.js'
import { initNotificationManager } from './handlers/notificationManager.js'
import { initAILoginHandler } from './handlers/aiLoginHandler.js'
import { initBackupNotifHandler } from './handlers/backupNotifHandler.js'
import { createWindow as createWindowFromManager } from './utils/windowManager.js'
import { createTray as createTrayFromManager, openLogViewer } from './utils/trayManager.js'
import { registerWindowHandlers } from './handlers/windowHandlers.js'
import { registerPhotoViewerHandler } from './handlers/photoViewerHandler.js'
import { registerVideoPlayerHandler } from './handlers/videoPlayerHandler.js'

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

// ─── Версионирование settings (v0.84.1) ────────────────────────────────────
const SETTINGS_VERSION = 2

function migrateSettings(settings, storagePath) {
  if (!settings || typeof settings !== 'object') return { _version: SETTINGS_VERSION, soundEnabled: true, minimizeToTray: true }
  // Backup перед миграцией
  if ((settings._version || 1) < SETTINGS_VERSION && storagePath) {
    try { fs.copyFileSync(storagePath, storagePath + '.bak'); console.log('[Settings] Backup created') } catch {}
  }
  const v = settings._version || 1
  // Миграция v1 → v2: добавлены поля notificationsEnabled, overlayMode
  if (v < 2) {
    if (settings.notificationsEnabled === undefined) settings.notificationsEnabled = true
    if (settings.overlayMode === undefined) settings.overlayMode = 'all'
  }
  settings._version = SETTINGS_VERSION
  return settings
}

// ─── Простое хранилище (JSON-файл, без ESM-зависимостей) ────────────────────

let storage = null

function initStorage() {
  const filePath = path.join(app.getPath('userData'), 'chatcenter.json')
  let data = {}
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch (e) { console.warn('[Storage] Не удалось прочитать chatcenter.json:', e.message) }

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

// ─── ГигаЧат: HTTPS без проверки SSL-сертификата Сбербанка ───────────────────

const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
const GIGACHAT_CHAT_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions'
const aiTokenCache = {}

function httpsPostSkipSsl(url, bodyStr, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const agent = new https.Agent({ rejectUnauthorized: false })
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
      agent
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(data) }) }
        catch { reject(new Error(`GigaChat parse error: ${data.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

async function getGigaChatToken(clientId, clientSecret) {
  const cacheKey = `${clientId}:${clientSecret}`
  const cached = aiTokenCache[cacheKey]
  if (cached && cached.expires_at > Date.now() + 60000) return cached.access_token

  const credentials = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64')
  const result = await httpsPostSkipSsl(
    GIGACHAT_AUTH_URL,
    'scope=GIGACHAT_API_PERS',
    {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'RqUID': crypto.randomUUID()
    }
  )
  if (!result.ok || !result.data.access_token) {
    throw new Error(`GigaChat auth failed: ${result.data?.message || 'нет токена'}`)
  }
  aiTokenCache[cacheKey] = result.data
  return result.data.access_token
}

// ─── Перевод API-ошибок на русский ───────────────────────────────────────────

function ruError(msg) {
  if (!msg) return 'Неизвестная ошибка'
  const m = msg.toLowerCase()
  if (m.includes('exceeded') && m.includes('quota') || m.includes('insufficient_quota') || m.includes('insufficient balance') || m.includes('insufficient_balance'))
    return 'Недостаточно средств на балансе. Пополните счёт на сайте провайдера'
  if (m.includes('invalid api key') || m.includes('incorrect api key') || m.includes('no api key'))
    return 'Неверный API-ключ. Проверьте ключ в настройках'
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Слишком много запросов. Подождите немного и попробуйте снова'
  if (m.includes('model') && (m.includes('not exist') || m.includes('not found') || m.includes('does not exist')))
    return 'Указанная модель не найдена. Проверьте название модели'
  if (m.includes('context') && m.includes('length'))
    return 'Сообщение слишком длинное для этой модели'
  if (m.includes('can\'t decode') || m.includes('cannot decode') || m.includes('decode') && m.includes('header'))
    return 'Неверный формат Client ID или Client Secret. Убедитесь что скопировали без пробелов'
  if (m.includes('unauthorized') || m.includes('authentication') || m.includes('authorization'))
    return 'Ошибка авторизации. Проверьте Client ID и Client Secret'
  if (m.includes('billing') || m.includes('payment'))
    return 'Проблема с оплатой. Проверьте платёжные данные у провайдера'
  if (m.includes('overloaded') || m.includes('capacity') || m.includes('unavailable'))
    return 'Сервер провайдера перегружен. Попробуйте позже'
  if (m.includes('network') || m.includes('fetch') || m.includes('connect'))
    return 'Нет соединения с сервером провайдера. Проверьте интернет'
  if (m.includes('timeout'))
    return 'Превышено время ожидания ответа от провайдера'
  return msg // не переводим неизвестные — оставляем как есть
}

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
  // Ping
  ipcMain.handle('app:ping', () => ({ ok: true, message: 'ChatCenter работает' }))

  // v0.84.2: Чтение лога для модального окна
  ipcMain.handle('app:read-log', () => readLogFile(500))
  ipcMain.handle('app:clear-log', () => { clearLogFile(); return 'ok' })
  ipcMain.handle('app:open-external', (_, url) => { try { shell.openExternal(url) } catch(_) {} return { ok: true } })
  // v0.84.2: Renderer логирование — пишет в тот же файл лога
  ipcMain.on('app:log', (event, { level, message }) => {
    const ts = new Date().toLocaleString('sv-SE').replace('T', ' ')
    const line = `[${ts}] [R:${level || 'INFO'}] ${message}\n`
    const lp = getLogFilePath()
    if (lp) try { fs.appendFileSync(lp, line) } catch {}
  })

  // v0.82.0: Загрузка per-messenger notification hook
  ipcMain.handle('app:read-hook', (event, hookType) => {
    try {
      const safe = String(hookType).replace(/[^a-z]/gi, '')
      const hooksDir = isDev
        ? path.join(__dirname, '../../main/preloads/hooks')
        : path.join(__dirname, '../preloads/hooks')
      return fs.readFileSync(path.join(hooksDir, safe + '.hook.js'), 'utf8')
    } catch(e) { return '' }
  })

  // Информация о приложении
  ipcMain.handle('app:info', () => ({
    ok: true,
    data: { version: app.getVersion(), name: 'ЦентрЧатов', platform: process.platform }
  }))

  // Управление окном — вынесено в windowHandlers.js (hide/minimize/set-always-on-top)
  registerWindowHandlers(() => mainWindow)
  // v0.87.28: отдельное окно просмотра фото
  registerPhotoViewerHandler()
  // v0.87.34: отдельное окно плеера видео со streaming через cc-media://
  registerVideoPlayerHandler()

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
        try { setupSession(session.fromPartition(m.partition)) } catch (e) { console.warn(`[Session] Ошибка для ${m.id}:`, e.message) }
      }
    })

    return list
  })

  // Мессенджеры — сохранение
  ipcMain.handle('messengers:save', (event, messengers) => {
    // v0.87.1: native_cc — виртуальная вкладка, добавляется программно при старте, не сохранять
    const filtered = (messengers || []).filter(m => !m.isNative && m.id !== 'native_cc')
    storage.set('messengers', filtered)
    // Настраиваем сессии для новых мессенджеров
    filtered.forEach(m => {
      if (m.partition) {
        try { setupSession(session.fromPartition(m.partition)) } catch (e) { console.warn(`[Session] Ошибка для ${m.id}:`, e.message) }
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
    const prev = storage.get('settings', {})
    storage.set('settings', settings)
    // v0.67.0: уведомить dock при изменении showDockEmpty
    if (prev.showDockEmpty !== settings.showDockEmpty && dockWin && !dockWin.isDestroyed()) {
      dockWin.webContents.send('dock:show-empty', !!settings.showDockEmpty)
      if (!settings.showDockEmpty) {
        // Проверить есть ли задачи — если нет, скрыть dock
        let hasDocked = false
        for (const [, item] of pinItems) {
          if (item.inDock) { hasDocked = true; break }
        }
        if (!hasDocked) dockWin.hide()
      } else {
        // Показать dock если его сейчас нет
        if (!dockWin.isVisible()) dockWin.showInactive()
      }
    }
    return { ok: true }
  })

  // Открыть URL в системном браузере (для получения API-ключей)
  ipcMain.handle('shell:open-url', (_, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url)
    }
    return { ok: true }
  })

  // Лог ошибок API — дописывает строку в ai-errors.log в userData
  ipcMain.handle('ai:log-error', (_, { provider, errorText }) => {
    try {
      const logPath = path.join(app.getPath('userData'), 'ai-errors.log')
      const now = new Date().toLocaleString('ru-RU', { hour12: false }).replace(',', '')
      const line = `${now}  ${(provider || 'unknown').padEnd(10)}  ${errorText || ''}\n`
      fs.appendFileSync(logPath, line, 'utf8')
    } catch {}
    return { ok: true }
  })

  // Чтение лога ошибок
  ipcMain.handle('ai:get-error-log', () => {
    try {
      const logPath = path.join(app.getPath('userData'), 'ai-errors.log')
      const text = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
      return { ok: true, text }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // Очистка лога ошибок
  ipcMain.handle('ai:clear-error-log', () => {
    try {
      const logPath = path.join(app.getPath('userData'), 'ai-errors.log')
      fs.writeFileSync(logPath, '', 'utf8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // Чтение буфера обмена через main process (работает независимо от фокуса окна)
  ipcMain.handle('clipboard:read', () => clipboard.readText())

  // v0.84.4: AI Login handler вынесен в main/handlers/aiLoginHandler.js
  initAILoginHandler({
    getMainWindow: () => mainWindow,
    isDev,
    __dirname,
    path,
    BrowserWindow,
    session,
  })

  // Кастомное уведомление (Messenger Ribbon — v0.39.0)
  ipcMain.handle('app:custom-notify', async (event, { title, body, fullBody, iconUrl, iconDataUrl, color, emoji, messengerName, messengerId, dismissMs, senderName, chatTag }) => {
    try {
      const result = await notifManager.showCustomNotification({ title, body, fullBody, iconUrl, iconDataUrl, color, emoji, messengerName, messengerId, dismissMs, senderName, chatTag })
      return { ok: !!result, id: result }
    } catch (e) {
      console.error('[NotifManager] Ошибка:', e.message)
      return { ok: false, error: e.message }
    }
  })

  // v0.84.0: Регистрация webContentsId → messengerId (для multi-account)
  ipcMain.handle('app:register-webview', (event, { webContentsId, messengerId }) => {
    if (webContentsId && messengerId) backupNotif.registerWebContentMessenger(webContentsId, messengerId)
  })

  // Пути к preload-файлам (для WebView-мониторинга)
  ipcMain.handle('app:get-paths', () => ({
    monitorPreload: isDev
      ? path.join(__dirname, '../../main/preloads/monitor.preload.cjs')
      : path.join(__dirname, '../preload/monitor.mjs')
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

  // v0.74.5: Overlay badge + тултип трея + раздельный счётчик личные/каналы
  // Принимает { count, personal, channels, breakdown: [{ name, count, personal, channels }] }
  ipcMain.handle('tray:set-badge', async (_, data) => {
    const count = typeof data === 'number' ? data : (data.count || 0)
    const personal = (typeof data === 'object' && data.personal) || 0
    const channels = (typeof data === 'object' && data.channels) || 0
    const breakdown = (typeof data === 'object' && data.breakdown) || []
    const overlayMode = (typeof data === 'object' && data.overlayMode) || 'personal'
    console.log(`[OVERLAY] tray:set-badge count=${count} personal=${personal} channels=${channels} mode=${overlayMode}`)

    // v0.74.6: Трей — чистая иконка без бейджа (бейдж только на overlay)
    if (tray && !tray.isDestroyed()) {
      // Тултип трея с разбивкой по мессенджерам
      if (count > 0 && breakdown.length > 0) {
        const lines = breakdown.map(b => {
          if (b.personal != null && b.channels != null && (b.personal > 0 || b.channels > 0)) {
            return `${b.name}: ${b.count} (${b.personal} личных, ${b.channels} каналов)`
          }
          return `${b.name}: ${b.count}`
        })
        tray.setToolTip(`ЦентрЧатов\n${lines.join('\n')}\nВсего: ${count} (${personal} личных, ${channels} каналов)`)
      } else if (count > 0) {
        tray.setToolTip(`ЦентрЧатов — ${count} непрочитанных`)
      } else {
        tray.setToolTip('ЦентрЧатов')
      }
    }

    // v0.75.0: Overlay — одно число, режим из настроек: personal / all / off
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      if (overlayMode === 'off') {
        mainWindow.setOverlayIcon(null, '')
        console.log(`[OVERLAY] overlay отключён (mode=off)`)
      } else {
        const overlayCount = overlayMode === 'personal' ? personal : count
        if (overlayCount > 0) {
          const overlayIcon = createOverlayIcon(overlayCount)
          const desc = overlayMode === 'personal'
            ? `${personal} личных (${count} всего)`
            : `${count} непрочитанных`
          mainWindow.setOverlayIcon(overlayIcon, desc)
          console.log(`[OVERLAY] setOverlayIcon(${overlayCount}) mode=${overlayMode} personal=${personal} total=${count}`)
        } else {
          mainWindow.setOverlayIcon(null, '')
          console.log(`[OVERLAY] setOverlayIcon(null) — очищен`)
        }
      }
    }
    return { ok: true }
  })

  // v0.82.2: AI handlers вынесены в main/handlers/aiHandlers.js
  initAIHandlers({ httpsPostSkipSsl, getGigaChatToken, ruError, GIGACHAT_CHAT_URL })

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

  // Инициализируем хранилище
  storage = initStorage()

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
