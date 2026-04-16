// v0.87.28: preload для окна просмотра фото.
// Экспортирует window.photo API для renderer-скрипта photo-viewer.html.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('photo', {
  close: () => ipcRenderer.invoke('photo:close'),
  minimize: () => ipcRenderer.invoke('photo:minimize'),
  maximize: () => ipcRenderer.invoke('photo:maximize'),
  togglePin: (on) => ipcRenderer.invoke('photo:toggle-pin', { on }),
  onSetSrc: (cb) => ipcRenderer.on('photo:set-src', (_, data) => cb(data)),
})
