// v0.84.4: Backup notification path — extracted from main.js
// Main process intercepts console-message on webview webContents directly.
// Catches: __CC_NOTIF__ (Notification API) and __CC_MSG__ (MutationObserver backup).

// v0.84.0: Multi-account safe — cache webContentsId → messengerId
const _webContentsMessengerMap = new Map()

function registerWebContentMessenger(webContentsId, messengerId) {
  _webContentsMessengerMap.set(webContentsId, messengerId)
}

function findMessengerByUrl(pageUrl, webContentsId, storage) {
  if (!storage) return null
  const messengers = storage.get('messengers') || []
  // 1. Точный матч по webContentsId (multi-account safe)
  if (webContentsId && _webContentsMessengerMap.has(webContentsId)) {
    const mid = _webContentsMessengerMap.get(webContentsId)
    return messengers.find(m => m.id === mid) || null
  }
  // 2. Fallback: по hostname (для первого запуска до регистрации)
  try {
    const pageHost = new URL(pageUrl).hostname
    return messengers.find(m => {
      try { return new URL(m.url).hostname === pageHost } catch { return false }
    })
  } catch { return null }
}

/**
 * @param {Object} deps
 * @param {Object} deps.app
 * @param {Object} deps.storage
 * @param {Function} deps.showCustomNotification
 * @param {Function} deps.getMainWindow
 * @param {Set} deps.webviewReadySet
 */
export function initBackupNotifHandler(deps) {
  const { app, storage, showCustomNotification, getMainWindow, webviewReadySet } = deps

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
    // v0.84.0: findMessengerByUrl теперь multi-account safe через webContentsId
    contents.on('console-message', (_e, _level, msg) => {
      if (!msg) return
      if (!webviewReadySet.has(contents.id)) return

      // Если renderer жив — он сам обработает (backgroundThrottling: false)
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) return

      const mInfo = findMessengerByUrl(contents.getURL(), undefined, storage)
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

  return { registerWebContentMessenger }
}
