// v0.87.34: preload для окна проигрывания видео.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('video', {
  close: () => ipcRenderer.invoke('video:close'),
  minimize: () => ipcRenderer.invoke('video:minimize'),
  maximize: () => ipcRenderer.invoke('video:maximize'),
  togglePin: (on) => ipcRenderer.invoke('video:toggle-pin', { on }),
  onSetSrc: (cb) => ipcRenderer.on('video:set-src', (_, data) => cb(data)),
})
