// v0.2 — contextBridge: мост между main и renderer
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Renderer → Main (с ответом)
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),

  // Renderer → Main (без ответа)
  send: (channel, data) => ipcRenderer.send(channel, data),

  // Main → Renderer (подписка на события)
  on: (channel, callback) => {
    const handler = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, handler)
    // Возвращаем функцию отписки
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // Отписка вручную
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback)
  }
})
