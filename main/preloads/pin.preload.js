// pin.preload.js — preload для окна закреплённого сообщения (Pin Window)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pinApi', {
  // Main → Pin window: данные сообщения
  onData: (callback) => {
    ipcRenderer.on('pin:data', (_event, data) => callback(data))
  },
  // Pin window → Main: открепить (закрыть окно)
  unpin: () => ipcRenderer.send('pin:unpin'),
  // Pin window → Main: сообщить высоту для resize
  resize: (height) => ipcRenderer.send('pin:resize', height),
})
