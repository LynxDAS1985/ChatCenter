// pin-dock.preload.js — preload для окна зоны задач (Pin Dock)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dockApi', {
  // Main → Dock: добавить таб
  onAddItem: (cb) => ipcRenderer.on('dock:add', (_e, data) => cb(data)),
  // Main → Dock: удалить таб
  onRemoveItem: (cb) => ipcRenderer.on('dock:remove', (_e, id) => cb(id)),
  // Main → Dock: обновить таймер на табе
  onUpdateTimer: (cb) => ipcRenderer.on('dock:update-timer', (_e, id, text) => cb(id, text)),
  // Main → Dock: таймер истёк — мигать
  onTimerAlert: (cb) => ipcRenderer.on('dock:timer-alert', (_e, id) => cb(id)),
  // Dock → Main: показать pin-окно
  showPin: (id) => ipcRenderer.send('dock:show-pin', id),
  // Dock → Main: открепить полностью
  unpinFromDock: (id) => ipcRenderer.send('dock:unpin', id),
  // Dock → Main: сообщить высоту
  resize: (h) => ipcRenderer.send('dock:resize', h),
})
