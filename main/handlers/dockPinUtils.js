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

// v1.2.70: окно-подсказка задачи (Вариант 4) — отдельное переиспользуемое окно.
export function getTooltipPreloadPath(isDev, path, __dirname) {
  if (isDev) return path.join(__dirname, '../../main/preloads/pin-tooltip.preload.cjs')
  return path.join(__dirname, '../preload/pin-tooltip.mjs')
}
export function getTooltipHtmlPath(isDev, path, __dirname) {
  if (isDev) return path.join(__dirname, '../../main/pin-tooltip.html')
  return path.join(__dirname, '../main/pin-tooltip.html')
}
/**
 * v1.2.70: окно-подсказка. `focusable:false` + `setIgnoreMouseEvents(true)` →
 * окно «сквозное»: не ловит мышь, не крадёт фокус, не порождает hover-событий.
 * Создаётся ОДИН раз и переиспользуется (не новое окно на каждый ховер).
 */
export function createTooltipBrowserWindow(deps) {
  const { isDev, path, __dirname } = deps
  const win = new BrowserWindow({
    width: 260,
    height: 120,
    x: -32000, // за экраном до первого показа
    y: -32000,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: getTooltipPreloadPath(isDev, path, __dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // v1.2.71 (ловушка #28): у СКРЫТОГО окна Electron засыпают rAF/таймеры →
      // после первого показа+скрытия тултип не мог сообщить размер и не
      // показывался снова. false = renderer работает и в hidden state.
      backgroundThrottling: false,
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver', 1)
  try { win.setIgnoreMouseEvents(true) } catch (_) {} // «сквозное» — мышь проходит насквозь
  return win
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
 * v1.2.60: вернуть pin-окно на экран перед показом.
 * При сворачивании safeHideTransparentWindow уводит окно за экран в 1×1
 * (защита от ghost hit-region на Win11). Любое место, которое потом делает
 * show() (клик по задаче ИЛИ срабатывание таймера), обязано сначала вернуть
 * видимые размеры/позицию — иначе окно «покажется» за краем экрана.
 * @param {object} item - элемент pinItems (в нём item.savedBounds от minimize)
 */
export function restorePinBounds(item) {
  const win = item && item.win
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return
  try {
    const b = item.savedBounds
    if (b && b.width > 50 && b.height > 20) {
      win.setBounds(b)
    } else {
      // Нет сохранённых bounds (напр. после перезапуска) — по центру экрана.
      const { workArea } = screen.getPrimaryDisplay()
      const w = 300, h = 160
      win.setBounds({
        x: Math.round(workArea.x + workArea.width / 2 - w / 2),
        y: Math.round(workArea.y + workArea.height / 2 - h / 2),
        width: w, height: h,
      })
    }
  } catch (_) {}
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
      // v1.2.60: свёрнутое окно было уведено за экран — вернуть перед показом.
      if (!item.win.isVisible()) { restorePinBounds(item); item.win.show() }
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
