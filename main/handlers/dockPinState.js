// v0.87.97: вынесено из dockPinHandlers.js при разбиении.
// State (pinItems Map, dockWin, dockBaseHeight) + helper functions:
// savePinItems, loadPinItems, restorePin, ensureDockWindow, addToDock, removeFromDock,
// removePin, checkDockVisibility, findPinIdByWin, getShowDockEmpty, getDockCenterExpand.
import { BrowserWindow, screen } from 'electron'
import { getPinHtmlPath, getDockPreloadPath, getDockHtmlPath, createPinBrowserWindow, startTimerForItem } from './dockPinUtils.js'

export const DOCK_PREVIEW_RESERVE = 420 // пространство для тултипа + контекстного меню

export function createDockPinState(deps) {
  const { getMainWindow, storage, isDev, __dirname, path } = deps

  const pinItems = new Map() // pinId → { win, data, timerEnd, timerTimeout, inDock, category, note }
  const counter = { value: 0 }
  const dockState = { win: null, baseHeight: 48 }

  function getShowDockEmpty() {
    const s = storage.get('settings', {})
    return s.showDockEmpty === true
  }

  function getDockCenterExpand() {
    const s = storage.get('settings', {})
    return s.dockCenterExpand === true
  }

  // v0.72.1: Персистентность задач — сохранение/загрузка из storage
  function savePinItems() {
    const arr = []
    for (const [pinId, item] of pinItems) {
      if (!item.inDock) continue // сохраняем только задачи в dock
      arr.push({
        pinId,
        data: item.data,
        category: item.category || '',
        note: item.note || '',
        timerEnd: item.timerEnd || null,
      })
    }
    storage.set('pinItems', arr)
  }

  function findPinIdByWin(win) {
    for (const [pinId, item] of pinItems) {
      if (item.win === win) return pinId
    }
    return null
  }

  // Создать / показать dock-окно
  function ensureDockWindow() {
    if (dockState.win && !dockState.win.isDestroyed()) return dockState.win

    const display = screen.getPrimaryDisplay()
    const fullBounds = display.bounds
    const initW = 120
    const dockH = 48
    const totalH = dockH + DOCK_PREVIEW_RESERVE
    // Восстановить позицию из storage (y — нижняя граница dock)
    const saved = storage.get('dockPosition', null)
    const startX = saved ? saved.x : Math.round(fullBounds.x + (fullBounds.width - initW) / 2)
    // y хранит позицию нижнего края dock — по умолчанию внизу экрана (поверх таскбара)
    const baseY = saved ? saved.y : fullBounds.y + fullBounds.height - dockH
    const startY = baseY - DOCK_PREVIEW_RESERVE

    const dockWin = new BrowserWindow({
      width: initW,
      height: totalH,
      x: startX,
      y: startY,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      show: false,
      webPreferences: {
        preload: getDockPreloadPath(isDev, path, __dirname),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      }
    })
    dockState.win = dockWin

    // Поверх ВСЕХ окон — уровень screen-saver + relativeLevel 1 для Windows
    dockWin.setAlwaysOnTop(true, 'screen-saver', 1)

    dockWin.loadFile(getDockHtmlPath(isDev, path, __dirname)).catch(err => {
      console.error('[Dock] Failed to load pin-dock.html:', err)
    })

    // Реассерт alwaysOnTop при потере фокуса (Windows таскбар может перекрыть)
    dockWin.on('blur', () => {
      if (dockState.win && !dockState.win.isDestroyed()) {
        dockState.win.setAlwaysOnTop(true, 'screen-saver', 1)
      }
    })

    // Snap к краям + сохранение позиции при перемещении
    dockWin.on('moved', () => {
      if (!dockState.win || dockState.win.isDestroyed()) return
      const bounds = dockState.win.getBounds()
      const display = screen.getPrimaryDisplay()
      const wa = display.workArea
      const fullBounds = display.bounds
      const SNAP = 20
      let snapped = false
      const dockY = bounds.y + DOCK_PREVIEW_RESERVE
      let sx = bounds.x, sy = dockY

      if (Math.abs(bounds.x - wa.x) < SNAP) { sx = wa.x; snapped = true }
      if (Math.abs((bounds.x + bounds.width) - (wa.x + wa.width)) < SNAP) { sx = wa.x + wa.width - bounds.width; snapped = true }
      if (Math.abs(dockY - wa.y) < SNAP) { sy = wa.y; snapped = true }
      if (Math.abs((dockY + dockState.baseHeight) - (fullBounds.y + fullBounds.height)) < SNAP) { sy = fullBounds.y + fullBounds.height - dockState.baseHeight; snapped = true }
      if (Math.abs((dockY + dockState.baseHeight) - (wa.y + wa.height)) < SNAP) { sy = wa.y + wa.height - dockState.baseHeight; snapped = true }

      const finalX = snapped ? sx : bounds.x
      const finalDockY = snapped ? sy : dockY
      const finalWinY = finalDockY - DOCK_PREVIEW_RESERVE
      if (snapped) dockState.win.setPosition(finalX, finalWinY)
      storage.set('dockPosition', { x: finalX, y: finalDockY })
    })

    dockWin.on('closed', () => { dockState.win = null })
    return dockWin
  }

  // Добавить таб в dock
  function addToDock(pinId, data) {
    const dock = ensureDockWindow()
    const item = pinItems.get(pinId)
    const sendAdd = () => {
      dock.webContents.send('dock:add', { pinId, sender: data.sender, color: data.color, text: data.text, time: data.time, category: item ? item.category : '', messengerId: data.messengerId || '', note: item ? item.note || '' : '', messengerName: data.messengerName || '' })
      if (!dock.isVisible()) dock.showInactive()
      if (item && item.timerEnd) {
        dock.webContents.send('dock:update-timer', pinId, item.timerEnd)
      }
    }
    if (dock.webContents.isLoading()) {
      dock.webContents.once('did-finish-load', sendAdd)
    } else {
      sendAdd()
    }
  }

  function removeFromDock(pinId) {
    if (!dockState.win || dockState.win.isDestroyed()) return
    dockState.win.webContents.send('dock:remove', pinId)
  }

  function checkDockVisibility() {
    if (!dockState.win || dockState.win.isDestroyed()) return
    let hasDocked = false
    for (const [, item] of pinItems) {
      if (item.inDock) { hasDocked = true; break }
    }
    if (!hasDocked) {
      if (!getShowDockEmpty()) {
        dockState.win.hide()
      } else {
        dockState.win.webContents.send('dock:show-empty', true)
      }
    }
  }

  function removePin(pinId) {
    const item = pinItems.get(pinId)
    if (!item) return
    if (item.timerTimeout) clearTimeout(item.timerTimeout)
    const win = item.win
    item.win = null
    if (win && !win.isDestroyed()) win.close()
    if (item.inDock) removeFromDock(pinId)
    pinItems.delete(pinId)
    savePinItems()
    checkDockVisibility()
  }

  function restorePin(pinId, data, category, note, timerEnd) {
    const offset = (pinItems.size % 10) * 30
    const pinWin = createPinBrowserWindow({ isDev, path, __dirname }, offset)

    const item = { win: pinWin, data, timerEnd: null, timerTimeout: null, inDock: true, category, note }
    pinItems.set(pinId, item)

    pinWin.loadFile(getPinHtmlPath(isDev, path, __dirname)).catch(err => {
      console.error('[PinWindow] Failed to load pin-notification.html:', err)
    })

    pinWin.webContents.once('did-finish-load', () => {
      pinWin.webContents.send('pin:data', { ...data, note })
      if (category) pinWin.webContents.send('pin:category-updated', category)
      if (item.timerEnd && item.timerEnd > Date.now()) {
        pinWin.webContents.send('pin:timer-started', item.timerEnd)
      }
    })

    addToDock(pinId, data)

    if (timerEnd && timerEnd > Date.now()) {
      const remaining = timerEnd - Date.now()
      startTimerForItem(item, pinId, remaining, { dockWin: () => dockState.win, getMainWindow, savePinItems })
    }

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
  }

  function loadPinItems() {
    const saved = storage.get('pinItems', [])
    if (!Array.isArray(saved) || saved.length === 0) return
    for (const s of saved) {
      if (!s.data || !s.pinId) continue
      const pinId = s.pinId
      if (pinId >= counter.value) counter.value = pinId
      restorePin(pinId, s.data, s.category || '', s.note || '', s.timerEnd || null)
    }
  }

  return {
    pinItems, counter, dockState,
    savePinItems, loadPinItems, restorePin,
    ensureDockWindow, addToDock, removeFromDock, removePin,
    checkDockVisibility, findPinIdByWin,
    getShowDockEmpty, getDockCenterExpand,
  }
}
