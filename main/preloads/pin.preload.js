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
  // v0.66.0: Pin window → Main: свернуть в dock
  minimizeToDock: () => ipcRenderer.send('pin:minimize-to-dock'),
  // v0.66.0: Pin window → Main: запустить таймер (минуты)
  startTimer: (minutes) => ipcRenderer.send('pin:start-timer', minutes),
  // v0.66.0: Pin window → Main: отменить таймер
  cancelTimer: () => ipcRenderer.send('pin:cancel-timer'),
  // v0.66.0: Main → Pin window: таймер запущен (timerEnd timestamp)
  onTimerStarted: (cb) => ipcRenderer.on('pin:timer-started', (_e, timerEnd) => cb(timerEnd)),
  // v0.66.0: Main → Pin window: таймер истёк
  onTimerAlert: (cb) => ipcRenderer.on('pin:timer-alert', (_e) => cb()),
  // v0.69.0: Pin window → Main: перейти в чат мессенджера
  goToChat: (messengerId) => ipcRenderer.send('pin:go-to-chat', messengerId),
  // v0.70.0: Pin window → Main: установить категорию
  setCategory: (category) => ipcRenderer.send('pin:set-category', category),
  // v0.71.0: Main → Pin window: категория обновлена из dock
  onCategoryUpdated: (cb) => ipcRenderer.on('pin:category-updated', (_e, cat) => cb(cat)),
})
