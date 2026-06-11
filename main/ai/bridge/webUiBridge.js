// v1.2.0 (Этап 4 AI Bridge): WebUI Bridge — общается с preload скриптом
// который инжектирован в webview AI сайта (chat.openai.com / etc).
//
// На Этапе 4 это полностью функциональный bridge, но без реального hook кода —
// hook файлы будут наполняться в Этапах 5-6 (OpenAI / DeepSeek / Claude / GigaChat).
//
// Поток:
// 1. ask(question) → отправляем `ai-bridge:webui:inject` через webContents.send
//    в нужный webview (по providerId).
// 2. Ждём `ai-bridge:webui:answer-received` или `ai-bridge:webui:error` с тем же questionId.
// 3. Возвращаем AiBridgeAnswer.
//
// Webview регистрируется через `registerWebview(providerId, webContents)` — обычно
// делается при mount AISidebar (Этап 7).

/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeQuestion} AiBridgeQuestion */
/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeAnswer} AiBridgeAnswer */
/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiProviderId} AiProviderId */

import { AI_BRIDGE_CONTRACT_VERSION } from '../../../src/utils/aiBridge/contracts.js'

const DEFAULT_TIMEOUT_MS = 90000  // webui медленнее API, по умолчанию 90 сек
let _questionIdCounter = 1

/**
 * Реестр webview по providerId. Заполняется через registerWebview из main.js
 * когда AISidebar монтируется.
 *
 * @typedef {{ webContents: any, removeListener: Function }} WebviewEntry
 */
const _webviews = new Map()
const _pendingByQuestionId = new Map()

/**
 * Зарегистрировать webview для провайдера. Возвращает функцию-отвязку.
 *
 * @param {AiProviderId} providerId
 * @param {object} webContents — Electron WebContents (есть send + on)
 * @returns {() => void} unregister
 */
export function registerWebview(providerId, webContents) {
  if (!providerId || !webContents?.send) {
    return () => {}
  }
  _webviews.set(providerId, { webContents })
  return () => {
    if (_webviews.get(providerId)?.webContents === webContents) {
      _webviews.delete(providerId)
    }
  }
}

/**
 * Hook для IPC: вызвать когда пришёл ответ от preload.
 * Связывает payload с pending Promise.
 *
 * @param {{ provider: string, questionId: string, text: string }} payload
 */
export function deliverAnswer(payload) {
  const id = payload?.questionId
  const pending = id && _pendingByQuestionId.get(id)
  if (!pending) return
  _pendingByQuestionId.delete(id)
  pending.resolve(payload?.text || '')
}

/**
 * Hook для IPC: вызвать когда пришла ошибка от preload.
 *
 * @param {{ provider: string, questionId: string, code: string, message: string }} payload
 */
export function deliverError(payload) {
  const id = payload?.questionId
  const pending = id && _pendingByQuestionId.get(id)
  if (!pending) return
  _pendingByQuestionId.delete(id)
  pending.reject({ code: payload?.code || 'unknown', message: payload?.message || '' })
}

/**
 * Очистить весь pending state (для тестов / при unmount).
 */
export function clearWebUiBridgeState() {
  _webviews.clear()
  _pendingByQuestionId.clear()
}

/**
 * Фабрика WebUI Bridge.
 *
 * @param {object} config
 * @param {AiProviderId} config.providerId
 * @param {number} [config.timeoutMs]
 * @param {object} [config.selectors] — custom selectors из настроек юзера (опц)
 * @returns {{ ask: (q: AiBridgeQuestion) => Promise<AiBridgeAnswer> }}
 */
export function createWebUiBridge(config) {
  if (!config?.providerId) throw new Error('createWebUiBridge: providerId required')

  const providerId = config.providerId
  const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS
  const selectors = config.selectors || null

  return {
    async ask(question) {
      const t0 = Date.now()
      const entry = _webviews.get(providerId)
      if (!entry?.webContents) {
        return errAnswer(providerId, 'config_invalid',
          'WebView для ' + providerId + ' не открыт. Откройте AI веб-интерфейс в боковой панели.',
          t0)
      }

      // Уникальный ID запроса для матчинга ответа
      const questionId = 'q_' + Date.now() + '_' + (_questionIdCounter++)

      // Promise который резолвится через deliverAnswer / deliverError
      const responsePromise = new Promise((resolve, reject) => {
        _pendingByQuestionId.set(questionId, { resolve, reject })
      })

      // Timeout + abort race
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject({ code: 'streaming_timeout',
          message: 'WebUI не ответил за ' + timeoutMs + 'мс' }), timeoutMs)
      })

      let abortPromise = null
      const externalSignal = question?.signal
      if (externalSignal) {
        if (externalSignal.aborted) {
          _pendingByQuestionId.delete(questionId)
          return errAnswer(providerId, 'aborted', 'Запрос отменён до отправки', t0)
        }
        abortPromise = new Promise((_, reject) => {
          externalSignal.addEventListener('abort',
            () => reject({ code: 'aborted', message: 'Запрос отменён' }),
            { once: true })
        })
      }

      // Отправить inject команду в preload
      try {
        entry.webContents.send('ai-bridge:webui:inject', {
          questionId,
          text: question?.text || '',
          selectors,
        })
      } catch (e) {
        _pendingByQuestionId.delete(questionId)
        return errAnswer(providerId, 'unknown',
          'webContents.send упал: ' + (e?.message || String(e)), t0)
      }

      // Ждём ответ / timeout / abort
      let text
      try {
        const races = [responsePromise, timeoutPromise]
        if (abortPromise) races.push(abortPromise)
        text = await Promise.race(races)
      } catch (err) {
        _pendingByQuestionId.delete(questionId)
        const retryable = err?.code === 'streaming_timeout' || err?.code === 'rate_limited'
        return errAnswer(providerId, err?.code || 'unknown',
          err?.message || String(err), t0, { retryable })
      }

      if (!text) {
        return errAnswer(providerId, 'no_answer', 'WebUI вернул пустой ответ', t0)
      }

      return {
        version: AI_BRIDGE_CONTRACT_VERSION,
        ok: true,
        text,
        providerId,
        mode: 'webui',
        latencyMs: Date.now() - t0,
      }
    },
  }
}

/**
 * Сформировать AiBridgeAnswer для ошибки.
 */
function errAnswer(providerId, code, message, t0, opts = {}) {
  return {
    version: AI_BRIDGE_CONTRACT_VERSION,
    ok: false,
    text: '',
    providerId,
    mode: 'webui',
    latencyMs: Date.now() - t0,
    error: {
      code,
      message,
      retryable: !!opts.retryable,
    },
  }
}
