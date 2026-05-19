// v0.89.43 (Совет 1 — минимум): bridge между webviewSetup.js и WebContentsViewSlot.
//
// КОНЦЕПЦИЯ: webviewSetup.js ожидает на вход webview-element с интерфейсом:
//   - el.executeJavaScript(code)
//   - el.send(channel, ...args)
//   - el.addEventListener(event, handler)
//   - el.removeEventListener(event, handler)
//   - el._chatcenterListeners (Array)
//
// Этот bridge создаёт ПРОКСИ-объект с тем же интерфейсом, но проксирует все
// вызовы через wcv:* IPC + window.api.on('wcv:event', ...). Это позволяет
// использовать существующий webviewSetup БЕЗ переписки 400+ строк.
//
// Когда вызывать: в App.jsx setWebviewRef для пилота на WebContentsViewSlot
// (при settings.useWebContentsView=true) — создавать bridge через
// createWebContentsViewBridge(viewId) и передавать его как fake webview-ref.
//
// СТАТУС: experimental — не подключено к App.jsx по умолчанию.
// Будет активировано в Phase 2.3 (full) после тестирования.

/**
 * Создаёт proxy-объект эмулирующий интерфейс <webview> элемента, но
 * проксирующий все операции через wcv:* IPC на WebContentsView в main процессе.
 *
 * @param {string} viewId — id WebContentsView (=messenger.id)
 * @returns {object} proxy с методами executeJavaScript/send/addEventListener/removeEventListener
 */
export function createWebContentsViewBridge(viewId) {
  if (!viewId) throw new Error('createWebContentsViewBridge: viewId required')

  // listeners — Map<eventName, Set<handler>>. webviewSetup может подписываться
  // на did-finish-load, dom-ready, ipc-message, console-message и т.д.
  const listeners = new Map()
  let detachWcvEvent = null

  // Подписываемся на ОДИН канал wcv:event и маршрутизируем по type на нужные listeners.
  function ensureWcvEventSubscription() {
    if (detachWcvEvent || !window.api?.on) return
    detachWcvEvent = window.api.on('wcv:event', (payload) => {
      if (!payload || payload.viewId !== viewId) return
      const handlers = listeners.get(payload.type)
      if (!handlers || handlers.size === 0) return
      // Эмулируем event объект как у <webview> — для большинства handlers это
      // объект с args[] (для ipc-message — channel + args).
      const fakeEvent = payload.type === 'ipc-message'
        ? { channel: payload.channel, args: payload.args || [] }
        : { args: payload.args || [] }
      // Для page-title-updated webview event.title — берём args[1]
      if (payload.type === 'page-title-updated' && Array.isArray(payload.args)) {
        fakeEvent.title = payload.args[1]
      }
      // Для did-fail-load — errorCode, errorDescription, validatedURL
      if (payload.type === 'did-fail-load' && Array.isArray(payload.args)) {
        fakeEvent.errorCode = payload.args[1]
        fakeEvent.errorDescription = payload.args[2]
        fakeEvent.validatedURL = payload.args[3]
      }
      // Для did-navigate-in-page — url
      if (payload.type === 'did-navigate-in-page' && Array.isArray(payload.args)) {
        fakeEvent.url = payload.args[1]
      }
      // Для console-message — level, message, line, sourceId
      if (payload.type === 'console-message' && Array.isArray(payload.args)) {
        fakeEvent.level = payload.args[1]
        fakeEvent.message = payload.args[2]
        fakeEvent.line = payload.args[3]
        fakeEvent.sourceId = payload.args[4]
      }
      for (const handler of handlers) {
        try { handler(fakeEvent) } catch (_) {}
      }
    })
  }

  return {
    // _chatcenterListeners — webviewSetup создаёт этот массив и пушит туда
    // [event, handler] пары. Мы поддерживаем тот же контракт.
    _chatcenterListeners: [],

    /**
     * Эмуляция webview.executeJavaScript() через IPC.
     * @returns {Promise<any>}
     */
    async executeJavaScript(code, _userGesture) {
      const r = await window.api?.invoke('wcv:execute-js', { id: viewId, code })
      if (!r?.ok) throw new Error(r?.error || 'executeJavaScript failed')
      return r.result
    },

    /**
     * Эмуляция webview.send() через IPC.
     */
    send(channel, ...args) {
      return window.api?.invoke('wcv:send', { id: viewId, channel, args })
        .catch(() => {})
    },

    /**
     * Эмуляция webview.addEventListener(event, handler).
     */
    addEventListener(eventName, handler) {
      if (typeof handler !== 'function') return
      let set = listeners.get(eventName)
      if (!set) { set = new Set(); listeners.set(eventName, set) }
      set.add(handler)
      ensureWcvEventSubscription()
    },

    /**
     * Эмуляция webview.removeEventListener(event, handler).
     */
    removeEventListener(eventName, handler) {
      const set = listeners.get(eventName)
      if (!set) return
      set.delete(handler)
      if (set.size === 0) listeners.delete(eventName)
    },

    /**
     * Cleanup всех подписок. Вызывать когда WebContentsView уничтожается.
     */
    _bridgeCleanup() {
      listeners.clear()
      if (detachWcvEvent) {
        try { detachWcvEvent() } catch (_) {}
        detachWcvEvent = null
      }
    },

    // Маркер для отладки и регрессионных тестов
    _isWebContentsViewBridge: true,
    _viewId: viewId,
  }
}
