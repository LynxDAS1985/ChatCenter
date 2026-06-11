// v1.2.0 (Этап 2 AI Bridge): IPC handlers для AI Bridge.
//
// Renderer вызывает: window.api.invoke('ai-bridge:send', { mode, providerId, question, config })
// Main отвечает: AiBridgeAnswer (см. contracts.js).
//
// На Этапе 2 поддерживается только mode='local' (Ollama).
// Этапы 3-6 добавят api/webui bridges.
//
// ВАЖНО:
// - Возвращаем ВСЕГДА AiBridgeAnswer (не throw) — даже если bridge не зарегистрирован.
// - Конфиг приходит из renderer (settings), не храним в main.
// - AbortController — отдельный канал `ai-bridge:cancel` (TODO Этап 7).

import { createLocalBridge } from '../ai/bridge/localBridge.js'
// v1.2.0 (Этап 3): API Bridge — обёртка callProvider под единый интерфейс.
import { createApiBridge } from '../ai/bridge/apiBridge.js'
// v1.2.0 (Этап 4): WebUI Bridge — общение с preload в AI webview.
import { createWebUiBridge, deliverAnswer, deliverError, registerWebview } from '../ai/bridge/webUiBridge.js'
import { createAiBridgeRouter } from '../ai/bridge/router.js'
// v1.1.18 (Этап 9): fallback chain — авто-переключение на резервный bridge.
import { createFallbackChain } from '../ai/bridge/fallbackChain.js'
import { AI_BRIDGE_CONTRACT_VERSION } from '../../src/utils/aiBridge/contracts.js'

const IPC_CHANNEL_SEND = 'ai-bridge:send'
const IPC_CHANNEL_WEBUI_ANSWER = 'ai-bridge:webui:answer-received'
const IPC_CHANNEL_WEBUI_ERROR = 'ai-bridge:webui:error'
const IPC_CHANNEL_WEBUI_READY = 'ai-bridge:webui:ready'
// v1.1.16 (Этап 7): renderer регистрирует webview в WebUI Bridge через эти каналы.
const IPC_CHANNEL_REGISTER = 'ai-bridge:webui:register-webview'
const IPC_CHANNEL_UNREGISTER = 'ai-bridge:webui:unregister-webview'

/**
 * Регистрирует IPC handler. Возвращает функцию-отписку.
 *
 * @param {object} ipcMain — Electron ipcMain.
 * @param {object} [deps] — { factoryLocal, factoryApi, fetch, callProvider, webContentsFromId } для DI.
 * @returns {() => void} unsubscribe.
 */
export function registerAiBridgeIpcHandlers(ipcMain, deps = {}) {
  if (!ipcMain?.handle) throw new Error('ipcMain.handle required')

  const factoryLocal = deps.factoryLocal || createLocalBridge
  const factoryApi = deps.factoryApi || createApiBridge
  // v1.1.16: webContents.fromId резолвится здесь чтобы тесты могли мокнуть.
  const webContentsFromId = deps.webContentsFromId || null  // null → используем динамический import в register handler

  const handler = async (_event, payload) => {
    return handleSend(payload, {
      factoryLocal,
      factoryApi,
      fetch: deps.fetch,
      callProvider: deps.callProvider,
    })
  }

  ipcMain.handle(IPC_CHANNEL_SEND, handler)

  // v1.1.16 (Этап 7): renderer регистрирует webview AI сайта через invoke.
  // Хранит unregister-функции по providerId для последующей отписки.
  const webviewUnregisterByProvider = new Map()

  const registerHandler = async (_event, payload) => {
    return await handleRegisterWebview(payload, { webContentsFromId, webviewUnregisterByProvider })
  }
  const unregisterHandler = async (_event, payload) => {
    return handleUnregisterWebview(payload, { webviewUnregisterByProvider })
  }
  ipcMain.handle(IPC_CHANNEL_REGISTER, registerHandler)
  ipcMain.handle(IPC_CHANNEL_UNREGISTER, unregisterHandler)

  // v1.2.0 (Этап 4): one-way события от preload → main для WebUI Bridge.
  // Bridge ждёт ответ через Promise registered в pending map; эти handlers
  // его резолвят / реджектят.
  const answerListener = (_event, payload) => { try { deliverAnswer(payload) } catch (_) {} }
  const errorListener  = (_event, payload) => { try { deliverError(payload) } catch (_) {} }
  const readyListener  = (_event, _payload) => { /* лог через app:log из preload, тут ничего не делаем */ }

  if (typeof ipcMain.on === 'function') {
    ipcMain.on(IPC_CHANNEL_WEBUI_ANSWER, answerListener)
    ipcMain.on(IPC_CHANNEL_WEBUI_ERROR, errorListener)
    ipcMain.on(IPC_CHANNEL_WEBUI_READY, readyListener)
  }

  return () => {
    try {
      if (typeof ipcMain.removeHandler === 'function') {
        ipcMain.removeHandler(IPC_CHANNEL_SEND)
        ipcMain.removeHandler(IPC_CHANNEL_REGISTER)
        ipcMain.removeHandler(IPC_CHANNEL_UNREGISTER)
      }
      if (typeof ipcMain.removeListener === 'function') {
        ipcMain.removeListener(IPC_CHANNEL_WEBUI_ANSWER, answerListener)
        ipcMain.removeListener(IPC_CHANNEL_WEBUI_ERROR, errorListener)
        ipcMain.removeListener(IPC_CHANNEL_WEBUI_READY, readyListener)
      }
      // Отписать все зарегистрированные webview
      for (const unreg of webviewUnregisterByProvider.values()) {
        try { unreg() } catch (_) {}
      }
      webviewUnregisterByProvider.clear()
    } catch (_) { /* ignore */ }
  }
}

/**
 * Регистрирует webview AI сайта в WebUI Bridge.
 * Резолвит webContents через webContents.fromId (Electron) — webContentsFromId DI для тестов.
 *
 * @param {{ providerId: string, webContentsId: number }} payload
 * @param {object} deps
 */
export async function handleRegisterWebview(payload, deps = {}) {
  const providerId = payload?.providerId
  const wcId = Number(payload?.webContentsId)
  if (!providerId || !Number.isFinite(wcId)) {
    return { ok: false, error: 'providerId и webContentsId обязательны' }
  }

  // Резолв webContents: либо через DI (тесты), либо динамически из electron.
  let wc = null
  if (typeof deps.webContentsFromId === 'function') {
    wc = deps.webContentsFromId(wcId)
  } else {
    try {
      const electron = await import('electron')
      wc = electron.webContents?.fromId?.(wcId) || null
    } catch (_) {
      // Electron недоступен (например в jsdom тестах без DI)
    }
  }

  if (!wc) {
    return { ok: false, error: 'webContents с id=' + wcId + ' не найден' }
  }

  // Отписать предыдущий webview этого провайдера (если был)
  const existing = deps.webviewUnregisterByProvider?.get(providerId)
  if (existing) {
    try { existing() } catch (_) {}
  }

  const unregister = registerWebview(providerId, wc)
  deps.webviewUnregisterByProvider?.set(providerId, unregister)
  return { ok: true }
}

/**
 * Отписать webview по providerId.
 */
export function handleUnregisterWebview(payload, deps = {}) {
  const providerId = payload?.providerId
  if (!providerId) return { ok: false, error: 'providerId обязателен' }
  const unreg = deps.webviewUnregisterByProvider?.get(providerId)
  if (unreg) {
    try { unreg() } catch (_) {}
    deps.webviewUnregisterByProvider?.delete(providerId)
  }
  return { ok: true }
}

/**
 * Реализация одного вызова send. Экспортируется отдельно для тестирования
 * без mock ipcMain.
 *
 * @param {object} payload — { mode, question, config }
 * @param {object} deps
 * @returns {Promise<import('../../src/utils/aiBridge/contracts.js').AiBridgeAnswer>}
 */
export async function handleSend(payload, deps = {}) {
  const t0 = Date.now()
  const mode = payload?.mode
  const question = payload?.question
  const config = payload?.config || {}
  const chain = payload?.chain  // v1.1.18 (Этап 9): опциональный fallback chain

  // v1.1.18: если задана fallback chain — используем её вместо single bridge.
  if (Array.isArray(chain) && chain.length > 0) {
    if (!question) {
      return {
        version: AI_BRIDGE_CONTRACT_VERSION,
        ok: false, text: '', providerId: 'openai', mode: 'api',
        latencyMs: Date.now() - t0,
        error: { code: 'config_invalid', message: 'question обязателен', retryable: false },
      }
    }
    const factories = {
      createLocalBridge: deps.factoryLocal || createLocalBridge,
      createApiBridge: deps.factoryApi || createApiBridge,
      createWebUiBridge: deps.factoryWebUi || createWebUiBridge,
      callProvider: deps.callProvider,
      fetch: deps.fetch,
    }
    const fallback = createFallbackChain(chain, factories)
    return fallback.ask(question)
  }

  if (!mode || !question) {
    return {
      version: AI_BRIDGE_CONTRACT_VERSION,
      ok: false,
      text: '',
      providerId: 'openai',
      mode: mode || 'local',
      latencyMs: Date.now() - t0,
      error: {
        code: 'config_invalid',
        message: 'mode и question обязательны (или используйте chain)',
        retryable: false,
      },
    }
  }

  // На Этапах 2-3 — local + api. Этап 4-6 добавит webui.
  let routerDeps = {}
  if (mode === 'local') {
    const localBridge = (deps.factoryLocal || createLocalBridge)(config, { fetch: deps.fetch })
    routerDeps.localBridge = localBridge
  } else if (mode === 'webui') {
    // v1.2.0 Этап 4: WebUI Bridge — общение с preload в AI webview.
    // Webview должен быть зарегистрирован через registerWebview из main.js
    // (это делает AISidebar при mount webview tag для AI сайта).
    if (!config.providerId) {
      return {
        version: AI_BRIDGE_CONTRACT_VERSION,
        ok: false,
        text: '',
        providerId: 'openai',
        mode: 'webui',
        latencyMs: Date.now() - t0,
        error: {
          code: 'config_invalid',
          message: 'WebUI mode требует config.providerId (anthropic/openai/deepseek/gigachat)',
          retryable: false,
        },
      }
    }
    const webUiBridge = (deps.factoryWebUi || createWebUiBridge)(config)
    routerDeps.webUiBridge = webUiBridge
  } else if (mode === 'api') {
    // API Bridge требует providerId в config + callProvider из deps.
    if (!config.providerId) {
      return {
        version: AI_BRIDGE_CONTRACT_VERSION,
        ok: false,
        text: '',
        providerId: 'openai',
        mode: 'api',
        latencyMs: Date.now() - t0,
        error: {
          code: 'config_invalid',
          message: 'API mode требует config.providerId (anthropic/openai/deepseek/gigachat)',
          retryable: false,
        },
      }
    }
    if (typeof deps.callProvider !== 'function') {
      return {
        version: AI_BRIDGE_CONTRACT_VERSION,
        ok: false,
        text: '',
        providerId: config.providerId,
        mode: 'api',
        latencyMs: Date.now() - t0,
        error: {
          code: 'config_invalid',
          message: 'API Bridge не настроен на main стороне (callProvider не передан в registerAiBridgeIpcHandlers)',
          retryable: false,
        },
      }
    }
    const apiBridge = (deps.factoryApi || createApiBridge)(config, { callProvider: deps.callProvider })
    routerDeps.apiBridge = apiBridge
  }
  // mode='webui' — Этапы 4-6. Пока вернёт unsupported_mode через router.

  const router = createAiBridgeRouter(mode, routerDeps)
  return router.ask(question)
}

export const AI_BRIDGE_IPC_CHANNELS = Object.freeze({
  SEND: IPC_CHANNEL_SEND,
})
