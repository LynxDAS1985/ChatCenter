// v0.87.34: preload для окна проигрывания видео.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('video', {
  close: () => ipcRenderer.invoke('video:close'),
  minimize: () => ipcRenderer.invoke('video:minimize'),
  maximize: () => ipcRenderer.invoke('video:maximize'),
  togglePin: (on) => ipcRenderer.invoke('video:toggle-pin', { on }),
  togglePip: (on) => ipcRenderer.invoke('video:toggle-pip', { on }),
  onSetSrc: (cb) => ipcRenderer.on('video:set-src', (_, data) => cb(data)),
  // v0.89.8: открыть видео во внешнем плеере (VLC/Movies&TV) для codec'ов
  // не поддерживаемых Chromium (HEVC/AV1 без HW-ускорения). Принимает cc-media://
  // URL — main process конвертирует в OS path и зовёт shell.openPath.
  openExternal: (ccMediaUrl) => ipcRenderer.invoke('video:open-external', { url: ccMediaUrl }),
})
