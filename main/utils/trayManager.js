// v0.84.4: Tray and log viewer — extracted from main.js

import { Tray, Menu, BrowserWindow } from 'electron'
import { createTrayBadgeIcon } from './overlayIcon.js'

let _deps = null
let logViewerWin = null

// v0.84.3: Отдельное окно для просмотра логов
function openLogViewer() {
  const { isDev, __dirname, path, readLogFile } = _deps
  if (logViewerWin && !logViewerWin.isDestroyed()) { logViewerWin.focus(); return }
  logViewerWin = new BrowserWindow({
    width: 900, height: 600, title: 'Логи ChatCenter',
    backgroundColor: '#1a1b2e',
    webPreferences: { contextIsolation: false, nodeIntegration: false },
  })
  const htmlPath = isDev
    ? path.join(__dirname, '../../main/log-viewer.html')
    : path.join(__dirname, '../main/log-viewer.html')
  logViewerWin.loadFile(htmlPath)
  logViewerWin.webContents.once('did-finish-load', () => {
    const logContent = readLogFile(1000)
    logViewerWin.webContents.executeJavaScript(`window.__logContent = ${JSON.stringify(logContent)}; loadLog()`)
  })
  // Auto refresh: обновляем лог каждые 3 сек пока окно открыто
  const logRefreshInterval = setInterval(() => {
    if (!logViewerWin || logViewerWin.isDestroyed()) { clearInterval(logRefreshInterval); return }
    try {
      const content = readLogFile(1000)
      logViewerWin.webContents.executeJavaScript(`window.__logContent = ${JSON.stringify(content)}; if(autoMode) loadLog()`)
    } catch {}
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
