// v0.82.5: Dock/Pin/Timer система — вынесена из main.js
// v0.87.97: state и helper функции вынесены в dockPinState.js (~230 строк).
// Здесь — только IPC handlers (pin:* и dock:*).
import { ipcMain, BrowserWindow, screen } from 'electron'
import { getPinHtmlPath, createPinBrowserWindow, startTimerForItem } from './dockPinUtils.js'
import { createDockPinState, DOCK_PREVIEW_RESERVE } from './dockPinState.js'

export function initDockPinSystem(deps) {
const { getMainWindow, storage, isDev, __dirname, path, DEFAULT_MESSENGERS } = deps

const state = createDockPinState({ getMainWindow, storage, isDev, __dirname, path })
const {
  pinItems, counter, dockState,
  savePinItems, loadPinItems, restorePin,
  ensureDockWindow, addToDock, removeFromDock, removePin,
  checkDockVisibility, findPinIdByWin,
  getShowDockEmpty, getDockCenterExpand,
} = state

// ── Создание pin-окна ──
ipcMain.on('notif:pin-message', (_event, data) => {
  if (data.messengerId && !data.messengerName) {
    const messengers = storage.get('messengers', DEFAULT_MESSENGERS)
    const found = messengers.find(m => m.id === data.messengerId)
    if (found) data.messengerName = found.name
  }
  const pinId = ++counter.value
  const offset = (pinItems.size % 10) * 30
  const pinWin = createPinBrowserWindow({ isDev, path, __dirname }, offset)

  const item = { win: pinWin, data, timerEnd: null, timerTimeout: null, inDock: true, category: '', note: '' }
  pinItems.set(pinId, item)

  pinWin.loadFile(getPinHtmlPath(isDev, path, __dirname)).catch(err => {
    console.error('[PinWindow] Failed to load pin-notification.html:', err)
  })

  pinWin.webContents.once('did-finish-load', () => {
    pinWin.webContents.send('pin:data', { ...data, note: item.note })
  })

  addToDock(pinId, data)
  savePinItems()

  pinWin.on('closed', () => {
    const closedItem = pinItems.get(pinId)
    if (closedItem) {
      if (closedItem.timerTimeout) clearTimeout(closedItem.timerTimeout)
      if (closedItem.inDock) removeFromDock(pinId)
      closedItem.win = null
      pinItems.delete(pinId)
      savePinItems()
      checkDockVisibility()
    }
  })
})

// ── Pin: открепить ──
ipcMain.on('pin:unpin', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const pinId = findPinIdByWin(win)
  if (pinId !== null) removePin(pinId)
  else win.close()
})

// ── Pin: resize ──
ipcMain.on('pin:resize', (event, height) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  height = Math.round(height) + 2
  const bounds = win.getBounds()
  win.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height })
  if (!win.isVisible()) win.show()
})

// ── Pin → Main: перейти в чат мессенджера ──
ipcMain.on('pin:go-to-chat', (event, messengerId) => {
  if (!messengerId || !getMainWindow() || getMainWindow().isDestroyed()) return
  // Найти pin по окну и передать senderName для навигации к конкретному чату
  const win = BrowserWindow.fromWebContents(event.sender)
  let senderName = ''
  if (win) {
    const pinId = findPinIdByWin(win)
    if (pinId !== null) {
      const item = pinItems.get(pinId)
      if (item && item.data) senderName = item.data.sender || ''
    }
  }
  getMainWindow().webContents.send('notify:clicked', { messengerId, senderName })
  if (!getMainWindow().isVisible()) getMainWindow().show()
  getMainWindow().focus()
})

// ── Pin → Dock: свернуть в задачи ──
ipcMain.on('pin:minimize-to-dock', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const pinId = findPinIdByWin(win)
  if (pinId === null) return
  const item = pinItems.get(pinId)
  if (!item) return
  if (!item.inDock) {
    item.inDock = true
    addToDock(pinId, item.data)
    savePinItems()
  }
  win.hide()
})

// ── Pin: запустить таймер ──
ipcMain.on('pin:start-timer', (event, minutes) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const pinId = findPinIdByWin(win)
  if (pinId === null) return
  const item = pinItems.get(pinId)
  if (!item) return

  const ms = minutes * 60000
  startTimerForItem(item, pinId, ms, { dockWin: () => dockState.win, getMainWindow, savePinItems })

  if (!win.isDestroyed()) win.webContents.send('pin:timer-started', item.timerEnd)
  if (item.inDock && dockState.win && !dockState.win.isDestroyed()) {
    dockState.win.webContents.send('dock:update-timer', pinId, item.timerEnd)
  }
  savePinItems()
})

// ── Pin: отменить таймер ──
ipcMain.on('pin:cancel-timer', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const pinId = findPinIdByWin(win)
  if (pinId === null) return
  const item = pinItems.get(pinId)
  if (!item) return
  if (item.timerTimeout) { clearTimeout(item.timerTimeout); item.timerTimeout = null }
  item.timerEnd = null
  if (item.inDock && dockState.win && !dockState.win.isDestroyed()) {
    dockState.win.webContents.send('dock:update-timer', pinId, null)
  }
  savePinItems()
})

// ── Dock → Main: показать pin-окно ──
ipcMain.on('dock:show-pin', (_event, pinId) => {
  const item = pinItems.get(pinId)
  if (!item || !item.win || item.win.isDestroyed()) return
  if (item.win.isVisible()) {
    item.win.focus()
  } else {
    item.win.show()
    item.win.focus()
  }
})

// ── Dock → Main: открепить полностью ──
ipcMain.on('dock:unpin', (_event, pinId) => {
  removePin(pinId)
})

// ── Dock → Main: перейти в чат из dock-таба ──
ipcMain.on('dock:go-to-chat', (_event, pinId) => {
  const item = pinItems.get(pinId)
  if (!item || !item.data || !item.data.messengerId) return
  if (!getMainWindow() || getMainWindow().isDestroyed()) return
  const senderName = item.data.sender || ''
  getMainWindow().webContents.send('notify:clicked', { messengerId: item.data.messengerId, senderName })
  if (!getMainWindow().isVisible()) getMainWindow().show()
  getMainWindow().focus()
})

// ── Dock → Main: установить категорию из dock ──
ipcMain.on('dock:set-category', (_event, pinId, category) => {
  const item = pinItems.get(pinId)
  if (!item) return
  item.category = category || ''
  if (dockState.win && !dockState.win.isDestroyed()) {
    dockState.win.webContents.send('dock:update-category', pinId, item.category)
  }
  if (item.win && !item.win.isDestroyed()) {
    item.win.webContents.send('pin:category-updated', item.category)
  }
  savePinItems()
})

// ── Dock → Main: установить таймер из dock ──
ipcMain.on('dock:start-timer', (_event, pinId, minutes) => {
  const item = pinItems.get(pinId)
  if (!item) return

  const ms = minutes * 60000
  startTimerForItem(item, pinId, ms, { dockWin: () => dockState.win, getMainWindow, savePinItems })

  if (item.win && !item.win.isDestroyed()) {
    item.win.webContents.send('pin:timer-started', item.timerEnd)
  }
  if (dockState.win && !dockState.win.isDestroyed()) {
    dockState.win.webContents.send('dock:update-timer', pinId, item.timerEnd)
  }
  savePinItems()
})

// ── Dock: resize (ширина + высота) ──
ipcMain.on('dock:resize', (_event, width, height) => {
  if (!dockState.win || dockState.win.isDestroyed()) return
  width = Math.round(width) + 4
  height = Math.round(height) + 2
  dockState.baseHeight = height
  const totalH = height + DOCK_PREVIEW_RESERVE
  const display = screen.getPrimaryDisplay()
  const fullBounds = display.bounds
  const maxW = fullBounds.width - 40
  if (width > maxW) width = maxW
  const bounds = dockState.win.getBounds()
  let x = bounds.x
  if (getDockCenterExpand()) {
    const centerX = bounds.x + bounds.width / 2
    x = Math.round(centerX - width / 2)
  }
  if (x + width > fullBounds.x + fullBounds.width) {
    x = fullBounds.x + fullBounds.width - width
  }
  if (x < fullBounds.x) x = fullBounds.x
  const dockBottomY = bounds.y + bounds.height
  const newY = dockBottomY - totalH
  dockState.win.setBounds({ x, y: newY, width, height: totalH })
  if (!dockState.win.isVisible()) {
    let hasDocked = false
    for (const [, item] of pinItems) {
      if (item.inDock) { hasDocked = true; break }
    }
    if (hasDocked || getShowDockEmpty()) {
      dockState.win.showInactive()
    }
  }
})

// ── Dock: preview-space — теперь no-op (пространство предвыделено) ──
ipcMain.on('dock:preview-space', () => {
  // v0.70.0: пространство для тултипа предвыделено, ресайз не нужен
})

// ── Dock: ctx-menu-space — временно расширить окно вверх для контекстного меню ──
ipcMain.on('dock:ctx-menu-space', (_event, extraH) => {
  if (!dockState.win || dockState.win.isDestroyed()) return
  const bounds = dockState.win.getBounds()
  const dockBottomY = bounds.y + bounds.height
  if (extraH <= 0) {
    const normalH = dockState.baseHeight + DOCK_PREVIEW_RESERVE
    if (bounds.height !== normalH) {
      const newY = dockBottomY - normalH
      dockState.win.setBounds({ x: bounds.x, y: newY, width: bounds.width, height: normalH })
    }
    return
  }
  const neededH = dockState.baseHeight + Math.max(DOCK_PREVIEW_RESERVE, extraH)
  if (neededH <= bounds.height) return
  const newY = dockBottomY - neededH
  dockState.win.setBounds({ x: bounds.x, y: newY, width: bounds.width, height: neededH })
})

// ── Dock: закрыть/скрыть панель ──
ipcMain.on('dock:close', () => {
  if (dockState.win && !dockState.win.isDestroyed()) {
    dockState.win.hide()
  }
})

// ── Dock: сохранить порядок табов ──
ipcMain.on('dock:save-tab-order', (_event, order) => {
  if (Array.isArray(order)) {
    storage.set('dockTabOrder', order)
  }
})

// ── Pin: установить категорию ──
ipcMain.on('pin:set-category', (event, category) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const pinId = findPinIdByWin(win)
  if (pinId === null) return
  const item = pinItems.get(pinId)
  if (!item) return
  item.category = category || ''
  if (item.inDock && dockState.win && !dockState.win.isDestroyed()) {
    dockState.win.webContents.send('dock:update-category', pinId, item.category)
  }
  savePinItems()
})

// ── Pin: установить заметку ──
ipcMain.on('pin:set-note', (event, text) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const pinId = findPinIdByWin(win)
  if (pinId === null) return
  const item = pinItems.get(pinId)
  if (!item) return
  item.note = (text || '').slice(0, 200)
  if (item.inDock && dockState.win && !dockState.win.isDestroyed()) {
    dockState.win.webContents.send('dock:update-note', pinId, item.note)
  }
  savePinItems()
})

// ── Dock → Main: установить заметку из dock ──
ipcMain.on('dock:set-note', (_event, pinId, text) => {
  const item = pinItems.get(pinId)
  if (!item) return
  item.note = (text || '').slice(0, 200)
  if (dockState.win && !dockState.win.isDestroyed()) {
    dockState.win.webContents.send('dock:update-note', pinId, item.note)
  }
  if (item.win && !item.win.isDestroyed()) {
    item.win.webContents.send('pin:note-updated', item.note)
  }
  savePinItems()
})

// v0.72.1: Восстановить задачи из storage при запуске
loadPinItems()

}
