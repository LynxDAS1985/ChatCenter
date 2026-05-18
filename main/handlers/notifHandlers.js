// v0.82.4: Notification ribbon IPC handlers — вынесены из main.js
// Обработка кликов, mark-read, dismiss, resize для Messenger Ribbon
import { ipcMain, screen } from 'electron'
import { safeHideTransparentWindow } from '../utils/transparentWindowGuard.js'

export function initNotifHandlers(deps) {
  // deps передаются из main.js — мутабельные ссылки
  const { getNotifItems, setNotifItems, getNotifWin, getMainWindow } = deps

  // v0.89.26 (ловушка #25): после удаления item из notifItems[] — если список
  // ПУСТ, главный процесс ОБЯЗАН сразу скрыть окно. Иначе:
  // 1. Renderer присылает resize(0)
  // 2. Защита v0.89.23 IGNORE stale raw=0 (items=N > 0) срабатывает потому что
  //    notif:dismiss ещё не дошёл (IPC порядок не гарантирован)
  // 3. notif:dismiss приходит позже → items=0, но больше resize не будет
  // 4. Окно остаётся visible → пустая полоска
  //
  // Main process = source of truth. Не ждём renderer.
  const hideIfEmpty = () => {
    if (getNotifItems().length === 0) {
      const notifWin = getNotifWin()
      if (notifWin && !notifWin.isDestroyed()) safeHideTransparentWindow(notifWin)
    }
  }

  ipcMain.on('notif:click', (_event, id) => {
    const notifItems = getNotifItems()
    const item = notifItems.find(n => n.id === id)
    setNotifItems(notifItems.filter(n => n.id !== id))
    hideIfEmpty()
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      if (item?.messengerId) {
        mainWindow.webContents.send('notify:clicked', {
          messengerId: item.messengerId,
          senderName: item.senderName || item.title || '',
          chatTag: item.chatTag || '',
        })
      }
    }
  })

  ipcMain.on('notif:mark-read', (_event, id) => {
    const notifItems = getNotifItems()
    const item = notifItems.find(n => n.id === id)
    setNotifItems(notifItems.filter(n => n.id !== id))
    hideIfEmpty()
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed() || !item?.messengerId) return
    const payload = {
      messengerId: item.messengerId,
      senderName: item.senderName || item.title || '',
      chatTag: item.chatTag || '',
    }
    if (mainWindow.isMinimized()) {
      mainWindow.setOpacity(0)
      mainWindow.restore()
      setTimeout(() => {
        mainWindow.webContents.send('notify:mark-read', payload)
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.minimize()
            mainWindow.setOpacity(1)
          }
        }, 1200)
      }, 400)
    } else {
      mainWindow.webContents.send('notify:mark-read', payload)
    }
  })

  ipcMain.on('notif:dismiss', (_event, id) => {
    const notifItems = getNotifItems()
    setNotifItems(notifItems.filter(n => n.id !== id))
    hideIfEmpty()
  })

  let lastNotifBounds = null
  ipcMain.on('notif:resize', (_event, height) => {
    const notifWin = getNotifWin()
    if (!notifWin || notifWin.isDestroyed()) return
    const rawHeight = height
    height = Math.round(height)
    const itemsCount = getNotifItems().length
    // v0.89.20: diagnostic log — фиксируем КАЖДЫЙ resize event для расследования
    // mid-animation полоски (см. analysis в conversation 2026-05-18).
    console.log('[notif-resize] raw=' + rawHeight + ' rounded=' + height +
      ' visible=' + notifWin.isVisible() + ' items=' + itemsCount)
    // v0.89.23 (Баг #2): защита от запоздалого reportHeight(0) от dismiss
    // предыдущего уведомления — если в main process УЖЕ есть новый item
    // (items>0), но renderer прислал resize(0) (потому что setTimeout 60ms
    // в reportHeight отработал ПОСЛЕ того как renderer обработал прошлый dismiss),
    // то это stale event. Игнорируем — renderer следующим reportHeight пришлёт
    // правильное значение для нового item. См. ловушка #23.
    if (height <= 0 && itemsCount > 0) {
      console.log('[notif-resize] IGNORE stale raw=0 (items=' + itemsCount + ' > 0)')
      return
    }
    if (height <= 0) {
      // v0.89.18: safeHideTransparentWindow — без этого на Win11 остаётся
      // невидимый hit-test регион + тонкая линия (см. ловушка v0.39.0 → v0.89.18
      // в .memory-bank/mistakes/notifications-ribbon.md).
      safeHideTransparentWindow(notifWin)
      lastNotifBounds = null
      return
    }
    const { workArea } = screen.getPrimaryDisplay()
    const x = workArea.x + workArea.width - 380
    const y = workArea.y + workArea.height - height - 10
    if (lastNotifBounds && lastNotifBounds.x === x && lastNotifBounds.y === y && lastNotifBounds.h === height) {
      if (!notifWin.isVisible()) notifWin.showInactive()
      return
    }
    lastNotifBounds = { x, y, h: height }
    notifWin.setBounds({ x, y, width: 370, height })
    if (!notifWin.isVisible()) notifWin.showInactive()
  })
}
