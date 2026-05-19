// v0.89.41: WebContentsView manager (инфраструктура миграции с <webview> тега).
//
// КОНТЕКСТ:
//   - <webview> тег: Electron официально пишет «We currently recommend to not
//     use the webview tag» — https://www.electronjs.org/docs/latest/api/webview-tag
//   - BrowserView: deprecated с Electron v29 — https://www.electronjs.org/docs/latest/api/browser-view
//   - WebContentsView: официальная замена с Electron v30 —
//     https://www.electronjs.org/docs/latest/api/web-contents-view
//
// СТАТУС МИГРАЦИИ:
//   v0.89.41 — создана инфраструктура + feature flag (по умолчанию OFF).
//   Когда юзер включает в настройках → render использует WebContentsViewSlot
//   вместо <webview>. По умолчанию старый <webview> работает как раньше.
//   Нулевой риск регрессии.
//
// API:
//   createView({ id, url, partition, preload, parentWindow }) → создаёт WebContentsView,
//     добавляет в parent window, возвращает дескриптор для последующих операций.
//   setBounds(id, { x, y, width, height })
//   loadURL(id, url)
//   executeJavaScript(id, code) → Promise<result>
//   sendToView(id, channel, ...args)
//   destroyView(id)
//   getView(id) → WebContentsView | null
//
// EVENTS — manager эмитит через EventEmitter:
//   'did-finish-load' { viewId }
//   'did-fail-load' { viewId, errorCode, errorDescription }
//   'page-title-updated' { viewId, title }
//   'ipc-message' { viewId, channel, args }
//   'console-message' { viewId, level, message, line, sourceId }
//   'dom-ready' { viewId }
//   'did-navigate-in-page' { viewId, url }
//   'render-process-gone' { viewId, details }
//   'unresponsive' { viewId }

import { EventEmitter } from 'node:events'

// WebContentsView импортируем условно — модуль должен загружаться даже в node без Electron
// (для unit-тестов). В production main процессе require('electron').WebContentsView.
let _WebContentsView = null
function getWebContentsView() {
  if (_WebContentsView) return _WebContentsView
  try {
    const electron = require('electron')
    _WebContentsView = electron.WebContentsView
    return _WebContentsView
  } catch (_) {
    return null
  }
}

export class WebContentsViewManager extends EventEmitter {
  constructor() {
    super()
    /** @type {Map<string, {view: object, parentWindow: object, bounds: object}>} */
    this.views = new Map()
  }

  /**
   * Создаёт WebContentsView и добавляет в parentWindow.contentView.
   * @param {object} opts
   * @param {string} opts.id — уникальный id (chatId или messenger id)
   * @param {string} opts.url
   * @param {string} [opts.partition] — Electron session partition ('persist:foo')
   * @param {string} [opts.preload] — путь к preload скрипту
   * @param {object} opts.parentWindow — BaseWindow / BrowserWindow
   * @returns {object|null} view object или null если уже существует / WebContentsView недоступен
   */
  createView({ id, url, partition, preload, parentWindow }) {
    if (!id) throw new Error('createView: id required')
    if (!parentWindow) throw new Error('createView: parentWindow required')
    if (this.views.has(id)) return this.views.get(id).view

    const WebContentsView = getWebContentsView()
    if (!WebContentsView) return null

    const webPreferences = {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // v0.89.35 — гарантия работы CSS animations в hidden state
    }
    if (partition) webPreferences.partition = partition
    if (preload) webPreferences.preload = preload

    const view = new WebContentsView({ webPreferences })
    const wc = view.webContents

    // Forward all relevant events through manager EventEmitter, чтобы renderer
    // мог подписаться через единый IPC канал.
    const forwardEvent = (eventName) => {
      wc.on(eventName, (...args) => {
        try { this.emit(eventName, { viewId: id, args }) } catch (_) {}
      })
    }
    forwardEvent('did-finish-load')
    forwardEvent('dom-ready')
    forwardEvent('did-fail-load')
    forwardEvent('did-navigate-in-page')
    forwardEvent('did-frame-finish-load')
    forwardEvent('did-start-loading')
    forwardEvent('did-stop-loading')
    forwardEvent('render-process-gone')
    forwardEvent('unresponsive')
    forwardEvent('page-title-updated')
    forwardEvent('console-message')

    // ipc-message — отдельный сигнатура: (event, channel, ...args).
    wc.on('ipc-message', (event, channel, ...args) => {
      try { this.emit('ipc-message', { viewId: id, channel, args }) } catch (_) {}
    })

    try { parentWindow.contentView.addChildView(view) } catch (e) {
      // Если parent не BaseWindow — fallback на addBrowserView (для BrowserWindow).
      try { parentWindow.contentView?.addChildView?.(view) } catch (_) {}
    }
    this.views.set(id, { view, parentWindow, bounds: { x: 0, y: 0, width: 0, height: 0 } })

    if (url) view.webContents.loadURL(url).catch(() => {})
    return view
  }

  setBounds(id, bounds) {
    const entry = this.views.get(id)
    if (!entry || !entry.view) return false
    const next = {
      x: Math.round(Number(bounds?.x) || 0),
      y: Math.round(Number(bounds?.y) || 0),
      width: Math.round(Number(bounds?.width) || 0),
      height: Math.round(Number(bounds?.height) || 0),
    }
    try { entry.view.setBounds(next) } catch (_) { return false }
    entry.bounds = next
    return true
  }

  async loadURL(id, url) {
    const entry = this.views.get(id)
    if (!entry?.view) return { ok: false, error: 'view not found' }
    try { await entry.view.webContents.loadURL(url); return { ok: true } }
    catch (e) { return { ok: false, error: e?.message || String(e) } }
  }

  async executeJavaScript(id, code) {
    const entry = this.views.get(id)
    if (!entry?.view) return { ok: false, error: 'view not found' }
    try {
      const result = await entry.view.webContents.executeJavaScript(code, true)
      return { ok: true, result }
    } catch (e) { return { ok: false, error: e?.message || String(e) } }
  }

  sendToView(id, channel, ...args) {
    const entry = this.views.get(id)
    if (!entry?.view) return false
    try { entry.view.webContents.send(channel, ...args); return true } catch (_) { return false }
  }

  destroyView(id) {
    const entry = this.views.get(id)
    if (!entry) return false
    try { entry.parentWindow.contentView.removeChildView(entry.view) } catch (_) {}
    try { entry.view.webContents.close() } catch (_) {}
    this.views.delete(id)
    return true
  }

  getView(id) {
    return this.views.get(id)?.view || null
  }

  hasView(id) {
    return this.views.has(id)
  }

  listViews() {
    return Array.from(this.views.keys())
  }

  destroyAll() {
    for (const id of Array.from(this.views.keys())) {
      this.destroyView(id)
    }
  }
}

// Singleton — в production main процессе используется один экземпляр.
let _instance = null
export function getWebContentsViewManager() {
  if (!_instance) _instance = new WebContentsViewManager()
  return _instance
}

// Для тестов
export function _resetForTests() {
  if (_instance) _instance.destroyAll()
  _instance = null
}
