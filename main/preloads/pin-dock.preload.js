// pin-dock.preload.js — preload для окна зоны задач (Pin Dock)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dockApi', {
  // Main → Dock: добавить таб
  onAddItem: (cb) => ipcRenderer.on('dock:add', (_e, data) => cb(data)),
  // Main → Dock: удалить таб
  onRemoveItem: (cb) => ipcRenderer.on('dock:remove', (_e, id) => cb(id)),
  // Main → Dock: обновить таймер на табе
  onUpdateTimer: (cb) => ipcRenderer.on('dock:update-timer', (_e, id, timerEnd) => cb(id, timerEnd)),
  // Main → Dock: таймер истёк — мигать
  onTimerAlert: (cb) => ipcRenderer.on('dock:timer-alert', (_e, id) => cb(id)),
  // Main → Dock: показать/скрыть empty label
  onShowEmpty: (cb) => ipcRenderer.on('dock:show-empty', (_e, show) => cb(show)),
  // Dock → Main: показать pin-окно
  showPin: (id) => ipcRenderer.send('dock:show-pin', id),
  // Dock → Main: открепить полностью
  unpinFromDock: (id) => ipcRenderer.send('dock:unpin', id),
  // Dock → Main: сообщить размер (ширину + высоту)
  resize: (w, h) => ipcRenderer.send('dock:resize', w, h),
  // Dock → Main: закрыть/скрыть dock
  closeDock: () => ipcRenderer.send('dock:close'),
  // Dock → Main: запросить место для превью тултипа
  requestPreviewSpace: (extraH) => ipcRenderer.send('dock:preview-space', extraH),
})
