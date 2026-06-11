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
import { createAiBridgeRouter } from '../ai/bridge/router.js'
import { AI_BRIDGE_CONTRACT_VERSION } from '../../src/utils/aiBridge/contracts.js'

const IPC_CHANNEL_SEND = 'ai-bridge:send'

/**
 * Регистрирует IPC handler. Возвращает функцию-отписку.
 *
 * @param {object} ipcMain — Electron ipcMain.
 * @param {object} [deps] — { factoryLocal, factoryApi, fetch, callProvider } для DI в тестах.
 * @returns {() => void} unsubscribe.
 */
export function registerAiBridgeIpcHandlers(ipcMain, deps = {}) {
  if (!ipcMain?.handle) throw new Error('ipcMain.handle required')

  const factoryLocal = deps.factoryLocal || createLocalBridge
  const factoryApi = deps.factoryApi || createApiBridge

  const handler = async (_event, payload) => {
    return handleSend(payload, {
      factoryLocal,
      factoryApi,
      fetch: deps.fetch,
      callProvider: deps.callProvider,
    })
  }

  ipcMain.handle(IPC_CHANNEL_SEND, handler)

  return () => {
    try {
      if (typeof ipcMain.removeHandler === 'function') {
        ipcMain.removeHandler(IPC_CHANNEL_SEND)
      }
    } catch (_) { /* ignore */ }
  }
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
        message: 'mode и question обязательны',
        retryable: false,
      },
    }
  }

  // На Этапах 2-3 — local + api. Этап 4-6 добавит webui.
  let routerDeps = {}
  if (mode === 'local') {
    const localBridge = (deps.factoryLocal || createLocalBridge)(config, { fetch: deps.fetch })
    routerDeps.localBridge = localBridge
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
