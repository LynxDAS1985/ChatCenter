// notification.preload.js — preload для окна кастомных уведомлений (Messenger Ribbon)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('notifApi', {
  // Main → Notification window: новое уведомление
  onNotification: (callback) => {
    ipcRenderer.on('notif:show', (_event, data) => callback(data))
  },
  onUpdateIcon: (callback) => {
    ipcRenderer.on('notif:update-icon', (_event, data) => callback(data))
  },
  // Main → Notification window: убрать конкретное уведомление
  onDismiss: (callback) => {
    ipcRenderer.on('notif:remove', (_event, id) => callback(id))
  },
  // Notification window → Main: пользователь кликнул (перейти к чату)
  click: (id) => ipcRenderer.send('notif:click', id),
  // Notification window → Main: пометить как прочитанное (скрыть без перехода)
  markRead: (id) => ipcRenderer.send('notif:mark-read', id),
  // v0.99.0 (Phase 3 M3.1): Notification window → Main: запустить AI-агента для этого сообщения
  aiProcess: (id) => ipcRenderer.send('notif:ai-process', id),
  // Notification window → Main: уведомление закрыто (таймер или крестик)
  dismiss: (id) => ipcRenderer.send('notif:dismiss', id),
  // Notification window → Main: сообщить новую высоту.
  // v0.89.27: добавлен второй параметр meta с rendererPure флагом
  // (authoritative signal что у renderer ничего нет — см. ловушка #26).
  resize: (height, meta) => ipcRenderer.send('notif:resize', height, meta),
  // v1.2.126: Main → Notification window: «переотчитайся о размере» (heartbeat сторожа).
  onRemeasure: (callback) => { ipcRenderer.on('notif:remeasure', () => callback()) },
  // Notification window → Main: закрепить сообщение в отдельном окне
  pinMessage: (data) => ipcRenderer.send('notif:pin-message', data),
  // v1.2.65: Notification window → Main: открыть фото альбома в смотрелке.
  // data: { chatId, messageIds:[...], index }. Main пересылает главному окну,
  // оно качает полноразмеры и зовёт существующий photo:open.
  openPhoto: (data) => ipcRenderer.send('notif:open-photo', data),
  // v1.2.101: Notification window → Main: открыть ВИДЕО в видео-плеере (как в чате).
  // data: { chatId, messageId }. Main пересылает главному окну → tg:download-video → video:open.
  openVideo: (data) => ipcRenderer.send('notif:open-video', data),
  // v1.2.74 (A1): Main → Notification window: чёткое превью плитки альбома догрузилось.
  // data: { albumId, messageId, src }. Окно заменяет мутную плитку на чёткую.
  onAlbumThumb: (callback) => { ipcRenderer.on('notif:album-thumb', (_event, data) => callback(data)) },
  // v0.89.20: diagnostic log в chatcenter.log через main process app:log IPC.
  // Используется для расследования бага «остаётся видимая полоска после dismiss».
  log: (level, message) => {
    try { ipcRenderer.send('app:log', { level, message: '[notif-renderer] ' + message }) } catch (_) {}
  },
})

// v1.2.104: главное окно сообщило, что видео открылось (или не удалось) → снять крутилку
// с плитки этого сообщения. Работает с DOM напрямую (preload имеет доступ к document),
// поэтому notification.js трогать не нужно (он на лимите размера).
ipcRenderer.on('notif:video-done', (_event, data) => {
  try {
    const mid = data && data.messageId != null ? String(data.messageId) : null
    const tile = mid && document.querySelector('.album-tile[data-mid="' + mid + '"]')
    if (tile) tile.classList.remove('loading')
  } catch (_) {}
})
