// v0.87.97: вынесено из dockPinHandlers.js при разбиении.
// State (pinItems Map, dockWin, dockBaseHeight) + helper functions:
// savePinItems, loadPinItems, restorePin, ensureDockWindow, addToDock, removeFromDock,
// removePin, checkDockVisibility, findPinIdByWin, getShowDockEmpty, getDockCenterExpand.
import { BrowserWindow, screen } from 'electron'
import { getPinHtmlPath, getDockPreloadPath, getDockHtmlPath, createPinBrowserWindow, startTimerForItem, createTooltipBrowserWindow, getTooltipHtmlPath } from './dockPinUtils.js'
import { safeHideTransparentWindow } from '../utils/transparentWindowGuard.js'

// v1.2.60: было 420 (статический прозрачный резерв над полоской дока).
// Проблема: прозрачное окно Electron НЕ пропускает клики через прозрачные
// пиксели — `transparent:true` влияет только на отрисовку, а не на hit-test;
// клик-насквозь возможен лишь через setIgnoreMouseEvents (убран — ломал drag,
// ловушка #27). Поэтому пустые 420px входили в прямоугольник окна и ловили
// мышь → пользователь не мог кликнуть в программу под доком.
// Теперь резерв 0: окно = только полоска, а меню/подсказка растят окно вверх
// ПО ТРЕБОВАНИЮ (dock:ctx-menu-space / dock:preview-space) и сжимают обратно.
export const DOCK_PREVIEW_RESERVE = 0

export function createDockPinState(deps) {
  const { getMainWindow, storage, isDev, __dirname, path, isQuitting } = deps

  const pinItems = new Map() // pinId → { win, data, timerEnd, timerTimeout, inDock, category, note }
  const counter = { value: 0 }
  const dockState = { win: null, baseHeight: 48 }
  // v1.2.70: окно-подсказка задачи (одно, переиспользуемое).
  const tooltipState = { win: null, anchorX: 0, anchorTabTop: 0, pendingShow: false }

  function getShowDockEmpty() {
    const s = storage.get('settings', {})
    return s.showDockEmpty === true
  }

  function getDockCenterExpand() {
    const s = storage.get('settings', {})
    return s.dockCenterExpand === true
  }

  let mainWinReassertHooked = false
  // v1.2.63 (Совет 1): немедленно вернуть док «поверх всех» (не ждать таймер 1с).
  // setAlwaysOnTop не крадёт фокус; работает только пока док видим.
  function reassertDockTop() {
    if (dockState.win && !dockState.win.isDestroyed() && dockState.win.isVisible()) {
      try { dockState.win.setAlwaysOnTop(true, 'screen-saver', 1) } catch (_) {}
    }
  }
  // v1.2.63 (Совет 1): реассерт по событиям ГЛАВНОГО окна (клик по панели задач =
  // main теряет фокус → мгновенно поднимаем док). Вешаем один раз, когда главное
  // окно уже создано (getMainWindow — ленивый геттер).
  function hookMainWindowReassertOnce() {
    if (mainWinReassertHooked) return
    const mw = getMainWindow()
    if (!mw || mw.isDestroyed()) return
    mainWinReassertHooked = true
    mw.on('blur', reassertDockTop)
    mw.on('focus', reassertDockTop)
    mw.on('minimize', reassertDockTop)
    mw.on('restore', reassertDockTop)
  }
  // v1.2.63 (Совет 2): смена монитора/разрешения/масштаба — вернуть док в рабочую
  // область (над панелью задач) и поднять поверх всех. Регистрируется один раз.
  screen.on('display-metrics-changed', () => {
    if (!dockState.win || dockState.win.isDestroyed()) return
    try {
      const disp = screen.getPrimaryDisplay()
      const wa = disp.workArea
      const b = dockState.win.getBounds()
      let x = b.x, y = b.y
      // v1.2.82: низ ЭКРАНА (разрешаем на панели задач), не рабочей области.
      const maxY = disp.bounds.y + disp.bounds.height - b.height
      if (y > maxY) y = maxY
      if (y < wa.y) y = wa.y
      if (x + b.width > wa.x + wa.width) x = wa.x + wa.width - b.width
      if (x < wa.x) x = wa.x
      if (x !== b.x || y !== b.y) dockState.win.setBounds({ x, y, width: b.width, height: b.height })
      reassertDockTop()
    } catch (_) {}
  })

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
    // v1.2.61: workArea = рабочая область БЕЗ панели задач (офиц. Electron
    // Display.workArea). Раньше брали display.bounds (весь экран, включая зону
    // панели задач) → док уходил ЗА панель задач.
    const wa = display.workArea
    const fullB = display.bounds // v1.2.82: весь экран, включая зону панели задач
    const initW = 120
    const dockH = 48
    const totalH = dockH + DOCK_PREVIEW_RESERVE
    // Восстановить позицию из storage (y — нижняя граница dock)
    const saved = storage.get('dockPosition', null)
    const startX = saved ? saved.x : Math.round(wa.x + (wa.width - initW) / 2)
    // По умолчанию (ПЕРВЫЙ запуск, нет сохранённой) — над панелью задач.
    let baseY = saved ? saved.y : wa.y + wa.height - dockH
    // v1.2.82: разрешаем док НА панели задач Windows (по желанию пользователя — он
    // «поверх всех» + реассерт z-order держат его видимым). Ограничиваем только низом
    // ЭКРАНА, а не рабочей области — иначе сохранённая «на панели» позиция поднималась
    // вверх при старте (баг: перетащил на панель → после перезапуска ушёл выше неё).
    const maxBaseY = fullB.y + fullB.height - dockH
    if (baseY > maxBaseY) baseY = maxBaseY
    const startY = baseY - DOCK_PREVIEW_RESERVE
    // v1.2.81 (ВРЕМЕННАЯ ДИАГНОСТИКА «док за панелью задач после старта»):
    // wa (вкл. y) + сохранённая позиция + вычисленный startY. Удалить после диагноза.
    try { console.log('[dock-diag] ensureDockWindow saved=' + JSON.stringify(saved) + ' wa=' + JSON.stringify(wa) + ' dockH=' + dockH + ' maxBaseY=' + maxBaseY + ' baseY=' + baseY + ' startY=' + startY) } catch (_) {}

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
        // v1.2.80 (ловушка #28): у СКРЫТОГО окна Electron засыпают rAF/таймеры →
        // renderer не успевал сообщить размер полоски после показа и полоска была
        // не видна / не того размера. false = renderer работает и в hidden state
        // (как у окна-подсказки dockPinUtils и окна уведомлений).
        backgroundThrottling: false,
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
      const SNAP = 20
      let snapped = false
      const dockY = bounds.y + DOCK_PREVIEW_RESERVE
      let sx = bounds.x, sy = dockY

      if (Math.abs(bounds.x - wa.x) < SNAP) { sx = wa.x; snapped = true }
      if (Math.abs((bounds.x + bounds.width) - (wa.x + wa.width)) < SNAP) { sx = wa.x + wa.width - bounds.width; snapped = true }
      if (Math.abs(dockY - wa.y) < SNAP) { sy = wa.y; snapped = true }
      // v1.2.61: снап только к низу РАБОЧЕЙ области (над панелью задач).
      // Прежний снап к самому низу экрана (display.bounds) утаскивал док ЗА панель задач — убран.
      // v1.2.82: снап к низу ЭКРАНА (на панель задач Windows), а не рабочей области —
      // пользователь хочет держать полоску на панели Windows (она «поверх всех», видна).
      const screenBottom = display.bounds.y + display.bounds.height
      if (Math.abs((dockY + dockState.baseHeight) - screenBottom) < SNAP) { sy = screenBottom - dockState.baseHeight; snapped = true }

      const finalX = snapped ? sx : bounds.x
      // v1.2.82: ограничиваем только низом ЭКРАНА (не рабочей области) → сохранённая
      // «на панели задач» позиция больше НЕ поднимается вверх при следующем старте.
      const maxDockY = screenBottom - dockState.baseHeight
      let finalDockY = snapped ? sy : dockY
      if (finalDockY > maxDockY) finalDockY = maxDockY
      const finalWinY = finalDockY - DOCK_PREVIEW_RESERVE
      if (snapped) dockState.win.setPosition(finalX, finalWinY)
      // v1.2.81 (ВРЕМЕННАЯ ДИАГНОСТИКА): что реально сохраняем при перетаскивании +
      // геометрия. baseHeight = высота окна дока (влияет на кламп «над панелью задач»).
      try { console.log('[dock-diag] moved bounds=' + JSON.stringify(bounds) + ' wa=' + JSON.stringify(wa) + ' baseHeight=' + dockState.baseHeight + ' dockY=' + dockY + ' snapped=' + snapped + ' maxDockY=' + maxDockY + ' save={x:' + finalX + ',y:' + finalDockY + '}') } catch (_) {}
      storage.set('dockPosition', { x: finalX, y: finalDockY })
    })

    // v1.2.62: периодический реассерт «поверх всех». Проблема (Win11): при клике
    // по панели задач / фокусе другого окна Windows опускает наш topmost-док, а
    // реассерт был только на blur САМОГО дока (не срабатывал, когда фокус ушёл
    // на панель задач). setAlwaysOnTop заново поднимает окно над всеми и НЕ
    // крадёт фокус. Работает только пока док видим (иначе пропускаем).
    const topmostTimer = setInterval(() => {
      if (!dockState.win || dockState.win.isDestroyed()) { clearInterval(topmostTimer); return }
      try { if (dockState.win.isVisible()) dockState.win.setAlwaysOnTop(true, 'screen-saver', 1) } catch (_) {}
    }, 1000)

    dockWin.on('closed', () => { clearInterval(topmostTimer); dockState.win = null })
    hookMainWindowReassertOnce() // v1.2.63 (Совет 1)
    return dockWin
  }

  // v1.2.76: вернуть окно дока в рабочую область перед показом.
  // Корень бага «после Свернуть дока нет»: checkDockVisibility при 0 задач прячет
  // окно через safeHide → уводит в {x:-30000,y:-30000,1×1}. При повторном показе
  // (новая/возвращённая задача) addToDock звал showInactive() по СТАРЫМ офскрин-
  // координатам, а dock:resize считает Y от текущих bounds (−30000) и клампит
  // только X → окно «видимо», но за верхней кромкой экрана. Здесь ставим низ
  // рабочей области (над панелью задач), как в ensureDockWindow, честно из workArea.
  function restoreDockBounds(dock) {
    const display = screen.getPrimaryDisplay()
    const wa = display.workArea
    const dockH = dockState.baseHeight || 48
    const totalH = dockH + DOCK_PREVIEW_RESERVE
    const saved = storage.get('dockPosition', null)
    const w = 120 // резервная ширина; dock:resize уточнит по контенту
    const x = saved ? saved.x : Math.round(wa.x + (wa.width - w) / 2)
    let baseY = saved ? saved.y : wa.y + wa.height - dockH
    // v1.2.82: низ ЭКРАНА (разрешаем док на панели задач), не рабочей области.
    const maxBaseY = display.bounds.y + display.bounds.height - dockH
    if (baseY > maxBaseY) baseY = maxBaseY
    const y = baseY - DOCK_PREVIEW_RESERVE
    // v1.2.80 (ВРЕМЕННАЯ ДИАГНОСТИКА): что реально ставим и из какой сохранённой позиции.
    try { console.log('[dock-diag] restoreDockBounds saved=' + JSON.stringify(saved) + ' set={x:' + x + ',y:' + y + ',w:' + w + ',h:' + totalH + '} wa=' + JSON.stringify(wa)) } catch (_) {}
    try { dock.setBounds({ x, y, width: w, height: totalH }) } catch (_) {}
  }

  // Добавить таб в dock
  function addToDock(pinId, data) {
    const dock = ensureDockWindow()
    hookMainWindowReassertOnce() // v1.2.63 (Совет 1): на случай если при создании дока главное окно ещё не было готово
    const item = pinItems.get(pinId)
    const sendAdd = () => {
      dock.webContents.send('dock:add', { pinId, sender: data.sender, color: data.color, text: data.text, time: data.time, category: item ? item.category : '', messengerId: data.messengerId || '', note: item ? item.note || '' : '', messengerName: data.messengerName || '' })
      if (!dock.isVisible()) { restoreDockBounds(dock); dock.showInactive() }
      // v1.2.80 (ВРЕМЕННАЯ ДИАГНОСТИКА): состояние окна дока сразу после показа.
      try { console.log('[dock-diag] addToDock afterShow bounds=' + JSON.stringify(dock.getBounds()) + ' visible=' + dock.isVisible() + ' loading=' + dock.webContents.isLoading()) } catch (_) {}
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
        // v0.89.18: safeHide — иначе ghost hit-region на Win11
        safeHideTransparentWindow(dockState.win)
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
      // v1.2.65: на выходе из приложения НЕ удаляем пин из storage —
      // иначе восстановленное закреплённое снова стирается при перезапуске.
      if (isQuitting && isQuitting()) return
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

  // ── v1.2.70: окно-подсказка задачи (Вариант 4) ──
  // Создаётся один раз, переиспользуется. Показывается НАД вкладкой, «сквозное»
  // (не ловит мышь) → не ресайзит док и не порождает петлю дёрга.
  function ensureTooltipWindow() {
    if (tooltipState.win && !tooltipState.win.isDestroyed()) return tooltipState.win
    const win = createTooltipBrowserWindow({ isDev, path, __dirname })
    tooltipState.win = win
    win.loadFile(getTooltipHtmlPath(isDev, path, __dirname)).catch(err => {
      console.error('[Tooltip] Failed to load pin-tooltip.html:', err)
    })
    win.on('closed', () => { tooltipState.win = null })
    return win
  }

  // Наведение на вкладку → показать подсказку. rect — прямоугольник вкладки
  // относительно окна дока (renderer прислал getBoundingClientRect).
  function showTooltip(pinId, rect) {
    const item = pinItems.get(pinId)
    if (!item || !item.data) return
    if (!dockState.win || dockState.win.isDestroyed()) return
    const db = dockState.win.getBounds()
    tooltipState.anchorX = db.x + Math.round((rect && rect.left) || 0)
    tooltipState.anchorTabTop = db.y + Math.round((rect && rect.top) || 0)
    tooltipState.pendingShow = true
    const win = ensureTooltipWindow()
    // v1.2.73: ВЕРНУТЬ окну нормальную ширину ПЕРЕД замером. После hide
    // (safeHide уводит окно в 1×1) карточка иначе меряется в окне шириной 1px →
    // текст переносится по одному символу → узкая высокая подсказка. Ставим
    // просторный офскрин-бокс, renderer замерит карточку по её max-width.
    try { win.setBounds({ x: -32000, y: -32000, width: 300, height: 400 }) } catch (_) {}
    const d = item.data
    const payload = {
      sender: d.sender || '', text: d.text || '', time: d.time || '',
      color: d.color || '#2AABEE', messengerName: d.messengerName || '',
      category: item.category || '', note: item.note || '',
      icon: d.icon || '', // v1.2.75: аватар для подсказки (cc-media:// или data-url)
    }
    const send = () => { if (win && !win.isDestroyed()) win.webContents.send('tooltip:data', payload) }
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
  }

  // Tooltip прислал свой размер → ставим окно НАД вкладкой и показываем.
  function positionTooltipAndShow(w, h) {
    const win = tooltipState.win
    if (!win || win.isDestroyed() || !tooltipState.pendingShow) return
    const wa = screen.getPrimaryDisplay().workArea
    const width = Math.round(w) + 2
    const height = Math.round(h) + 2
    let x = tooltipState.anchorX
    if (x + width > wa.x + wa.width) x = wa.x + wa.width - width
    if (x < wa.x) x = wa.x
    let y = tooltipState.anchorTabTop - height - 8 // над вкладкой
    if (y < wa.y) y = wa.y
    win.setBounds({ x, y, width, height })
    if (!win.isVisible()) win.showInactive() // показываем БЕЗ кражи фокуса
  }

  function hideTooltip() {
    tooltipState.pendingShow = false
    if (tooltipState.win && !tooltipState.win.isDestroyed()) {
      safeHideTransparentWindow(tooltipState.win)
    }
  }

  return {
    pinItems, counter, dockState, tooltipState,
    savePinItems, loadPinItems, restorePin,
    ensureDockWindow, addToDock, removeFromDock, removePin,
    checkDockVisibility, findPinIdByWin,
    getShowDockEmpty, getDockCenterExpand,
    showTooltip, positionTooltipAndShow, hideTooltip,
  }
}
