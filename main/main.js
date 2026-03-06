// v0.44.1 — Фикс дубля ribbon при 2+ аккаунтах + видимая кнопка Прочитано
import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, Notification, shell, clipboard, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import crypto from 'node:crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

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

// ── Пиксельный 3×5 шрифт для цифр в бейдже трея ──────────────────────────

const PIXEL_FONT = {
  '0': [0b111,0b101,0b101,0b101,0b111],
  '1': [0b010,0b110,0b010,0b010,0b111],
  '2': [0b111,0b001,0b111,0b100,0b111],
  '3': [0b111,0b001,0b011,0b001,0b111],
  '4': [0b101,0b101,0b111,0b001,0b001],
  '5': [0b111,0b100,0b111,0b001,0b111],
  '6': [0b111,0b100,0b111,0b101,0b111],
  '7': [0b111,0b001,0b011,0b010,0b010],
  '8': [0b111,0b101,0b111,0b101,0b111],
  '9': [0b111,0b101,0b111,0b001,0b111],
  '+': [0b000,0b010,0b111,0b010,0b000],
}

function setPixelBGRA(buf, bufSize, x, y, R, G, B) {
  if (x < 0 || x >= bufSize || y < 0 || y >= bufSize) return
  const i = (y * bufSize + x) * 4
  buf[i] = B; buf[i+1] = G; buf[i+2] = R; buf[i+3] = 255
}

function drawPixelText(buf, bufSize, text, cx, cy, R, G, B) {
  const charW = 3, gap = 1
  const totalW = text.length * charW + (text.length - 1) * gap
  let x = Math.round(cx - totalW / 2)
  const y = Math.round(cy) - 2
  for (const ch of text) {
    const rows = PIXEL_FONT[ch]
    if (rows) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (rows[row] & (0b100 >> col)) setPixelBGRA(buf, bufSize, x + col, y + row, R, G, B)
        }
      }
    }
    x += charW + gap
  }
}

// Создаёт иконку трея 32×32 с опциональным красным бейджем-счётчиком
function createTrayBadgeIcon(count) {
  const size = 32
  const buf = Buffer.alloc(size * size * 4) // BGRA, всё прозрачное по умолчанию

  // Основной синий круг (#2AABEE = R:42, G:171, B:238)
  const hasBadge = count > 0
  const cx = hasBadge ? 13.5 : 15.5
  const cy = hasBadge ? 19.5 : 15.5
  const r  = 11

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) <= r) {
        setPixelBGRA(buf, size, x, y, 42, 171, 238)
      }
    }
  }

  if (hasBadge) {
    // Красный кружок-бейдж (#EF4447 = R:239, G:68, B:71) в правом верхнем углу
    const bcx = 25, bcy = 7, br = 7
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.sqrt((x - bcx) ** 2 + (y - bcy) ** 2) <= br) {
          setPixelBGRA(buf, size, x, y, 239, 68, 71)
        }
      }
    }
    // Белая цифра внутри бейджа
    const text = count > 9 ? '9+' : String(count)
    drawPixelText(buf, size, text, bcx, bcy, 255, 255, 255)
  }

  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

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
  // Без этого VK/WhatsApp показывают "electron.app.Electron" как заголовок
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    if (permission === 'notifications') return cb(false)
    cb(true)
  })
  ses.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'notifications') return false
    return true
  })

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
      sandbox: false,
      backgroundThrottling: false
    }
  })

  // Отключаем throttling JS при свёрнутом/скрытом окне —
  // без этого MutationObserver, Notification hooks и IPC в WebView замораживаются
  mainWindow.webContents.backgroundThrottling = false

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

// Периодическая очистка устаревших записей кэша аватарок
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of iconCache) {
    if (now - val.ts > ICON_CACHE_TTL) iconCache.delete(key)
  }
}, 10 * 60 * 1000) // каждые 10 минут

function downloadIcon(url) {
  const cached = iconCache.get(url)
  if (cached && Date.now() - cached.ts < ICON_CACHE_TTL) return Promise.resolve(cached.icon)
  // Если TTL истёк — удаляем
  if (cached) iconCache.delete(url)

  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : require('http')
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
  console.log('[NotifManager] Creating notification window...')

  const { workArea } = screen.getPrimaryDisplay()

  notifWin = new BrowserWindow({
    width: 370,
    height: 76,
    x: workArea.x + workArea.width - 380,
    y: workArea.y + workArea.height - 84,
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
    console.log('[NotifManager] Dedup skip:', messengerName, body?.slice(0, 30))
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
  const data = { id, title, body, fullBody: fullBody || '', iconDataUrl, color, emoji, messengerName, messengerId, dismissMs, expandedByDefault, senderName: senderName || title || '', chatTag: chatTag || '' }
  console.log('[NotifManager] Showing notification:', id, messengerName, title, body?.slice(0, 30))

  // FIFO — удаляем старые из трекинга
  if (notifItems.length >= 6) {
    notifItems.shift()
  }
  notifItems.push(data)

  notifWin.webContents.send('notif:show', data)
  // НЕ вызываем repositionNotifWin() — HTML сам пришлёт notif:resize с точной высотой.
  // Двойной setBounds (reposition + resize) вызывал дёрг первого уведомления на Windows.

  return id
}

function setupNotifIPC() {
  ipcMain.on('notif:click', (_event, id) => {
    const item = notifItems.find(n => n.id === id)
    notifItems = notifItems.filter(n => n.id !== id)

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      if (item?.messengerId) {
        mainWindow.webContents.send('notify:clicked', {
          messengerId: item.messengerId,
          senderName: item.senderName || item.title || '',
          chatTag: item.chatTag || '',
        })
      }
    }
    // Не вызываем repositionNotifWin() — HTML сам пришлёт notif:resize
  })

  // "Прочитано" — скрыть ribbon без перехода к чату
  ipcMain.on('notif:mark-read', (_event, id) => {
    notifItems = notifItems.filter(n => n.id !== id)
    // HTML пришлёт notif:resize после анимации удаления
  })

  ipcMain.on('notif:dismiss', (_event, id) => {
    notifItems = notifItems.filter(n => n.id !== id)
    // HTML пришлёт notif:resize после анимации удаления
  })

  let lastNotifBounds = null // Кэш bounds — не дёргать окно если не изменились
  ipcMain.on('notif:resize', (_event, height) => {
    // HTML сообщает нужную высоту — единственный источник позиционирования
    if (!notifWin || notifWin.isDestroyed()) return
    height = Math.round(height)
    if (height <= 0) {
      notifWin.hide()
      lastNotifBounds = null
      return
    }
    const { workArea } = screen.getPrimaryDisplay()
    const x = workArea.x + workArea.width - 380
    const y = workArea.y + workArea.height - height - 10
    // Не вызывать setBounds если bounds не изменились — убирает дёрг
    if (lastNotifBounds && lastNotifBounds.x === x && lastNotifBounds.y === y && lastNotifBounds.h === height) {
      if (!notifWin.isVisible()) notifWin.showInactive()
      return
    }
    lastNotifBounds = { x, y, h: height }
    notifWin.setBounds({ x, y, width: 370, height })
    if (!notifWin.isVisible()) notifWin.showInactive()
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

      // Автооткрытие DevTools для диагностики (отдельное окно)
      loginWin.webContents.openDevTools({ mode: 'detach' })

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
            d.innerHTML = '<b style="color:#2AABEE;display:block;margin-bottom:5px">📋 ЦентрЧатов ждёт ключ</b>' +
              '<span style="color:#94a3b8">Войдите, создайте API-ключ и <b style="color:#fff">скопируйте его</b> — ' +
              'он автоматически появится в приложении</span>'
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
    console.log('[NotifManager] IPC app:custom-notify received:', messengerName, title, body?.slice(0, 30))
    try {
      await showCustomNotification({ title, body, fullBody, iconUrl, iconDataUrl, color, emoji, messengerName, messengerId, dismissMs, senderName, chatTag })
      return { ok: true }
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

  // Обновление бейджа трея (вызывается из renderer когда меняется totalUnread)
  ipcMain.handle('tray:set-badge', (_, count) => {
    if (tray && !tray.isDestroyed()) {
      tray.setImage(createTrayBadgeIcon(count || 0))
      tray.setToolTip(count > 0 ? `ЦентрЧатов — ${count} непрочитанных` : 'ЦентрЧатов')
    }
    return { ok: true }
  })

  // ─── SSE-стриминг AI (OpenAI / Anthropic / DeepSeek / ГигаЧат-fallback) ──
  // Используем ipcMain.on (не handle) — renderer шлёт send(), получает события через on()
  ipcMain.on('ai:generate-stream', async (event, { messages, settings: aiCfg, requestId }) => {
    const { provider, apiKey, clientSecret, model, systemPrompt } = aiCfg || {}

    const send = (ch, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(ch, payload)
    }
    const chunk  = (c) => send('ai:stream-chunk', { requestId, chunk: c })
    const done   = ()  => send('ai:stream-done',  { requestId })
    const errOut = (e) => send('ai:stream-error', { requestId, error: ruError(e) })

    // SSE-парсер: читает ReadableStream и вызывает onChunk для каждого фрагмента
    const pipeSSE = async (reader, extractFn) => {
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done: d, value } = await reader.read()
        if (d) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue
          try { const c = extractFn(JSON.parse(raw)); if (c) chunk(c) } catch {}
        }
      }
    }

    try {
      // ── Anthropic (SSE stream: true) ──────────────────────────────────────
      if (provider === 'anthropic') {
        if (!apiKey) { errOut('Укажите API-ключ Anthropic (sk-ant-...)'); return }
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: model || 'claude-haiku-4-5-20251001', max_tokens: 1024, stream: true, system: systemPrompt || '', messages })
        })
        if (!resp.ok) { const d = await resp.json(); errOut(d.error?.message || `HTTP ${resp.status}`); return }
        await pipeSSE(resp.body.getReader(), p => p.delta?.text || '')
        done()

      // ── DeepSeek (OpenAI-compatible SSE) ─────────────────────────────────
      } else if (provider === 'deepseek') {
        if (!apiKey) { errOut('Укажите API-ключ DeepSeek'); return }
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model || 'deepseek-chat', stream: true, messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] })
        })
        if (!resp.ok) { const d = await resp.json(); errOut(d.error?.message || `HTTP ${resp.status}`); return }
        await pipeSSE(resp.body.getReader(), p => p.choices?.[0]?.delta?.content || '')
        done()

      // ── ГигаЧат — без стриминга (SSL-bypass не поддерживает ReadableStream) ─
      } else if (provider === 'gigachat') {
        if (!apiKey || !clientSecret) { errOut('Укажите Client ID и Client Secret ГигаЧат'); return }
        const token = await getGigaChatToken(apiKey.trim(), clientSecret.trim())
        const sysMsg = systemPrompt ? [{ role: 'system', content: systemPrompt }] : []
        const result = await httpsPostSkipSsl(GIGACHAT_CHAT_URL,
          JSON.stringify({ model: model || 'GigaChat', messages: [...sysMsg, ...messages] }),
          { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        )
        if (!result.ok) { errOut(result.data?.error?.message || 'HTTP ошибка'); return }
        const text = result.data.choices?.[0]?.message?.content || ''
        if (text) chunk(text)
        done()

      // ── OpenAI (SSE stream: true, default) ───────────────────────────────
      } else {
        if (!apiKey) { errOut('Укажите API-ключ OpenAI (sk-...)'); return }
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: model || 'gpt-4o-mini', stream: true, messages: [{ role: 'system', content: systemPrompt || '' }, ...messages] })
        })
        if (!resp.ok) { const d = await resp.json(); errOut(d.error?.message || `HTTP ${resp.status}`); return }
        await pipeSSE(resp.body.getReader(), p => p.choices?.[0]?.delta?.content || '')
        done()
      }
    } catch (e) {
      errOut(e.message)
    }
  })

  // ИИ-генерация ответов (OpenAI / Anthropic / DeepSeek / ГигаЧат)
  ipcMain.handle('ai:generate', async (event, { messages, settings: aiCfg }) => {
    const { provider, apiKey, clientSecret, model, systemPrompt } = aiCfg || {}

    try {
      // ── Anthropic Claude ──
      if (provider === 'anthropic') {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ Anthropic (sk-ant-...)' }
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
        if (data.error) return { ok: false, error: ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.content?.[0]?.text || '' }

      // ── DeepSeek (OpenAI-совместимый) ──
      } else if (provider === 'deepseek') {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ DeepSeek' }
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt || '' },
              ...messages
            ]
          })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.choices?.[0]?.message?.content || '' }

      // ── ГигаЧат (Сбербанк) ──
      } else if (provider === 'gigachat') {
        if (!apiKey || !clientSecret) return { ok: false, error: 'Укажите Client ID и Client Secret ГигаЧат' }
        const token = await getGigaChatToken(apiKey.trim(), clientSecret.trim())
        const sysMsg = systemPrompt ? [{ role: 'system', content: systemPrompt }] : []
        const result = await httpsPostSkipSsl(
          GIGACHAT_CHAT_URL,
          JSON.stringify({
            model: model || 'GigaChat',
            messages: [...sysMsg, ...messages]
          }),
          {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        )
        if (!result.ok) return { ok: false, error: ruError(result.data?.error?.message || `HTTP ошибка`) }
        return { ok: true, result: result.data.choices?.[0]?.message?.content || '' }

      // ── OpenAI (default) ──
      } else {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ OpenAI (sk-...)' }
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
        if (data.error) return { ok: false, error: ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.choices?.[0]?.message?.content || '' }
      }
    } catch (e) {
      return { ok: false, error: ruError(e.message) }
    }
  })
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

  // Warm-up: игнорируем первые 12 сек после загрузки (кешированные/старые уведомления)
  contents.on('did-finish-load', () => {
    webviewReadySet.delete(contents.id)
    setTimeout(() => webviewReadySet.add(contents.id), 12000)
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
