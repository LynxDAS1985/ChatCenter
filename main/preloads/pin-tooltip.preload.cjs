// pin-tooltip.preload.js — preload окна-подсказки задачи (v1.2.70).
// Отдельное лёгкое окно над доком; создаётся один раз и переиспользуется.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tooltipApi', {
  // Main → Tooltip: данные задачи для показа
  onData: (cb) => ipcRenderer.on('tooltip:data', (_e, d) => cb(d)),
  // Tooltip → Main: фактический размер карточки (main спозиционирует и покажет)
  resize: (w, h) => ipcRenderer.send('tooltip:resize', w, h),
})
