// v0.84.4: Notification Manager (Messenger Ribbon) — extracted from main.js
// Manages: notifWin, notifItems, dedup, icon cache, custom notification display

import { Notification } from 'electron'

let notifWin = null
let notifItems = [] // [{id, messengerId, ...}]
let notifIdCounter = 0
const notifDedupMap = new Map() // messengerId:text → timestamp (дедупликация main+renderer)

const iconCache = new Map() // url → { icon, ts }
const ICON_CACHE_TTL = 30 * 60 * 1000 // 30 минут

let _deps = null

function getNotifPreloadPath() {
  const { isDev, __dirname, path } = _deps
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/notification.preload.cjs')
  }
  return path.join(__dirname, '../preload/notification.mjs')
}

function getNotifHtmlPath() {
  const { isDev, __dirname, path } = _deps
  if (isDev) {
    return path.join(__dirname, '../../main/notification.html')
  }
  return path.join(__dirname, '../main/notification.html')
}

function downloadIcon(url) {
  const { http, https, nativeImage } = _deps
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

function createNotifWindow() {
  const { BrowserWindow, screen } = _deps
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
  const { screen } = _deps
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
  const { storage, screen } = _deps
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

// Cleanup — вызывается из main.js при will-quit
function cleanup() {
  try { if (notifWin && !notifWin.isDestroyed()) notifWin.destroy() } catch {}
  iconCache.clear()
}

// Getters for notifHandlers integration
function getNotifItems() { return notifItems }
function setNotifItems(items) { notifItems = items }
function getNotifWin() { return notifWin }

/**
 * @param {Object} deps
 * @param {Function} deps.getMainWindow
 * @param {Object} deps.storage
 * @param {boolean} deps.isDev
 * @param {string} deps.__dirname
 * @param {Object} deps.path
 * @param {Object} deps.BrowserWindow
 * @param {Object} deps.screen
 * @param {Object} deps.nativeImage
 * @param {Object} deps.http
 * @param {Object} deps.https
 */
export function initNotificationManager(deps) {
  _deps = deps
  return { showCustomNotification, cleanup, getNotifItems, setNotifItems, getNotifWin }
}
