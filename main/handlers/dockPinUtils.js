// v0.84.4: Утилиты для dock/pin системы — вынесены из dockPinHandlers.js
import { BrowserWindow, screen } from 'electron'

/**
 * Получить путь к preload pin-окна
 */
export function getPinPreloadPath(isDev, path, __dirname) {
  if (isDev) return path.join(__dirname, '../../main/preloads/pin.preload.cjs')
  return path.join(__dirname, '../preload/pin.mjs')
}

/**
 * Получить путь к HTML pin-окна
 */
export function getPinHtmlPath(isDev, path, __dirname) {
  if (isDev) return path.join(__dirname, '../../main/pin-notification.html')
  return path.join(__dirname, '../main/pin-notification.html')
}

/**
 * Получить путь к preload dock-окна
 */
export function getDockPreloadPath(isDev, path, __dirname) {
  if (isDev) return path.join(__dirname, '../../main/preloads/pin-dock.preload.cjs')
  return path.join(__dirname, '../preload/pin-dock.mjs')
}

/**
 * Получить путь к HTML dock-окна
 */
export function getDockHtmlPath(isDev, path, __dirname) {
  if (isDev) return path.join(__dirname, '../../main/pin-dock.html')
  return path.join(__dirname, '../main/pin-dock.html')
}

/**
 * Создать BrowserWindow для pin-окна
 * @param {object} deps - { isDev, path, __dirname }
 * @param {number} offset - смещение для каскадного расположения
 * @returns {BrowserWindow}
 */
export function createPinBrowserWindow(deps, offset) {
  const { isDev, path, __dirname } = deps
  const { workArea } = screen.getPrimaryDisplay()

  return new BrowserWindow({
    width: 300,
    height: 150,
    x: Math.round(workArea.x + workArea.width / 2 - 150 + offset),
    y: Math.round(workArea.y + workArea.height / 2 - 75 + offset),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: getPinPreloadPath(isDev, path, __dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })
}

/**
 * Запустить таймер для pin-задачи (общая логика для restorePin, pin:start-timer, dock:start-timer)
 * @param {object} item - элемент pinItems (мутируется)
 * @param {number} pinId - ID пина
 * @param {number} ms - время до срабатывания в миллисекундах
 * @param {object} ctx - { dockWin, getMainWindow, savePinItems }
 */
export function startTimerForItem(item, pinId, ms, ctx) {
  const { dockWin, getMainWindow, savePinItems } = ctx

  if (item.timerTimeout) clearTimeout(item.timerTimeout)

  item.timerEnd = Date.now() + ms
  item.timerTimeout = setTimeout(() => {
    item.timerTimeout = null
    item.timerEnd = null
    // Показать pin-окно если скрыто
    if (item.win && !item.win.isDestroyed()) {
      if (!item.win.isVisible()) item.win.show()
      item.win.webContents.send('pin:timer-alert')
    }
    // Мигнуть в dock
    const dw = typeof dockWin === 'function' ? dockWin() : dockWin
    if (dw && !dw.isDestroyed()) {
      dw.webContents.send('dock:timer-alert', pinId)
    }
    // Мигнуть окном в таскбаре
    if (getMainWindow() && !getMainWindow().isDestroyed()) {
      getMainWindow().flashFrame(true)
    }
    savePinItems()
  }, ms)
}
