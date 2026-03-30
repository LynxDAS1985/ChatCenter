// v0.84.4: Session setup — вынесен из main.js
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// Трекинг уже настроенных сессий — не добавлять listeners повторно
const _setupDone = new Set()

export function setupSession(ses) {
  // v0.85.5: Защита от повторного setupSession — предотвращает MaxListenersExceededWarning
  const partitionKey = ses.storagePath || 'default'
  if (_setupDone.has(partitionKey)) return
  _setupDone.add(partitionKey)

  ses.setUserAgent(CHROME_UA)
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    if (permission === 'notifications') return cb(false)
    cb(true)
  })
  ses.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'notifications') return false
    return true
  })
  ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
    .then(() => console.log('[SW] Service Worker storage очищен для сессии'))
    .catch(e => console.error('[SW] Ошибка очистки SW storage:', e.message))
  if (ses.serviceWorkers) {
    ses.serviceWorkers.on('running-status-changed', (e) => {
      if (e.runningStatus === 'starting' || e.runningStatus === 'running') {
        console.log(`[SW] Обнаружен запущенный SW (versionId=${e.versionId}) — очистка`)
        ses.clearStorageData({ storages: ['serviceworkers'] }).catch(err => console.warn('[SW] Ошибка повторной очистки:', err.message))
      }
    })
  }
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']
    const csp = headers['content-security-policy'] || headers['Content-Security-Policy']
    if (csp) {
      const fixed = (Array.isArray(csp) ? csp : [csp]).map(v => v.replace(/frame-ancestors[^;]*(;|$)/gi, ''))
      headers['content-security-policy'] = fixed
    }
    callback({ responseHeaders: headers })
  })
}
