// v0.44.1 — Фикс дубля ribbon при 2+ аккаунтах + видимая кнопка Прочитано
import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, Notification, shell, clipboard, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'url'

import { createTrayBadgeIcon, createOverlayIcon } from './utils/overlayIcon.js'
import { initAIHandlers } from './handlers/aiHandlers.js'
import { initNotifHandlers } from './handlers/notifHandlers.js'
import { initDockPinSystem } from './handlers/dockPinHandlers.js'

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
  { id: 'vk', name: 'ВКонтакте', url: 'https://vk.com/im', color: '#4C75A3', partition: 'persist:vk', emoji: '🔵', isDefault: true },
  { id: 'max', name: 'Макс', url: 'https://web.max.ru/', color: '#2688EB', partition: 'persist:max', emoji: '💎', isDefault: true }
]

// ─── Трей ─────────────────────────────────────────────────────────────────────

let tray = null
let forceQuit = false

// v0.78.9: Overlay и шрифты вынесены в main/utils/overlayIcon.js

function createTray() {
  tray = new Tray(createTrayBadgeIcon(0))
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

// User-Agent без слова "Electron" — WhatsApp/VK и другие сайты блокируют Electron-браузеры
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function setupSession(ses) {
  ses.setUserAgent(CHROME_UA)
  // Блокируем нативные Notification из WebView — мы перехватываем их через executeJavaScript
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    if (permission === 'notifications') return cb(false)
    cb(true)
  })
  ses.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'notifications') return false
    return true
  })

  // v0.73.8: Убиваем Service Worker на уровне Electron session.
  // ПРИЧИНА: Telegram Web из SW вызывает navigator.setAppBadge(N) → Chromium C++
  // ставит overlay icon напрямую (Mojo IPC → ITaskbarList3::SetOverlayIcon),
  // перебивая наш кастомный overlay с суммой всех мессенджеров.
  // JS override (navigator.serviceWorker.register) НЕ ПОМОГАЕТ — SW уже закеширован
  // в partition storage от предыдущих сессий и активируется ДО нашего JS-кода.
  // clearStorageData удаляет закешированные SW ДО загрузки страницы.
  ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
    .then(() => console.log('[SW] Service Worker storage очищен для сессии'))
    .catch(e => console.error('[SW] Ошибка очистки SW storage:', e.message))

  // Мониторинг: если SW всё-таки запустится — логируем для отладки
  if (ses.serviceWorkers) {
    ses.serviceWorkers.on('running-status-changed', (e) => {
      console.log(`[SW] running-status-changed: versionId=${e.versionId} runningStatus=${e.runningStatus}`)
      // Если SW запустился — немедленно очищаем повторно
      if (e.runningStatus === 'starting' || e.runningStatus === 'running') {
        console.log('[SW] Обнаружен запущенный SW — повторная очистка')
        ses.clearStorageData({ storages: ['serviceworkers'] }).catch(() => {})
      }
    })
  }

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

// v0.73.9: Блокируем app.setBadgeCount — Chromium вызывает при Badge API из WebView
app.setBadgeCount = function(count) {
  console.log(`[BADGE] app.setBadgeCount(${count}) — ЗАБЛОКИРОВАНО`)
  return false
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
      sandbox: false,
      backgroundThrottling: false
    }
  })

  // Отключаем throttling JS при свёрнутом/скрытом окне —
  // без этого MutationObserver, Notification hooks и IPC в WebView замораживаются
  mainWindow.webContents.backgroundThrottling = false

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // DevTools: не открывать автоматически, пользователь откроет Ctrl+Shift+I вручную
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

  // IPC window-state: renderer точно знает состояние окна (focus/blur/minimize/restore)
  // Надёжнее чем document.hidden или document.hasFocus() в renderer
  const sendWindowState = (focused) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('window-state', { focused }) } catch {}
    }
  }
  mainWindow.on('focus', () => sendWindowState(true))
  mainWindow.on('blur', () => sendWindowState(false))
  mainWindow.on('minimize', () => sendWindowState(false))
  mainWindow.on('restore', () => sendWindowState(true))
  mainWindow.on('show', () => sendWindowState(mainWindow.isFocused()))
}

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

// ─── Скачивание иконки для уведомления (кеш с TTL 30 мин, до 50 записей) ────

const iconCache = new Map() // url → { icon, ts }
const ICON_CACHE_TTL = 30 * 60 * 1000 // 30 минут

// v0.80.0: Периодическая очистка кэша — с cleanup при quit
const iconCacheInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, val] of iconCache) {
    if (now - val.ts > ICON_CACHE_TTL) iconCache.delete(key)
  }
}, 10 * 60 * 1000)
app.on('will-quit', () => {
  clearInterval(iconCacheInterval); iconCache.clear()
  // v0.80.0: Cleanup всех дочерних окон
  try { if (notifWin && !notifWin.isDestroyed()) notifWin.destroy() } catch {}
  try { if (tray && !tray.isDestroyed()) tray.destroy() } catch {}
})

function downloadIcon(url) {
  const cached = iconCache.get(url)
  if (cached && Date.now() - cached.ts < ICON_CACHE_TTL) return Promise.resolve(cached.icon)
  // Если TTL истёк — удаляем
  if (cached) iconCache.delete(url)

  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http
    const req = proto.get(url, { timeout: 4000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Redirect
        return downloadIcon(res.headers.location).then(resolve)
      }
      if (res.statusCode !== 200) { res.resume(); return resolve(null) }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const buf = Buffer.concat(chunks)
          const icon = nativeImage.createFromBuffer(buf)
          if (!icon.isEmpty()) {
            // Кеш до 50 записей (LRU eviction) + TTL
            if (iconCache.size >= 50) {
              const first = iconCache.keys().next().value
              iconCache.delete(first)
            }
            iconCache.set(url, { icon, ts: Date.now() })
            resolve(icon)
          } else resolve(null)
        } catch { resolve(null) }
      })
      res.on('error', () => resolve(null))
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
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

// ─── Notification Manager (Messenger Ribbon) ──────────────────────────────────

let notifWin = null
let notifItems = [] // [{id, messengerId, ...}]
let notifIdCounter = 0
const notifDedupMap = new Map() // messengerId:text → timestamp (дедупликация main+renderer)
const webviewReadySet = new Set() // webContents ids прошедшие warm-up

function getNotifPreloadPath() {
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/notification.preload.js')
  }
  return path.join(__dirname, '../preload/notification.js')
}

function getNotifHtmlPath() {
  if (isDev) {
    return path.join(__dirname, '../../main/notification.html')
  }
  return path.join(__dirname, '../main/notification.html')
}

function createNotifWindow() {
  if (notifWin && !notifWin.isDestroyed()) return

  const { workArea } = screen.getPrimaryDisplay()

  notifWin = new BrowserWindow({
    width: 370,
    height: 300,
    x: workArea.x + workArea.width - 380,
    y: workArea.y + workArea.height - 310,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: getNotifPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })

  notifWin.loadFile(getNotifHtmlPath()).catch(err => {
    console.error('[NotifManager] Failed to load notification.html:', err)
  })

  notifWin.on('closed', () => {
    notifWin = null
    notifItems = []
  })
}

function repositionNotifWin() {
  if (!notifWin || notifWin.isDestroyed()) return
  const count = notifItems.length
  if (count === 0) {
    notifWin.hide()
    return
  }
  const { workArea } = screen.getPrimaryDisplay()
  // 76px item + 4px gap + 8px padding
  const height = count * 76 + (count - 1) * 4 + 8
  // Позиция: внизу справа, с отступом 10px от края
  const y = workArea.y + workArea.height - height - 10
  notifWin.setBounds({
    x: workArea.x + workArea.width - 380,
    y,
    width: 370,
    height
  })
  if (!notifWin.isVisible()) notifWin.showInactive()
}

async function showCustomNotification({ title, body, fullBody, iconUrl, iconDataUrl: preDataUrl, color, emoji, messengerName, messengerId, dismissMs: overrideDismissMs, senderName, chatTag }) {
  // Защита: пустой, невидимый или timestamp-only body → не показываем ribbon
  let cleanBody = (body || '').replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').trim()
  // Убираем trailing timestamps (Telegram ServiceWorker приклеивает "15:57" или "15:5715:57" к body)
  cleanBody = cleanBody.replace(/(\d{1,2}:\d{2}(:\d{2})?)+\s*$/g, '').trim()
  if (!cleanBody) return null
  // MAX и другие мессенджеры могут слать Notification с body = "12:40" (только время)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanBody)) return null
  // Используем очищенный body для отображения
  body = cleanBody

  // Дедупликация: один и тот же текст от того же мессенджера за 8 сек → skip
  // Нормализуем body: убираем timestamps (Telegram/SW шлют body с приклеенным временем)
  const normalizedBody = (body || '').replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
  const dedupKey = messengerId + ':' + (normalizedBody || (body || '')).slice(0, 60)
  const now = Date.now()
  if (notifDedupMap.has(dedupKey) && now - notifDedupMap.get(dedupKey) < 8000) {
    return null
  }
  notifDedupMap.set(dedupKey, now)
  if (notifDedupMap.size > 50) {
    for (const [k, ts] of notifDedupMap) { if (now - ts > 30000) notifDedupMap.delete(k) }
  }

  try {
    if (!notifWin || notifWin.isDestroyed()) {
      createNotifWindow()
      // Ждём загрузку HTML с таймаутом 5 сек
      await Promise.race([
        new Promise(resolve => notifWin.webContents.once('did-finish-load', resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Notification HTML load timeout')), 5000))
      ])
    }
  } catch (err) {
    console.error('[NotifManager] Window init error:', err.message)
    // Fallback — нативное уведомление
    try { new Notification({ title: messengerName || 'ЦентрЧатов', body: body || '' }).show() } catch {}
    return null
  }

  const id = String(++notifIdCounter)

  // Аватарка: если уже data URL — используем напрямую, иначе скачиваем
  let iconDataUrl = preDataUrl || null
  if (!iconDataUrl && iconUrl && (iconUrl.startsWith('https://') || iconUrl.startsWith('http://'))) {
    try {
      const icon = await downloadIcon(iconUrl)
      if (icon) iconDataUrl = icon.toDataURL()
    } catch {}
  }

  // Время показа уведомления из настроек (по умолчанию 5 сек, 0 = бесконечно)
  const settings = storage.get('settings', {})
  let dismissMs
  if (overrideDismissMs != null) {
    dismissMs = overrideDismissMs
  } else {
    const notifSec = settings.notifDismissSec
    dismissMs = notifSec === 0 ? 0 : (notifSec || 5) * 1000
  }

  const expandedByDefault = !!settings.ribbonExpandedByDefault
  const grouping = !!settings.ribbonGrouping
  const showMessageTime = settings.showMessageTime !== false // v0.63.8: по умолчанию включено
  const data = { id, title, body, fullBody: fullBody || '', iconDataUrl, color, emoji, messengerName, messengerId, dismissMs, expandedByDefault, grouping, showMessageTime, senderName: senderName || title || '', chatTag: chatTag || '' }

  // FIFO — удаляем старые из трекинга (v0.63.2: увеличен до 30, стэк может иметь 10+ сообщений)
  if (notifItems.length >= 30) {
    notifItems.shift()
  }
  notifItems.push(data)

  // Показываем окно ДО отправки данных — иначе rAF/setTimeout может не сработать в hidden window
  if (!notifWin.isVisible()) {
    // Временно показываем с минимальной высотой, HTML скорректирует через notif:resize
    const { workArea } = screen.getPrimaryDisplay()
    notifWin.setBounds({ x: workArea.x + workArea.width - 380, y: workArea.y + workArea.height - 100, width: 370, height: 90 })
    notifWin.showInactive()
  }
  notifWin.webContents.send('notif:show', data)
  // HTML пришлёт notif:resize с точной высотой и окно скорректируется.
  // Двойной setBounds (reposition + resize) вызывал дёрг первого уведомления на Windows.

  return id
}

function setupNotifIPC() {
  // v0.82.4: Notification handlers вынесены в main/handlers/notifHandlers.js
  initNotifHandlers({
    getNotifItems: () => notifItems,
    setNotifItems: (items) => { notifItems = items },
    getNotifWin: () => notifWin,
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

  // Открыть Electron-окно для входа в ИИ-провайдера через браузер
  // Пользователь входит email+паролем, создаёт API-ключ, копирует →
  // renderer перехватывает его из буфера обмена автоматически
  const loginWindows = {}
  ipcMain.handle('ai-login:open', (event, { url, provider, providerLabel }) => {
    console.log(`[LoginWin] Запрос: provider=${provider} url=${url}`)

    try {
      // Если окно уже открыто — фокусируем его
      if (loginWindows[provider] && !loginWindows[provider].isDestroyed()) {
        loginWindows[provider].focus()
        return { ok: true, existed: true }
      }

      // Настраиваем сессию ДО создания окна — Chrome UA + разрешения
      const partitionName = `persist:ai-login-${provider}`
      try {
        const loginSes = session.fromPartition(partitionName)
        loginSes.setUserAgent(CHROME_UA)
        loginSes.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
        loginSes.setPermissionCheckHandler(() => true)
        console.log(`[LoginWin] Сессия настроена: ${partitionName}`)
      } catch (e) {
        console.error(`[LoginWin] Ошибка настройки сессии:`, e.message)
      }

      const loginWin = new BrowserWindow({
        width: 1100,
        height: 750,
        title: `Войти — ${providerLabel || provider}`,
        backgroundColor: '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          partition: partitionName,
        }
      })

      console.log(`[LoginWin] Окно создано ID=${loginWin.id}`)
      loginWindows[provider] = loginWin
      loginWin.setMenu(null)

      // DevTools: не открывать автоматически (Ctrl+Shift+I для ручного)

      // ── Детальное логирование всех событий ──
      loginWin.webContents.on('did-start-loading', () => {
        console.log(`[LoginWin:${provider}] ⏳ did-start-loading`)
      })
      loginWin.webContents.on('did-stop-loading', () => {
        const cur = loginWin.isDestroyed() ? '?' : loginWin.webContents.getURL()
        console.log(`[LoginWin:${provider}] ⏹ did-stop-loading url=${cur}`)
      })
      loginWin.webContents.on('did-navigate', (_ev, navUrl) => {
        console.log(`[LoginWin:${provider}] 🔀 did-navigate: ${navUrl}`)
      })
      loginWin.webContents.on('did-finish-load', () => {
        const wUrl = loginWin.isDestroyed() ? '?' : loginWin.webContents.getURL()
        console.log(`[LoginWin:${provider}] ✅ did-finish-load: ${wUrl}`)
        // Инжектируем плавающую подсказку после успешной загрузки
        loginWin.webContents.executeJavaScript(`
          if (!document.getElementById('__cc_hint')) {
            const d = document.createElement('div')
            d.id = '__cc_hint'
            d.style.cssText = [
              'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
              'background:#1e293b', 'color:#fff', 'padding:14px 18px',
              'border-radius:14px', 'font:14px/1.5 system-ui,sans-serif',
              'box-shadow:0 8px 32px rgba(0,0,0,.5)', 'max-width:320px',
              'border:1.5px solid #2AABEE55', 'pointer-events:none'
            ].join(';')
            // v0.80.0: textContent вместо innerHTML (безопасность)
            var b = document.createElement('b'); b.style.cssText = 'color:#2AABEE;display:block;margin-bottom:5px'; b.textContent = '📋 ЦентрЧатов ждёт ключ'; d.appendChild(b);
            var s = document.createElement('span'); s.style.color = '#94a3b8'; s.textContent = 'Войдите, создайте API-ключ и '; var sb = document.createElement('b'); sb.style.color = '#fff'; sb.textContent = 'скопируйте его'; s.appendChild(sb); s.appendChild(document.createTextNode(' — он автоматически появится в приложении')); d.appendChild(s);
            document.body.appendChild(d)
          }
        `).catch(() => {})
      })
      loginWin.webContents.on('did-fail-load', (ev, code, desc, failedUrl, isMainFrame) => {
        console.error(`[LoginWin:${provider}] ❌ did-fail-load: code=${code} desc="${desc}" url=${failedUrl} isMain=${isMainFrame}`)
        // Показываем ошибку прямо в окне (только для главного фрейма, не data: URL)
        if (isMainFrame && !loginWin.isDestroyed() && !failedUrl.startsWith('data:')) {
          const errPage = `data:text/html;charset=utf-8,` + encodeURIComponent(
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка загрузки</title></head>` +
            `<body style="font-family:system-ui,sans-serif;padding:40px;background:#0f172a;color:#e2e8f0;margin:0">` +
            `<h2 style="color:#f87171;margin:0 0 20px">❌ Ошибка загрузки страницы</h2>` +
            `<table style="font-size:14px;border-spacing:0 6px"><tbody>` +
            `<tr><td style="color:#94a3b8;padding-right:16px">URL</td><td style="color:#fff;font-family:monospace;word-break:break-all">${failedUrl}</td></tr>` +
            `<tr><td style="color:#94a3b8;padding-right:16px">Код</td><td style="color:#fcd34d">${code}</td></tr>` +
            `<tr><td style="color:#94a3b8;padding-right:16px">Описание</td><td style="color:#fcd34d">${desc}</td></tr>` +
            `</tbody></table>` +
            `<div style="margin-top:28px;display:flex;gap:12px">` +
            `<button onclick="location.href='${failedUrl.replace(/'/g, "\\'")}'" style="padding:10px 20px;background:#2AABEE;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Повторить</button>` +
            `</div></body></html>`
          )
          loginWin.loadURL(errPage)
        }
      })
      loginWin.webContents.on('render-process-gone', (_ev, details) => {
        console.error(`[LoginWin:${provider}] 💀 render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`)
      })
      loginWin.webContents.on('unresponsive', () => {
        console.warn(`[LoginWin:${provider}] ⚠️ unresponsive`)
      })

      console.log(`[LoginWin] loadURL → ${url}`)
      loginWin.loadURL(url)

      // При закрытии — уведомляем renderer чтобы остановить polling
      loginWin.on('closed', () => {
        console.log(`[LoginWin:${provider}] Закрыто`)
        delete loginWindows[provider]
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-login:closed', { provider })
        }
      })

      return { ok: true }
    } catch (err) {
      console.error(`[LoginWin] КРИТИЧЕСКАЯ ОШИБКА:`, err.message, '\n', err.stack)
      return { ok: false, error: err.message }
    }
  })

  // Кастомное уведомление (Messenger Ribbon — v0.39.0)
  ipcMain.handle('app:custom-notify', async (event, { title, body, fullBody, iconUrl, iconDataUrl, color, emoji, messengerName, messengerId, dismissMs, senderName, chatTag }) => {
    try {
      const result = await showCustomNotification({ title, body, fullBody, iconUrl, iconDataUrl, color, emoji, messengerName, messengerId, dismissMs, senderName, chatTag })
      return { ok: !!result, id: result }
    } catch (e) {
      console.error('[NotifManager] Ошибка:', e.message)
      return { ok: false, error: e.message }
    }
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
}

// ─── Backup notification path: main-process перехват (v0.39.5) ────────────────
// Main process слушает console-message на webview webContents напрямую.
// Перехватывает: __CC_NOTIF__ (Notification API) и __CC_MSG__ (MutationObserver backup).
// Работает всегда — дедупликация в showCustomNotification предотвращает дубли.

function findMessengerByUrl(pageUrl) {
  if (!storage) return null
  const messengers = storage.get('messengers') || []
  try {
    const pageHost = new URL(pageUrl).hostname
    return messengers.find(m => {
      try { return new URL(m.url).hostname === pageHost } catch { return false }
    })
  } catch { return null }
}

app.on('web-contents-created', (_event, contents) => {
  // Только webview гости (не mainWindow, не notification window)
  if (contents.getType() !== 'webview') return

  // Принудительно отключаем background throttling (belt & suspenders к webpreferences attr)
  contents.setBackgroundThrottling(false)

  // Warm-up: игнорируем первые 5 сек после загрузки (кешированные/старые уведомления)
  // v0.57.0: снижено с 30 до 5 сек — 30 сек блокировало реальные сообщения
  contents.on('did-finish-load', () => {
    webviewReadySet.delete(contents.id)
    setTimeout(() => webviewReadySet.add(contents.id), 5000)
  })

  // Backup: перехватываем __CC_NOTIF__ и __CC_MSG__ напрямую в main process
  // ВАЖНО: backup нужен ТОЛЬКО когда renderer не может обработать (webContents destroyed/crashed)
  // При backgroundThrottling:false renderer работает ВСЕГДА — даже при свёрнутом окне
  // findMessengerByUrl некорректен при 2+ аккаунтах одного мессенджера (возвращает первый)
  contents.on('console-message', (_e, _level, msg) => {
    if (!msg) return
    if (!webviewReadySet.has(contents.id)) return

    // Если renderer жив — он сам обработает (backgroundThrottling: false)
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) return

    const mInfo = findMessengerByUrl(contents.getURL())
    if (!mInfo) return

    // ── __CC_NOTIF__: перехват Notification API ──
    if (msg.startsWith('__CC_NOTIF__')) {
      try {
        const data = JSON.parse(msg.slice(12))
        const text = (data.b || '').trim()
        console.log(`[NotifManager] Backup __CC_NOTIF__ (${mInfo.name}): t="${data.t}", b="${(data.b||'').slice(0,30)}", minimized=${mainWindow?.isMinimized()}`)
        if (!text) return
        // Фильтр спам-текстов: статусы, исходящие, системные (v0.51.0)
        if (/^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing)/i.test(text)) return
        if (/^(вы:\s|you:\s)/i.test(text)) return

        let iconUrl
        if (data.i) {
          if (data.i.startsWith('http')) iconUrl = data.i
          else if (data.i.startsWith('/')) {
            try { iconUrl = new URL(data.i, mInfo.url).href } catch {}
          }
        }

        showCustomNotification({
          title: data.t || '',
          body: text.length > 100 ? text.slice(0, 97) + '…' : text,
          iconUrl,
          color: mInfo.color || '#2AABEE',
          emoji: mInfo.emoji || '💬',
          messengerName: mInfo.name || 'ЦентрЧатов',
          messengerId: mInfo.id,
          senderName: data.t || '',
          chatTag: data.g || '',
        })
      } catch {}
      return
    }

    // ── __CC_MSG__: backup MutationObserver (v0.39.5) ──
    if (msg.startsWith('__CC_MSG__')) {
      const text = msg.slice(10).trim()
      if (!text) return
      console.log(`[NotifManager] Backup __CC_MSG__ (${mInfo.name}): "${text.slice(0, 30)}", minimized=${mainWindow?.isMinimized()}`)
      showCustomNotification({
        title: '',
        body: text.length > 100 ? text.slice(0, 97) + '…' : text,
        color: mInfo.color || '#2AABEE',
        emoji: mInfo.emoji || '💬',
        messengerName: mInfo.name || 'ЦентрЧатов',
        messengerId: mInfo.id,
      })
      return
    }
  })
})

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
  setupNotifIPC()
  // v0.73.3: overlay рендерится BGRA buffer в main (Canvas удалён)
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
