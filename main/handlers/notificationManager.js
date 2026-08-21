// v0.84.4: Notification Manager (Messenger Ribbon) — extracted from main.js
// Manages: notifWin, notifItems, dedup, icon cache, custom notification display

import { Notification } from 'electron'
import { safeHideTransparentWindow } from '../utils/transparentWindowGuard.js'
import { decideNotifDedup } from './notifDedupDecision.js' // v1.2.318: кросс-детекторный дедуп веб-мессенджеров

let notifWin = null
let notifItems = [] // [{id, messengerId, ...}]
let notifTopTimer = null // v1.2.125: «пружина» — периодически возвращаем окно поверх всех
let notifIdCounter = 0
const notifDedupMap = new Map() // messengerId:text → timestamp (дедупликация main+renderer)

const iconCache = new Map() // url → { icon, ts }
const ICON_CACHE_TTL = 30 * 60 * 1000 // 30 минут

let _deps = null

function normalizeScopePart(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function buildNotificationScope({ messengerId, senderName, title, chatTag, messageId }) {
  if (messageId) return 'mid:' + String(messageId).slice(0, 80)
  const sender = normalizeScopePart(senderName || title)
  const chat = normalizeScopePart(chatTag)
  return sender ? `${messengerId || ''}:sender:${chat || sender}:${sender}` : String(messengerId || '')
}

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

function updateNotificationIconLater(id, iconUrl) {
  if (!iconUrl || (!iconUrl.startsWith('https://') && !iconUrl.startsWith('http://'))) return
  downloadIcon(iconUrl).then((icon) => {
    if (!icon || !notifWin || notifWin.isDestroyed()) return
    const iconDataUrl = icon.toDataURL()
    if (!iconDataUrl) return
    notifWin.webContents.send('notif:update-icon', { id, iconDataUrl })
  }).catch((e) => {
    console.warn('[NotifManager] Icon async update error:', e.message)
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
      // v0.89.35 (ловушка #28): Electron docs — «if backgroundThrottling is
      // disabled, the visibility state will remain visible even if the window
      // is minimized, occluded, or hidden». Без этого Chromium throttling
      // ставит CSS animations + rAF на паузу когда окно hide()/перемещено
      // за экран → slideIn keyframes застревают на 0% (translateX=380px),
      // item невидим но bounds учитывают его → «пустая полоса» в окне.
      // Закрывает корень серии v0.89.18-v0.89.27 + старую ловушку v0.47.2 (rAF).
      backgroundThrottling: false,
    }
  })

  notifWin.loadFile(getNotifHtmlPath()).catch(err => {
    console.error('[NotifManager] Failed to load notification.html:', err)
  })

  // v1.2.125: как у полоски задач (dockPinState) — САМЫЙ высокий уровень «поверх всех»
  // (screen-saver), а не простой alwaysOnTop, иначе чужие окна перекрывают уведомление.
  try { notifWin.setAlwaysOnTop(true, 'screen-saver', 1) } catch (_) {}
  // «Пружина»: Windows опускает topmost-окно при переключении окон/клике по панели задач.
  // Пока уведомление ВИДИМО — раз в 1с возвращаем его наверх (setAlwaysOnTop НЕ крадёт фокус).
  try {
    if (notifTopTimer) clearInterval(notifTopTimer)
    notifTopTimer = setInterval(() => {
      try {
        if (notifWin && !notifWin.isDestroyed() && notifWin.isVisible()) notifWin.setAlwaysOnTop(true, 'screen-saver', 1)
      } catch (_) {}
    }, 1000)
  } catch (_) {}

  // v1.2.12: диагностический лог №3 — реальные события окна от ОС.
  // Без этих подписок нельзя отличить «окно не показалось» от «появилось и сразу скрылось».
  // Парная точка к [NotifManager] show. Win11 после safeHide может оставить окно
  // в OFFSCREEN_BOUNDS до следующего setBounds — здесь видно это глазами.
  try {
    notifWin.on('show', () => {
      try {
        notifWin.setAlwaysOnTop(true, 'screen-saver', 1) // v1.2.125: мгновенно наверх при показе
        const b = notifWin.getBounds()
        console.log('[notif-window] event=show bounds=' + JSON.stringify(b)
          + ' onTop=' + notifWin.isAlwaysOnTop()
          + ' opacity=' + notifWin.getOpacity())
      } catch (_) {}
    })
    notifWin.on('hide', () => {
      try {
        const b = notifWin.getBounds()
        console.log('[notif-window] event=hide bounds=' + JSON.stringify(b))
      } catch (_) {}
    })
    notifWin.on('move', () => {
      try {
        const b = notifWin.getBounds()
        console.log('[notif-window] event=move bounds=' + JSON.stringify(b)
          + ' visible=' + notifWin.isVisible())
      } catch (_) {}
    })
    notifWin.on('blur', () => { try { console.log('[notif-window] event=blur') } catch (_) {} })
    notifWin.on('focus', () => { try { console.log('[notif-window] event=focus') } catch (_) {} })
  } catch (_) {}

  notifWin.on('closed', () => {
    if (notifTopTimer) { clearInterval(notifTopTimer); notifTopTimer = null } // v1.2.125: стоп «пружины»
    notifWin = null
    notifItems = []
  })
}

function repositionNotifWin() {
  const { screen } = _deps
  if (!notifWin || notifWin.isDestroyed()) return
  const count = notifItems.length
  // v0.89.20: diagnostic log
  console.log('[notif-reposition] count=' + count + ' visible=' + notifWin.isVisible())
  if (count === 0) {
    // v0.89.18: safeHide — иначе ghost hit-region на Win11.
    safeHideTransparentWindow(notifWin)
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

async function showCustomNotification({ title, body, fullBody, iconUrl, iconDataUrl: preDataUrl, color, accountColor, emoji, messengerName, messengerId, accountName, dismissMs: overrideDismissMs, senderName, chatTag, messageId, source, album }) {
  const { storage, screen } = _deps
  // Защита: пустой, невидимый или timestamp-only body → не показываем ribbon
  let cleanBody = (body || '').replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').trim()
  // Убираем trailing timestamps (Telegram ServiceWorker приклеивает "15:57" или "15:5715:57" к body)
  cleanBody = cleanBody.replace(/(\d{1,2}:\d{2}(:\d{2})?)+\s*$/g, '').trim()
  if (!cleanBody) { console.log('[NotifManager] skip empty-body messenger=' + (messengerId || '') + ' title=' + String(title || '').slice(0, 40) + ' raw=' + String(body || '').slice(0, 80)); return null }
  // MAX и другие мессенджеры могут слать Notification с body = "12:40" (только время)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanBody)) { console.log('[NotifManager] skip timestamp-only messenger=' + (messengerId || '') + ' sender=' + String(senderName || title || '').slice(0, 40) + ' body=' + cleanBody); return null }
  // Используем очищенный body для отображения
  body = cleanBody

  // Дедупликация: один и тот же текст от того же мессенджера за 8 сек → skip
  // Нормализуем body: убираем timestamps (Telegram/SW шлют body с приклеенным временем)
  const normalizedBody = (body || '').replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
  const dedupScope = buildNotificationScope({ messengerId, senderName, title, chatTag, messageId })
  const now = Date.now()
  // v1.2.318: решение о дубле вынесено в чистый notifDedupDecision.js (+тест). Для веб-мессенджеров
  // добавлен ключ без messageId/chatTag (мессенджер+отправитель+текст) — ловит двойные VK-карточки
  // от двух детекторов; нативный Telegram (native_cc) не затронут.
  const dedupDecision = decideNotifDedup({ dedupScope, messengerId, senderName, title, normalizedBody, body, now, dedupMap: notifDedupMap })
  if (dedupDecision.duplicate) {
    console.log('[NotifManager] skip dedup messenger=' + (messengerId || '') + ' key=' + dedupDecision.hitKey.slice(0, 90) + ' age=' + dedupDecision.age)
    return null
  }
  for (const k of dedupDecision.keysToSet) notifDedupMap.set(k, now)
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
    try { new Notification({ title: messengerName || 'ЦентрЧатов', body: body || '' }).show() } catch (e2) { console.warn('[NotifManager] Fallback notification failed:', e2.message) }
    return null
  }

  const id = String(++notifIdCounter)

  // Аватарка: если уже data URL — используем напрямую, иначе скачиваем
  const iconDataUrl = preDataUrl || null

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
  // v0.95.46: messageId сохраняется в notifItem для последующего scroll к конкретному
  // сообщению при click «Перейти к чату» (см. notifHandlers.js notif:click → notify:clicked).
  // v0.96.0 (Phase 0 M0.4): source — NotificationSource паспорт сообщения.
  // Сохраняется в notifItems вместе с другими полями → передаётся при notif:click.
  const stackKey = buildNotificationScope({ messengerId, senderName, title, chatTag, messageId: null })
  // v1.2.66: album — метка «живой карточки» альбома (media group). Проброс без
  // изменений: окно уведомления группирует части по album.id. null для обычных.
  const data = { id, title, body, fullBody: fullBody || '', iconDataUrl, color, accountColor: accountColor || '', emoji, messengerName, messengerId, accountName: accountName || '', stackKey, dismissMs, expandedByDefault, grouping, showMessageTime, senderName: senderName || title || '', chatTag: chatTag || '', messageId: messageId || null, source: source || null, album: album || null }

  // FIFO — удаляем старые из трекинга (v0.63.2: увеличен до 30, стэк может иметь 10+ сообщений)
  if (notifItems.length >= 30) {
    notifItems.shift()
  }
  notifItems.push(data)

  // Показываем окно ДО отправки данных — иначе rAF/setTimeout может не сработать в hidden window
  if (!notifWin.isVisible()) {
    // v0.89.22: restoreMouseEvents удалён вместе с setIgnoreMouseEvents (ловушка #27)
    // Временно показываем с минимальной высотой, HTML скорректирует через notif:resize
    const { workArea } = screen.getPrimaryDisplay()
    notifWin.setBounds({ x: workArea.x + workArea.width - 380, y: workArea.y + workArea.height - 100, width: 370, height: 90 })
    notifWin.showInactive()
  }
  notifWin.webContents.send('notif:show', data)
  if (!iconDataUrl) updateNotificationIconLater(id, iconUrl)
  // v1.2.12: диагностический лог №5 — параметры показа (dismissMs/grouping/expanded).
  // Без них нельзя отличить «окно мелькнуло потому что dismissMs=500мс» от «настройки норм».
  console.log('[NotifManager] show id=' + id + ' messenger=' + (messengerId || '') + ' sender=' + String(senderName || title || '').slice(0, 40) + ' body=' + String(body || '').slice(0, 80) + ' icon=' + !!iconDataUrl + ' dismissMs=' + dismissMs + ' grouping=' + grouping + ' expanded=' + expandedByDefault + ' winVisible=' + (notifWin && !notifWin.isDestroyed() ? notifWin.isVisible() : false))
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
