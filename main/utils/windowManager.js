// v0.84.4: Window creation — extracted from main.js

let _deps = null

function getPreloadPath() {
  const { isDev, __dirname, path } = _deps
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/app.preload.cjs')
  }
  // electron-vite 5 собирает preload как .mjs
  return path.join(__dirname, '../preload/index.mjs')
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
  const { BrowserWindow, path, isDev, __dirname, storage, getForceQuit, getTray, setMainWindow, getMainWindow } = deps

  const bounds = storage.get('windowBounds', { width: 1400, height: 900 })

  const mainWindow = new BrowserWindow({
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
