// v0.82.4: Notification ribbon IPC handlers — вынесены из main.js
// Обработка кликов, mark-read, dismiss, resize для Messenger Ribbon
import { ipcMain, screen } from 'electron'

export function initNotifHandlers(deps) {
  // deps передаются из main.js — мутабельные ссылки
  const { getNotifItems, setNotifItems, getNotifWin, getMainWindow } = deps

  ipcMain.on('notif:click', (_event, id) => {
    const notifItems = getNotifItems()
    const item = notifItems.find(n => n.id === id)
    setNotifItems(notifItems.filter(n => n.id !== id))
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
  })

  let lastNotifBounds = null
  ipcMain.on('notif:resize', (_event, height) => {
    const notifWin = getNotifWin()
    if (!notifWin || notifWin.isDestroyed()) return
    height = Math.round(height)
    if (height <= 0) {
      notifWin.hide()
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
