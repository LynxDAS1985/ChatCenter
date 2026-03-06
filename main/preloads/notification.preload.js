// notification.preload.js — preload для окна кастомных уведомлений (Messenger Ribbon)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('notifApi', {
  // Main → Notification window: новое уведомление
  onNotification: (callback) => {
    ipcRenderer.on('notif:show', (_event, data) => callback(data))
  },
  // Main → Notification window: убрать конкретное уведомление
  onDismiss: (callback) => {
    ipcRenderer.on('notif:remove', (_event, id) => callback(id))
  },
  // Notification window → Main: пользователь кликнул
  click: (id) => ipcRenderer.send('notif:click', id),
  // Notification window → Main: уведомление закрыто (таймер или крестик)
  dismiss: (id) => ipcRenderer.send('notif:dismiss', id),
  // Notification window → Main: сообщить новую высоту
  resize: (height) => ipcRenderer.send('notif:resize', height),
})
