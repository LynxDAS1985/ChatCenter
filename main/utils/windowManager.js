// v0.84.4: Window creation — extracted from main.js
// v0.90.0: Архитектурная миграция BrowserWindow → BaseWindow + WebContentsView.
// Причина — `webviewTag: true` в primary BrowserWindow + child WebContentsView для
// мессенджеров крашит main процесс при loadURL (12 версий v0.89.46-v0.89.57
// доказали что это архитектурное ограничение Electron). По официальной документации
// (https://www.electronjs.org/docs/latest/api/web-contents-view) WebContentsView
// должен использоваться с BaseWindow, не BrowserWindow.
//
// Архитектура:
//   BaseWindow (sole window)
//   └── contentView.addChildView(primaryView)   // React UI (renderer)
//   └── contentView.addChildView(messengerView) // мессенджер (через wcv:create)
//
// `<webview>` тег больше не работает (требует BrowserWindow primary view).
// Все мессенджеры — через WebContentsView (бывший «пилот», теперь default).

let _deps = null

// v0.90.0: Proxy чтобы существующий код работающий с `mainWindow.webContents`
// продолжал работать. Все старые методы (`.show()`, `.isDestroyed()`, on('focus'))
// проксируются на baseWindow, `.webContents` → primaryView.webContents.
function createMainWindowProxy(baseWindow, primaryView) {
  return new Proxy(baseWindow, {
    get(target, prop) {
      if (prop === 'webContents') return primaryView.webContents
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    }
  })
}

function getPreloadPath() {
  const { isDev, __dirname, path } = _deps
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/app.preload.cjs')
  }
  // electron-vite 5 собирает preload как .mjs
  return path.join(__dirname, '../preload/index.mjs')
}

function attachDevRequestTiming(mainWindow, wlog) {
  const requests = new Map()
  const completedRequests = []
  const attachedAt = Date.now()
  const filter = { urls: ['http://localhost:5173/*', 'http://127.0.0.1:5173/*'] }
  const normalizeUrl = (url) => {
    try {
      const u = new URL(url)
      return `${u.pathname}${u.search || ''}`
    } catch {
      return url
    }
  }
  const importantUrlHints = ['/src/', '/node_modules/.vite/', '/@vite/', '?import', '?direct']
  const isImportantUrl = (url) => importantUrlHints.some(hint => url.includes(hint))
  const shouldLog = () => true

  const rememberCompleted = (row) => {
    completedRequests.push(row)
    if (completedRequests.length > 300) completedRequests.shift()
  }

  const summarize = (reason) => {
    const slow = completedRequests
      .filter(r => r.ms >= 1000)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 12)
      .map(r => `${r.ms}ms ${r.status || r.error || 'done'} ${r.type || '?'} ${normalizeUrl(r.url)}`)
    const pending = [...requests.values()]
      .map(r => ({ ...r, age: Date.now() - r.startedAt }))
      .filter(r => r.age >= 1000)
      .sort((a, b) => b.age - a.age)
      .slice(0, 12)
      .map(r => `${r.age}ms ${r.method} ${r.type || '?'} ${normalizeUrl(r.url)}`)
    wlog(`dev-request summary reason=${reason} elapsed=${Date.now() - attachedAt}ms completed=${completedRequests.length} pending=${requests.size}`)
    if (slow.length) wlog(`dev-request slow-top reason=${reason} :: ${slow.join(' | ')}`)
    if (pending.length) wlog(`dev-request pending reason=${reason} :: ${pending.join(' | ')}`)
  }

  const before = (details, callback) => {
    requests.set(details.id, {
      startedAt: Date.now(),
      url: details.url,
      method: details.method,
      type: details.resourceType,
    })
    if (shouldLog(details.url)) {
      wlog(`dev-request start id=${details.id} method=${details.method} type=${details.resourceType} url=${normalizeUrl(details.url)}`)
    }
    if (typeof callback === 'function') callback({})
  }
  const completed = (details) => {
    const r = requests.get(details.id)
    requests.delete(details.id)
    if (!r || !shouldLog(r.url)) return
    const ms = Date.now() - r.startedAt
    rememberCompleted({ id: details.id, status: details.statusCode, cache: !!details.fromCache, ms, url: r.url, type: r.type })
    wlog(`dev-request done id=${details.id} status=${details.statusCode} cache=${!!details.fromCache} important=${isImportantUrl(r.url)} type=${r.type || details.resourceType} ms=${ms} url=${normalizeUrl(r.url)}`)
    if (ms >= 3000) wlog(`dev-request slow id=${details.id} ms=${ms} type=${r.type || details.resourceType} url=${normalizeUrl(r.url)}`)
  }
  const failed = (details) => {
    const r = requests.get(details.id)
    requests.delete(details.id)
    if (!r || !shouldLog(r.url)) return
    const ms = Date.now() - r.startedAt
    rememberCompleted({ id: details.id, error: details.error, ms, url: r.url, type: r.type })
    wlog(`dev-request failed id=${details.id} err="${details.error}" type=${r.type || details.resourceType} ms=${ms} url=${normalizeUrl(r.url)}`)
  }

  mainWindow.webContents.session.webRequest.onBeforeRequest(filter, before)
  mainWindow.webContents.session.webRequest.onCompleted(filter, completed)
  mainWindow.webContents.session.webRequest.onErrorOccurred(filter, failed)
  const timers = [5000, 10000, 15000, 30000, 45000, 60000, 90000].map(ms =>
    setTimeout(() => summarize(`${ms}ms`), ms)
  )
  mainWindow.webContents.once('dom-ready', () => summarize('dom-ready'))
  mainWindow.webContents.once('did-finish-load', () => summarize('did-finish-load'))
  mainWindow.once('ready-to-show', () => summarize('ready-to-show'))
  mainWindow.once('closed', () => timers.forEach(clearTimeout))
  wlog('dev-request timing attached http://localhost:5173/*')
}

/**
 * @param {Object} deps
 * @param {Object} deps.BrowserWindow
 * @param {Object} deps.path
 * @param {boolean} deps.isDev
 * @param {string} deps.__dirname
 * @param {Object} deps.storage
 * @param {Function} deps.getForceQuit
 * @param {Function} deps.getTray
 * @param {Function} deps.setMainWindow
 * @param {Function} deps.getMainWindow
 */
export function createWindow(deps) {
  _deps = deps
  const { BaseWindow, WebContentsView, path, isDev, __dirname, storage, getForceQuit, getTray, setMainWindow, getMainWindow } = deps
  const windowStart = Date.now()
  const wlog = (label) => console.log(`[startup-window] +${Date.now() - windowStart}ms ${label}`)

  const bounds = storage.get('windowBounds', { width: 1400, height: 900 })

  // v0.90.0: BaseWindow вместо BrowserWindow. У BaseWindow нет primary WebContents.
  const baseWindow = new BaseWindow({
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
    }
  })

  // Primary WebContentsView для React UI. webPreferences переехали сюда.
  // ВНИМАНИЕ: НЕТ `webviewTag: true` — это было причиной краша WebContentsView
  // в v0.89.46-v0.89.57. Старый `<webview>` тег больше НЕ работает.
  const primaryView = new WebContentsView({
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  baseWindow.contentView.addChildView(primaryView)
  const updatePrimaryBounds = () => {
    const b = baseWindow.getContentBounds()
    primaryView.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
  }
  updatePrimaryBounds()
  baseWindow.on('resize', updatePrimaryBounds)

  // v0.90.0: Proxy сохраняет API совместимость со старым кодом.
  const mainWindow = createMainWindowProxy(baseWindow, primaryView)

  // Отключаем throttling JS — для MutationObserver, Notification hooks в child views.
  mainWindow.webContents.backgroundThrottling = false

  // v0.85.3: Логируем ВСЕ ошибки renderer в main process (chatcenter.log)
  // Без этого ошибки preload (require is not defined) видны ТОЛЬКО в DevTools
  // v0.85.5: Electron 41 — новый Event API для console-message
  mainWindow.webContents.on('console-message', (e) => {
    if (e.level >= 2) { // 2 = error
      console.error(`[Renderer] ${e.message} (${e.sourceId}:${e.lineNumber})`)
    }
  })
  mainWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.error(`[PRELOAD ERROR] ${preloadPath}: ${err.message}`)
  })
  mainWindow.webContents.on('did-start-loading', () => wlog('did-start-loading'))
  mainWindow.webContents.on('dom-ready', () => wlog('dom-ready'))
  mainWindow.webContents.on('did-finish-load', () => wlog('did-finish-load'))
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, failedUrl, isMainFrame) => {
    wlog(`did-fail-load code=${code} desc="${desc}" url=${failedUrl || ''} main=${isMainFrame}`)
  })
  mainWindow.once('ready-to-show', () => wlog('ready-to-show'))

  if (isDev) {
    const devUrl = 'http://localhost:5173'
    attachDevRequestTiming(mainWindow, wlog)
    wlog(`loadURL start ${devUrl}`)
    mainWindow.loadURL(devUrl)
      .then(() => wlog(`loadURL resolved ${devUrl}`))
      .catch(err => wlog(`loadURL failed ${err.message}`))
  } else {
    const rendererPath = path.join(__dirname, '../renderer/index.html')
    wlog(`loadFile start ${rendererPath}`)
    mainWindow.loadFile(rendererPath)
      .then(() => wlog(`loadFile resolved ${rendererPath}`))
      .catch(err => wlog(`loadFile failed ${err.message}`))
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
    const tray = getTray()
    if (!getForceQuit() && tray && settings.minimizeToTray !== false) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    setMainWindow(null)
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

  setMainWindow(mainWindow)
  return mainWindow
}
