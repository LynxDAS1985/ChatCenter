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
  // Notification window → Main: пользователь кликнул (перейти к чату)
  click: (id) => ipcRenderer.send('notif:click', id),
  // Notification window → Main: пометить как прочитанное (скрыть без перехода)
  markRead: (id) => ipcRenderer.send('notif:mark-read', id),
  // Notification window → Main: уведомление закрыто (таймер или крестик)
  dismiss: (id) => ipcRenderer.send('notif:dismiss', id),
  // Notification window → Main: сообщить новую высоту.
  // v0.89.27: добавлен второй параметр meta с rendererPure флагом
  // (authoritative signal что у renderer ничего нет — см. ловушка #26).
  resize: (height, meta) => ipcRenderer.send('notif:resize', height, meta),
  // Notification window → Main: закрепить сообщение в отдельном окне
  pinMessage: (data) => ipcRenderer.send('notif:pin-message', data),
  // v0.89.20: diagnostic log в chatcenter.log через main process app:log IPC.
  // Используется для расследования бага «остаётся видимая полоска после dismiss».
  log: (level, message) => {
    try { ipcRenderer.send('app:log', { level, message: '[notif-renderer] ' + message }) } catch (_) {}
  },
})
