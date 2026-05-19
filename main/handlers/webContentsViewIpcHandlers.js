// v0.89.41: IPC handlers для WebContentsView migration.
// Renderer вызывает 'wcv:*' каналы вместо прямого общения с <webview> тегом.
//
// КАНАЛЫ:
//   wcv:create     {id, url, partition, preload}    → { ok, error? }
//   wcv:set-bounds {id, x, y, width, height}        → { ok }
//   wcv:load-url   {id, url}                        → { ok, error? }
//   wcv:execute-js {id, code}                       → { ok, result?, error? }
//   wcv:send       {id, channel, args}              → { ok }
//   wcv:destroy    {id}                             → { ok }
//   wcv:list                                        → { ok, ids: [] }
//
// EVENTS из main в renderer (один канал 'wcv:event' с типизированным payload):
//   { viewId, type: 'did-finish-load' | 'dom-ready' | ... , args }

import { getWebContentsViewManager } from '../utils/webContentsViewManager.js'

/**
 * @param {object} deps
 * @param {object} deps.ipcMain
 * @param {() => object} deps.getMainWindow — возвращает BrowserWindow / BaseWindow
 * @param {(channel: string, payload: any) => void} deps.sendToRenderer
 */
export function initWebContentsViewIpcHandlers({ ipcMain, getMainWindow, sendToRenderer }) {
  if (!ipcMain?.handle) throw new Error('initWebContentsViewIpcHandlers: ipcMain.handle required')
  if (typeof getMainWindow !== 'function') throw new Error('initWebContentsViewIpcHandlers: getMainWindow required')
  if (typeof sendToRenderer !== 'function') throw new Error('initWebContentsViewIpcHandlers: sendToRenderer required')

  const manager = getWebContentsViewManager()
  const registered = []
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (_event, args) => fn(args || {}))
    registered.push(channel)
  }

  handle('wcv:create', ({ id, url, partition, preload } = {}) => {
    const parentWindow = getMainWindow()
    if (!parentWindow) return { ok: false, error: 'no main window' }
    try {
      const view = manager.createView({ id, url, partition, preload, parentWindow })
      if (!view) return { ok: false, error: 'WebContentsView API недоступен (требуется Electron v30+)' }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  })

  handle('wcv:set-bounds', ({ id, x, y, width, height } = {}) => {
    const ok = manager.setBounds(id, { x, y, width, height })
    return { ok }
  })

  handle('wcv:load-url', ({ id, url } = {}) => manager.loadURL(id, url))
  handle('wcv:execute-js', ({ id, code } = {}) => manager.executeJavaScript(id, code))
  handle('wcv:send', ({ id, channel, args } = {}) => {
    const ok = manager.sendToView(id, channel, ...(Array.isArray(args) ? args : []))
    return { ok }
  })
  handle('wcv:destroy', ({ id } = {}) => ({ ok: manager.destroyView(id) }))
  handle('wcv:list', () => ({ ok: true, ids: manager.listViews() }))
  // v0.89.43 (Совет 3): partition cleanup — освобождает дисковое пространство
  // для конкретной session('persist:foo'). opts.full=true чистит ВСЁ включая
  // cookies/localstorage (logout). По умолчанию только cache + индексы.
  handle('wcv:cleanup-partition', ({ partition, full } = {}) =>
    manager.cleanupPartition(partition, { full: !!full }))

  // Subscribe to manager events → forward to renderer как 'wcv:event'.
  const eventTypes = [
    'did-finish-load', 'dom-ready', 'did-fail-load',
    'did-navigate-in-page', 'did-frame-finish-load',
    'did-start-loading', 'did-stop-loading',
    'render-process-gone', 'unresponsive',
    'page-title-updated', 'console-message',
    'ipc-message',
  ]
  const eventHandlers = []
  for (const type of eventTypes) {
    const handler = (payload) => {
      try {
        // Не сериализуем сам Electron event объект — берём только args.
        sendToRenderer('wcv:event', { viewId: payload.viewId, type, args: payload.args, channel: payload.channel })
      } catch (_) {}
    }
    manager.on(type, handler)
    eventHandlers.push({ type, handler })
  }

  return function unregister() {
    for (const channel of registered) {
      try { ipcMain.removeHandler?.(channel) } catch (_) {}
    }
    for (const { type, handler } of eventHandlers) {
      try { manager.off(type, handler) } catch (_) {}
    }
  }
}
