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
  // Main → Dock: обновить категорию таба
  onUpdateCategory: (cb) => ipcRenderer.on('dock:update-category', (_e, id, cat) => cb(id, cat)),
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
  // Dock → Main: сохранить порядок табов
  saveTabOrder: (order) => ipcRenderer.send('dock:save-tab-order', order),
  // v0.71.0: Dock → Main: перейти в чат из dock
  goToChat: (id) => ipcRenderer.send('dock:go-to-chat', id),
  // v0.71.0: Dock → Main: установить категорию из dock
  setCategory: (id, cat) => ipcRenderer.send('dock:set-category', id, cat),
  // v0.71.0: Dock → Main: установить таймер из dock
  startTimer: (id, minutes) => ipcRenderer.send('dock:start-timer', id, minutes),
  // v0.71.3: Dock → Main: запросить место для контекстного меню (расширить окно вверх)
  requestCtxMenuSpace: (extraH) => ipcRenderer.send('dock:ctx-menu-space', extraH),
  // v0.71.4: УДАЛЕНО — setIgnoreMouseEvents ломает -webkit-app-region: drag (ловушка 27)
  // v0.72.0: Dock → Main: установить заметку из dock
  setNote: (id, text) => ipcRenderer.send('dock:set-note', id, text),
  // v0.72.0: Main → Dock: обновить заметку на табе
  onUpdateNote: (cb) => ipcRenderer.on('dock:update-note', (_e, id, text) => cb(id, text)),
})
