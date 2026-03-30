// v0.82.5: Dock/Pin/Timer система — вынесена из main.js
// Все IPC handlers для dock:*, pin:*, таймеры, pin-окна, dock-окно
import { ipcMain, BrowserWindow, screen } from 'electron'
import { getPinPreloadPath, getPinHtmlPath, getDockPreloadPath, getDockHtmlPath, createPinBrowserWindow, startTimerForItem } from './dockPinUtils.js'

export function initDockPinSystem(deps) {
const { getMainWindow, storage, isDev, __dirname, path, DEFAULT_MESSENGERS } = deps

// ── v0.66.0: Pin + Dock + Timer ──────────────────────────────────────────────
const pinItems = new Map() // pinId → { win, data, timerEnd, timerTimeout, inDock, category, note }
let pinIdCounter = 0
let dockWin = null
const DOCK_PREVIEW_RESERVE = 420 // пространство для тултипа + контекстного меню (без resize = без дёрганья)

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

function loadPinItems() {
  const saved = storage.get('pinItems', [])
  if (!Array.isArray(saved) || saved.length === 0) return
  for (const s of saved) {
    if (!s.data || !s.pinId) continue
    const pinId = s.pinId
    if (pinId >= pinIdCounter) pinIdCounter = pinId // следующий будет +1
    restorePin(pinId, s.data, s.category || '', s.note || '', s.timerEnd || null)
  }
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

  // Восстановить таймер если ещё не истёк
  if (timerEnd && timerEnd > Date.now()) {
    const remaining = timerEnd - Date.now()
    startTimerForItem(item, pinId, remaining, { dockWin: () => dockWin, getMainWindow, savePinItems })
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

// Найти pinId по BrowserWindow
function findPinIdByWin(win) {
  for (const [pinId, item] of pinItems) {
    if (item.win === win) return pinId
  }
  return null
}

// Создать / показать dock-окно
function ensureDockWindow() {
  if (dockWin && !dockWin.isDestroyed()) return dockWin

  const display = screen.getPrimaryDisplay()
  const fullBounds = display.bounds
  const initW = 120
  const dockH = 48
  const totalH = dockH + DOCK_PREVIEW_RESERVE // предвыделенное место для тултипа
  // Восстановить позицию из storage (y — нижняя граница dock)
  const saved = storage.get('dockPosition', null)
  const startX = saved ? saved.x : Math.round(fullBounds.x + (fullBounds.width - initW) / 2)
  // y хранит позицию нижнего края dock — по умолчанию внизу экрана (поверх таскбара)
  const baseY = saved ? saved.y : fullBounds.y + fullBounds.height - dockH
  const startY = baseY - DOCK_PREVIEW_RESERVE

  dockWin = new BrowserWindow({
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

  // Поверх ВСЕХ окон — уровень screen-saver + relativeLevel 1 для Windows
  dockWin.setAlwaysOnTop(true, 'screen-saver', 1)
  // Click-through: прозрачные пиксели (transparent: true) автоматически пропускают клики
  // НЕ используем setIgnoreMouseEvents — оно ломает -webkit-app-region: drag

  dockWin.loadFile(getDockHtmlPath(isDev, path, __dirname)).catch(err => {
    console.error('[Dock] Failed to load pin-dock.html:', err)
  })

  // Реассерт alwaysOnTop при потере фокуса (Windows таскбар может перекрыть)
  // НЕ используем moveTop() — вызывает моргание окна (Ловушка 28)
  dockWin.on('blur', () => {
    if (dockWin && !dockWin.isDestroyed()) {
      dockWin.setAlwaysOnTop(true, 'screen-saver', 1)
    }
  })

  // Snap к краям + сохранение позиции при перемещении
  dockWin.on('moved', () => {
    if (!dockWin || dockWin.isDestroyed()) return
    const bounds = dockWin.getBounds()
    const display = screen.getPrimaryDisplay()
    const wa = display.workArea
    const fullBounds = display.bounds
    const SNAP = 20
    let snapped = false
    // Позиция dock (нижняя часть окна)
    const dockY = bounds.y + DOCK_PREVIEW_RESERVE
    let sx = bounds.x, sy = dockY

    if (Math.abs(bounds.x - wa.x) < SNAP) { sx = wa.x; snapped = true }
    if (Math.abs((bounds.x + bounds.width) - (wa.x + wa.width)) < SNAP) { sx = wa.x + wa.width - bounds.width; snapped = true }
    if (Math.abs(dockY - wa.y) < SNAP) { sy = wa.y; snapped = true }
    // Snap к нижнему краю ЭКРАНА (не workArea) — dock поверх таскбара Windows
    if (Math.abs((dockY + dockBaseHeight) - (fullBounds.y + fullBounds.height)) < SNAP) { sy = fullBounds.y + fullBounds.height - dockBaseHeight; snapped = true }
    // Также snap к нижнему краю workArea (над таскбаром)
    if (Math.abs((dockY + dockBaseHeight) - (wa.y + wa.height)) < SNAP) { sy = wa.y + wa.height - dockBaseHeight; snapped = true }

    const finalX = snapped ? sx : bounds.x
    const finalDockY = snapped ? sy : dockY
    const finalWinY = finalDockY - DOCK_PREVIEW_RESERVE
    if (snapped) dockWin.setPosition(finalX, finalWinY)
    storage.set('dockPosition', { x: finalX, y: finalDockY })
  })

  dockWin.on('closed', () => { dockWin = null })
  return dockWin
}

// Проверяем настройку "показывать dock без задач"
function getShowDockEmpty() {
  const s = storage.get('settings', {})
  return s.showDockEmpty === true
}

// Проверяем настройку "расширение dock по центру"
function getDockCenterExpand() {
  const s = storage.get('settings', {})
  return s.dockCenterExpand === true
}

// Добавить таб в dock
function addToDock(pinId, data) {
  const dock = ensureDockWindow()
  const item = pinItems.get(pinId)
  const sendAdd = () => {
    dock.webContents.send('dock:add', { pinId, sender: data.sender, color: data.color, text: data.text, time: data.time, category: item ? item.category : '', messengerId: data.messengerId || '', note: item ? item.note || '' : '', messengerName: data.messengerName || '' })
    if (!dock.isVisible()) dock.showInactive()
    // Передать текущий таймер если есть
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

// Удалить таб из dock (только UI)
function removeFromDock(pinId) {
  if (!dockWin || dockWin.isDestroyed()) return
  dockWin.webContents.send('dock:remove', pinId)
}

// Полное удаление pin
function removePin(pinId) {
  const item = pinItems.get(pinId)
  if (!item) return
  if (item.timerTimeout) clearTimeout(item.timerTimeout)
  const win = item.win
  item.win = null // Предотвратить повторный close из 'closed' handler
  if (win && !win.isDestroyed()) win.close()
  if (item.inDock) removeFromDock(pinId)
  pinItems.delete(pinId)
  savePinItems()
  // После удаления — ВСЕГДА проверить, нужно ли скрыть dock
  checkDockVisibility()
}

// Проверить видимость dock: скрыть если пуст и showDockEmpty=false
function checkDockVisibility() {
  if (!dockWin || dockWin.isDestroyed()) return
  let hasDocked = false
  for (const [, item] of pinItems) {
    if (item.inDock) { hasDocked = true; break }
  }
  if (!hasDocked) {
    if (!getShowDockEmpty()) {
      dockWin.hide()
    } else {
      // Показать "нет задач" — dock видим но пуст
      dockWin.webContents.send('dock:show-empty', true)
    }
  }
}

// ── Создание pin-окна ──
ipcMain.on('notif:pin-message', (_event, data) => {
  if (data.messengerId && !data.messengerName) {
    const messengers = storage.get('messengers', DEFAULT_MESSENGERS)
    const found = messengers.find(m => m.id === data.messengerId)
    if (found) data.messengerName = found.name
  }
  const pinId = ++pinIdCounter
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
  // Уже в dock (авто-закрепление), просто скрываем окно
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
  startTimerForItem(item, pinId, ms, { dockWin: () => dockWin, getMainWindow, savePinItems })

  // Сообщить pin-окну
  if (!win.isDestroyed()) win.webContents.send('pin:timer-started', item.timerEnd)
  // Сообщить dock
  if (item.inDock && dockWin && !dockWin.isDestroyed()) {
    dockWin.webContents.send('dock:update-timer', pinId, item.timerEnd)
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
  // Сообщить dock
  if (item.inDock && dockWin && !dockWin.isDestroyed()) {
    dockWin.webContents.send('dock:update-timer', pinId, null)
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
  // Обновить dock UI
  if (dockWin && !dockWin.isDestroyed()) {
    dockWin.webContents.send('dock:update-category', pinId, item.category)
  }
  // Обновить pin-окно если открыто
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
  startTimerForItem(item, pinId, ms, { dockWin: () => dockWin, getMainWindow, savePinItems })

  // Сообщить pin-окну
  if (item.win && !item.win.isDestroyed()) {
    item.win.webContents.send('pin:timer-started', item.timerEnd)
  }
  // Сообщить dock
  if (dockWin && !dockWin.isDestroyed()) {
    dockWin.webContents.send('dock:update-timer', pinId, item.timerEnd)
  }
  savePinItems()
})

// Базовая высота dock (сохраняем при resize)
let dockBaseHeight = 48

// ── Dock: resize (ширина + высота) ──
ipcMain.on('dock:resize', (_event, width, height) => {
  if (!dockWin || dockWin.isDestroyed()) return
  width = Math.round(width) + 4
  height = Math.round(height) + 2
  dockBaseHeight = height
  const totalH = height + DOCK_PREVIEW_RESERVE
  const display = screen.getPrimaryDisplay()
  const fullBounds = display.bounds
  const maxW = fullBounds.width - 40
  if (width > maxW) width = maxW
  const bounds = dockWin.getBounds()
  let x = bounds.x
  if (getDockCenterExpand()) {
    // Расширение по центру: сохраняем центральную точку
    const centerX = bounds.x + bounds.width / 2
    x = Math.round(centerX - width / 2)
  }
  // Не выходить за правый край
  if (x + width > fullBounds.x + fullBounds.width) {
    x = fullBounds.x + fullBounds.width - width
  }
  // Не выходить за левый край
  if (x < fullBounds.x) x = fullBounds.x
  // Нижняя граница dock остаётся на месте, окно растёт вверх
  const dockBottomY = bounds.y + bounds.height
  const newY = dockBottomY - totalH
  dockWin.setBounds({ x, y: newY, width, height: totalH })
  // Показать dock только если есть задачи ИЛИ настройка showDockEmpty
  if (!dockWin.isVisible()) {
    let hasDocked = false
    for (const [, item] of pinItems) {
      if (item.inDock) { hasDocked = true; break }
    }
    if (hasDocked || getShowDockEmpty()) {
      dockWin.showInactive()
    }
  }
})

// ── Dock: preview-space — теперь no-op (пространство предвыделено) ──
ipcMain.on('dock:preview-space', () => {
  // v0.70.0: пространство для тултипа предвыделено, ресайз не нужен
})

// ── Dock: ctx-menu-space — временно расширить окно вверх для контекстного меню ──
ipcMain.on('dock:ctx-menu-space', (_event, extraH) => {
  if (!dockWin || dockWin.isDestroyed()) return
  const bounds = dockWin.getBounds()
  const dockBottomY = bounds.y + bounds.height
  if (extraH <= 0) {
    // Восстановить нормальную высоту
    const normalH = dockBaseHeight + DOCK_PREVIEW_RESERVE
    if (bounds.height !== normalH) {
      const newY = dockBottomY - normalH
      dockWin.setBounds({ x: bounds.x, y: newY, width: bounds.width, height: normalH })
    }
    return
  }
  const neededH = dockBaseHeight + Math.max(DOCK_PREVIEW_RESERVE, extraH)
  if (neededH <= bounds.height) return // уже достаточно места
  const newY = dockBottomY - neededH
  dockWin.setBounds({ x: bounds.x, y: newY, width: bounds.width, height: neededH })
})

// ── Dock: закрыть/скрыть панель ──
ipcMain.on('dock:close', () => {
  if (dockWin && !dockWin.isDestroyed()) {
    dockWin.hide()
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
  // Обновить dock
  if (item.inDock && dockWin && !dockWin.isDestroyed()) {
    dockWin.webContents.send('dock:update-category', pinId, item.category)
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
  // Обновить dock
  if (item.inDock && dockWin && !dockWin.isDestroyed()) {
    dockWin.webContents.send('dock:update-note', pinId, item.note)
  }
  savePinItems()
})

// ── Dock → Main: установить заметку из dock ──
ipcMain.on('dock:set-note', (_event, pinId, text) => {
  const item = pinItems.get(pinId)
  if (!item) return
  item.note = (text || '').slice(0, 200)
  // Обновить dock UI
  if (dockWin && !dockWin.isDestroyed()) {
    dockWin.webContents.send('dock:update-note', pinId, item.note)
  }
  // Обновить pin-окно если открыто
  if (item.win && !item.win.isDestroyed()) {
    item.win.webContents.send('pin:note-updated', item.note)
  }
  savePinItems()
})

// v0.72.1: Восстановить задачи из storage при запуске
loadPinItems()

}
