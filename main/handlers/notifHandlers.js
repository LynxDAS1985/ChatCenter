// v0.82.4: Notification ribbon IPC handlers — вынесены из main.js
// Обработка кликов, mark-read, dismiss, resize для Messenger Ribbon
import { ipcMain, screen } from 'electron'
import { safeHideTransparentWindow } from '../utils/transparentWindowGuard.js'

const NOTIF_WINDOW_WIDTH = 370
const NOTIF_RIGHT_OFFSET = 380
const NOTIF_SCREEN_MARGIN = 10
const NOTIF_MIN_HEIGHT = 90

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
          // v0.96.0 (Phase 0 M0.4): source — полный NotificationSource паспорт.
          // App.jsx читает source.accountId/chatId/messageId напрямую.
          source: item.source || null,
          // v0.95.46 legacy: chatTag/messageId оставлены для backward compat
          // (если source отсутствует — App.jsx fallback на парсинг chatTag).
          chatTag: item.chatTag || '',
          messageId: item.messageId || null,
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

  // v0.99.0 (Phase 3 M3.1): запуск AI-агента из уведомления.
  // Юзер кликнул «🤖 AI» в notification ribbon → закрываем уведомление,
  // показываем главное окно + AI sidebar, отправляем event с source паспортом.
  // Главное окно ловит ai:agent:invoke-from-notify → запускает agent loop через
  // useAIAgent hook (renderer-side в AISidebar Phase 3 M3.5).
  ipcMain.on('notif:ai-process', (_event, id) => {
    const notifItems = getNotifItems()
    const item = notifItems.find(n => n.id === id)
    setNotifItems(notifItems.filter(n => n.id !== id))
    hideIfEmpty()
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed() || !item?.source) return
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('ai:agent:invoke-from-notify', {
      source: item.source,
      title: item.title,
      senderName: item.senderName || item.title || '',
    })
  })

  ipcMain.on('notif:dismiss', (_event, id) => {
    const notifItems = getNotifItems()
    setNotifItems(notifItems.filter(n => n.id !== id))
    hideIfEmpty()
  })

  let lastNotifBounds = null
  ipcMain.on('notif:resize', (_event, height, meta) => {
    const notifWin = getNotifWin()
    if (!notifWin || notifWin.isDestroyed()) return
    const rawHeight = height
    height = Math.round(height)
    const itemsCount = getNotifItems().length
    const rendererPure = !!meta?.rendererPure
    console.log('[notif-resize] raw=' + rawHeight + ' rounded=' + height +
      ' visible=' + notifWin.isVisible() + ' items=' + itemsCount + ' rendererPure=' + rendererPure)
    // v0.89.27 (ловушка #26): renderer = source of truth для terminal state.
    // Если renderer прислал rendererPure=true (items.size=0 + container.children=0)
    // — это АВТОРИТАТИВНЫЙ сигнал что у него вообще ничего нет. Очищаем main
    // notifItems[] от мусора (ghost-stacking накопление, FIFO не отправлял
    // dismiss IPC и т.п.) и гарантированно скрываем окно.
    if (height <= 0 && rendererPure) {
      if (itemsCount > 0) {
        console.log('[notif-resize] CLEAR main notifItems (had ' + itemsCount + ' stale items, renderer pure)')
        setNotifItems([])
      }
      safeHideTransparentWindow(notifWin)
      lastNotifBounds = null
      return
    }
    // v0.89.23: защита от запоздалого reportHeight(0) от dismiss предыдущего
    // уведомления — если main УЖЕ имеет new item но renderer ещё не отрендерил.
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
    const maxHeight = Math.max(NOTIF_MIN_HEIGHT, workArea.height - NOTIF_SCREEN_MARGIN * 2)
    const displayHeight = Math.min(height, maxHeight)
    const x = workArea.x + workArea.width - NOTIF_RIGHT_OFFSET
    const y = Math.max(
      workArea.y + NOTIF_SCREEN_MARGIN,
      workArea.y + workArea.height - displayHeight - NOTIF_SCREEN_MARGIN
    )
    if (displayHeight !== height) {
      console.log('[notif-resize] CLAMP rawHeight=' + height + ' displayHeight=' + displayHeight + ' workAreaH=' + workArea.height)
    }
    if (lastNotifBounds && lastNotifBounds.x === x && lastNotifBounds.y === y && lastNotifBounds.h === displayHeight) {
      if (!notifWin.isVisible()) notifWin.showInactive()
      return
    }
    lastNotifBounds = { x, y, h: displayHeight }
    notifWin.setBounds({ x, y, width: NOTIF_WINDOW_WIDTH, height: displayHeight })
    if (!notifWin.isVisible()) notifWin.showInactive()
  })
}
