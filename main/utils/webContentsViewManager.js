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
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// v0.89.46: WebContentsView требует АБСОЛЮТНЫЙ ПУТЬ к preload (по Electron docs:
// «The value should be the absolute file path to the script»). Старый <webview>
// тег принимает file:// URL, поэтому monitorPreloadUrl формируется именно так
// в useAppBootstrap.js. Здесь нормализуем обратно в путь.
// Также handle путей с пробелами и unicode-символами (например 'C:\Users\Директор\...').
export function normalizePreloadPath(preload) {
  if (!preload) return preload
  if (!/^file:\/\//i.test(preload)) return preload
  try { return fileURLToPath(preload) }
  catch (_) { return decodeURI(preload.replace(/^file:\/\/\/?/i, '')) }
}

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

    // v0.89.54: sandbox:false → true. По Electron Security Guidelines:
    // sandbox:false осмысленно только когда preload требует Node APIs;
    // с preload={undefined} (v0.89.53) — нужен sandbox:true как safe default.
    const webPreferences = {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // v0.89.35 — гарантия работы CSS animations в hidden state
    }
    if (partition) webPreferences.partition = partition
    // v0.89.51: проверяем что preload файл существует. Если передан невалидный
    // путь — `new WebContentsView` может крашнуть main process нативно (без JS
    // exception). Это могло быть причиной молчаливого закрытия программы в
    // v0.89.46-v0.89.50: invoke wcv:create уходил, но [wcv-timing] никогда не
    // приходил — main падал на `new WebContentsView`.
    if (preload) {
      const preloadPath = normalizePreloadPath(preload)
      console.log(`[wcv-mgr] createView id=${id} preload=${preloadPath} partition=${partition || '(none)'}`)
      if (!fs.existsSync(preloadPath)) {
        console.error(`[wcv-mgr] preload file NOT FOUND: ${preloadPath} — пропускаем preload`)
        // НЕ передаём preload — лучше создать view без него, чем убить main.
      } else {
        webPreferences.preload = preloadPath
      }
    } else {
      console.log(`[wcv-mgr] createView id=${id} preload=(none) partition=${partition || '(none)'}`)
    }

    console.log(`[wcv-mgr] new WebContentsView starting...`)
    let view
    try {
      view = new WebContentsView({ webPreferences })
    } catch (e) {
      console.error(`[wcv-mgr] new WebContentsView FAILED: ${e?.message || e}`)
      return null
    }
    console.log(`[wcv-mgr] new WebContentsView ok`)
    const wc = view.webContents

    // v0.89.52: вместо forwarding каждого события — обёрнем в try и логируем
    // ровно те, что свалились (если такое случится).
    console.log(`[wcv-mgr] forwarding events...`)
    try {
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
      wc.on('ipc-message', (event, channel, ...args) => {
        try { this.emit('ipc-message', { viewId: id, channel, args }) } catch (_) {}
      })
    } catch (e) {
      console.error(`[wcv-mgr] forwarding events FAILED: ${e?.message || e}`)
    }
    console.log(`[wcv-mgr] events forwarded`)

    // v0.89.52: BrowserWindow.contentView — это primary view (HTML рендерер),
    // добавление дочернего view через addChildView возможно с Electron v30+.
    // Если main крашится на этом шаге — самое вероятное место бага.
    console.log(`[wcv-mgr] adding to parent contentView (type=${parentWindow.contentView ? 'present' : 'missing'})...`)
    try {
      parentWindow.contentView.addChildView(view)
      console.log(`[wcv-mgr] addChildView ok`)
    } catch (e) {
      console.error(`[wcv-mgr] addChildView FAILED: ${e?.message || e}`)
    }

    this.views.set(id, { view, parentWindow, bounds: { x: 0, y: 0, width: 0, height: 0 } })

    if (url) {
      // v0.89.54: about:blank-первый — изолирует «корень в URL» vs «в config».
      console.log(`[wcv-mgr] step 1: loadURL about:blank (isolation test)`)
      try {
        view.webContents.loadURL('about:blank')
          .then(() => {
            console.log(`[wcv-mgr] about:blank settled id=${id} — loading real URL`)
            view.webContents.loadURL(url)
              .then(() => console.log(`[wcv-mgr] real URL settled id=${id}`))
              .catch((e) => console.error(`[wcv-mgr] real URL failed id=${id}: ${e?.message || e}`))
          })
          .catch((e) => console.error(`[wcv-mgr] about:blank failed id=${id}: ${e?.message || e}`))
      } catch (e) {
        console.error(`[wcv-mgr] loadURL sync exception id=${id}: ${e?.message || e}`)
      }
    }
    console.log(`[wcv-mgr] createView return view id=${id}`)
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

  /**
   * v0.89.43 (Совет 3): cleanup для конкретной partition session.
   * Очищает cache + storage + cookies для session('persist:foo') чтобы
   * предотвратить бесконтрольный рост дискового пространства.
   *
   * НЕ удаляет авторизацию (через clearStorageData без 'localstorage' / 'cookies'
   * по умолчанию — только cache и indexeddb). При полном logout юзер сам
   * может вызвать с opts.full=true.
   *
   * @param {string} partition — 'persist:foo' или 'foo'
   * @param {Object} [opts] — { full: boolean — очистить всё включая cookies/localstorage }
   * @returns {Promise<{ok: boolean, sizeBefore?: number, sizeAfter?: number, error?: string}>}
   */
  async cleanupPartition(partition, opts = {}) {
    if (!partition) return { ok: false, error: 'partition required' }
    try {
      const electron = require('electron')
      const ses = electron.session.fromPartition(partition)
      const sizeBefore = await ses.getCacheSize().catch(() => 0)
      // По дефолту чистим только cache + индексы хранилища, не трогая cookies/localstorage
      const storages = opts.full
        ? ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        : ['appcache', 'filesystem', 'indexdb', 'shadercache', 'cachestorage']
      await ses.clearCache()
      await ses.clearStorageData({ storages })
      const sizeAfter = await ses.getCacheSize().catch(() => 0)
      return { ok: true, sizeBefore, sizeAfter }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
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
