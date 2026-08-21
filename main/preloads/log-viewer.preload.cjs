// v0.89.38: preload для log-viewer BrowserWindow.
// Раньше log-viewer открывался с nodeIntegration: true + contextIsolation: false
// и main process через executeJavaScript('window.__logContent = ...; loadLog()')
// инжектировал содержимое — это нарушение Electron Security Guidelines:
//   - "Don't enable nodeIntegration in renderer process" (Security Checklist #2)
//   - "Don't disable contextIsolation" (Security Checklist #3)
//   Документация: https://www.electronjs.org/docs/latest/tutorial/security
//
// Теперь log-viewer работает с contextIsolation: true + nodeIntegration: false.
// Безопасный мост:
//   window.logViewer.onContent(cb) — подписка на обновления лога (auto refresh)
//   window.logViewer.clearLog()    — очистить лог
//   window.logViewer.readLog()     — v1.2.318: разово запросить лог (pull), не ждать push
//   window.logViewer.openFolder()  — v1.2.318: открыть Проводник с файлом chatcenter.log

const { contextBridge, ipcRenderer } = require('electron')

const subscribers = new Set()

ipcRenderer.on('log-viewer:content', (_e, content) => {
  for (const cb of subscribers) {
    try { cb(content) } catch (_) {}
  }
})

contextBridge.exposeInMainWorld('logViewer', {
  onContent(cb) {
    if (typeof cb !== 'function') return () => {}
    subscribers.add(cb)
    return () => subscribers.delete(cb)
  },
  clearLog() {
    return ipcRenderer.invoke('app:clear-log')
  },
  // v1.2.318: разовый запрос лога при открытии окна (страховка, если push задержался).
  readLog() {
    return ipcRenderer.invoke('app:read-log')
  },
  // v1.2.318: открыть системный Проводник с выделенным файлом chatcenter.log.
  openFolder() {
    return ipcRenderer.invoke('app:open-logs-folder')
  },
})
