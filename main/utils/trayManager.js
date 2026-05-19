// v0.84.4: Tray and log viewer — extracted from main.js
// v0.89.38: log-viewer переведён на безопасные webPreferences (contextIsolation: true,
//           nodeIntegration: false) + preload + IPC channel 'log-viewer:content'.
//           По Electron Security Guidelines (https://www.electronjs.org/docs/latest/tutorial/security):
//             - Don't #2: «Do not enable Node.js integration for remote content»
//             - Don't #3: «Do not disable WebSecurity / contextIsolation»

import { Tray, Menu, BrowserWindow } from 'electron'
import { createTrayBadgeIcon } from './overlayIcon.js'

let _deps = null
let logViewerWin = null

function getLogViewerPreloadPath() {
  const { isDev, __dirname, path } = _deps
  if (isDev) return path.join(__dirname, '../../main/preloads/log-viewer.preload.cjs')
  return path.join(__dirname, '../preload/log-viewer.cjs')
}

// v0.84.3: Отдельное окно для просмотра логов
function openLogViewer() {
  const { isDev, __dirname, path, readLogFile } = _deps
  if (logViewerWin && !logViewerWin.isDestroyed()) { logViewerWin.focus(); return }
  logViewerWin = new BrowserWindow({
    width: 900, height: 600, title: 'Логи ChatCenter',
    backgroundColor: '#1a1b2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: getLogViewerPreloadPath(),
    },
  })
  const htmlPath = isDev
    ? path.join(__dirname, '../../main/log-viewer.html')
    : path.join(__dirname, '../main/log-viewer.html')
  logViewerWin.loadFile(htmlPath)
  const sendLog = () => {
    if (!logViewerWin || logViewerWin.isDestroyed()) return
    try {
      const content = readLogFile(1000)
      logViewerWin.webContents.send('log-viewer:content', content)
    } catch (_) {}
  }
  logViewerWin.webContents.once('did-finish-load', sendLog)
  // Auto refresh: обновляем лог каждые 3 сек пока окно открыто
  const logRefreshInterval = setInterval(() => {
    if (!logViewerWin || logViewerWin.isDestroyed()) { clearInterval(logRefreshInterval); return }
    sendLog()
  }, 3000)
  logViewerWin.on('closed', () => { logViewerWin = null; clearInterval(logRefreshInterval) })
}

/**
 * @param {Object} deps
 * @param {Object} deps.app
 * @param {Object} deps.path
 * @param {boolean} deps.isDev
 * @param {string} deps.__dirname
 * @param {Function} deps.readLogFile
 * @param {Function} deps.getMainWindow
 * @param {Function} deps.setForceQuit
 */
function createTray(deps) {
  _deps = deps
  const { app, getMainWindow, setForceQuit } = deps

  const tray = new Tray(createTrayBadgeIcon(0))
  tray.setToolTip('ЦентрЧатов')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Открыть ЦентрЧатов',
      click: () => {
        const mw = getMainWindow()
        if (mw) { mw.show(); mw.focus() }
      }
    },
    { type: 'separator' },
    {
      label: '📋 Показать лог',
      click: () => { openLogViewer() }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => { setForceQuit(true); app.quit() }
    }
  ])

  tray.setContextMenu(menu)

  tray.on('click', () => {
    const mw = getMainWindow()
    if (!mw) return
    if (mw.isVisible()) {
      mw.focus()
    } else {
      mw.show()
    }
  })

  return tray
}

export { createTray, openLogViewer }
