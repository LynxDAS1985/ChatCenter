// v0.87.28: preload для окна просмотра фото.
// v0.87.31: onSetSrcs — массив фото + индекс, навигация ← →
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('photo', {
  close: () => ipcRenderer.invoke('photo:close'),
  minimize: () => ipcRenderer.invoke('photo:minimize'),
  maximize: () => ipcRenderer.invoke('photo:maximize'),
  togglePin: (on) => ipcRenderer.invoke('photo:toggle-pin', { on }),
  // v0.87.31: массив srcs + index для навигации стрелками
  onSetSrcs: (cb) => ipcRenderer.on('photo:set-srcs', (_, data) => cb(data)),
})
