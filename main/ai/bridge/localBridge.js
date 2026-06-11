// v1.2.0 (Этап 2 AI Bridge): Local Bridge — Ollama HTTP клиент.
//
// Ollama (https://ollama.com/) — локальный LLM сервер на 127.0.0.1:11434.
// Запускается одной командой: `ollama serve`. Модели качаются `ollama pull llama3.1`.
//
// API: используем `/api/chat` (OpenAI-compatible, новый endpoint).
// Документация: https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
//
// Формат запроса:
//   POST /api/chat
//   { model: "llama3.1", messages: [{ role, content }, ...], stream: false }
//
// Формат ответа:
//   { model, message: { role: "assistant", content }, done: true, ... }
//
// ВАЖНО:
// - Этот модуль в main процессе. Использует глобальный fetch (Node 22+).
// - Возвращает AiBridgeAnswer (не throw) — даже при network error.
// - Поддерживает AbortSignal из question.signal.

/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeQuestion} AiBridgeQuestion */
/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeAnswer} AiBridgeAnswer */
/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiLocalBridgeConfig} AiLocalBridgeConfig */

import { AI_BRIDGE_CONTRACT_VERSION } from '../../../src/utils/aiBridge/contracts.js'

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'
const DEFAULT_MODEL = 'llama3.1'
const DEFAULT_TIMEOUT_MS = 60000

/**
 * Фабрика Local Bridge с привязанной конфигурацией.
 * Возвращает объект с методом ask(question) → Promise<AiBridgeAnswer>.
 *
 * @param {AiLocalBridgeConfig} [config]
 * @param {object} [deps] — { fetch } для DI в тестах (default — глобальный fetch).
 * @returns {{ ask: (q: AiBridgeQuestion) => Promise<AiBridgeAnswer> }}
 */
export function createLocalBridge(config = {}, deps = {}) {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')
  const model = config.model || DEFAULT_MODEL
  const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS
  const fetchImpl = deps.fetch || globalThis.fetch

  return {
    async ask(question) {
      return askOllama({ question, baseUrl, model, timeoutMs, fetchImpl })
    },
  }
}

/**
 * Реализация одного запроса к Ollama. Pure-ish (зависит только от fetch).
 *
 * @param {object} args
 * @returns {Promise<AiBridgeAnswer>}
 */
async function askOllama({ question, baseUrl, model, timeoutMs, fetchImpl }) {
  const t0 = Date.now()
  const url = baseUrl + '/api/chat'
  const messages = buildMessages(question)
  const body = JSON.stringify({ model, messages, stream: false })

  // AbortController: либо собственный таймаут, либо проброс из question.signal.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  const externalSignal = question?.signal
  let externalAbortHandler = null
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort('external_abort')
    else {
      externalAbortHandler = () => controller.abort('external_abort')
      externalSignal.addEventListener('abort', externalAbortHandler)
    }
  }

  try {
    if (!fetchImpl) {
      return errAnswer('config_invalid', 'fetch не доступен (Node < 22?)', t0)
    }

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })

    if (!res.ok) {
      // 4xx — клиентская проблема (модель не найдена / wrong path).
      // 5xx — серверная проблема (Ollama crashed / OOM).
      const code = res.status >= 500 ? 'server_error' : 'config_invalid'
      const text = await safeText(res)
      return errAnswer(code, 'Ollama HTTP ' + res.status + ': ' + (text || res.statusText), t0, {
        httpStatus: res.status,
      })
    }

    const data = await res.json().catch(() => null)
    const text = extractText(data)
    if (!text) {
      return errAnswer('no_answer', 'Ollama вернула пустой ответ', t0, { rawData: data })
    }
    return {
      version: AI_BRIDGE_CONTRACT_VERSION,
      ok: true,
      text,
      providerId: 'local',
      mode: 'local',
      model: data?.model || model,
      latencyMs: Date.now() - t0,
    }
  } catch (e) {
    // AbortError → либо timeout, либо внешняя отмена.
    if (e?.name === 'AbortError' || controller.signal.aborted) {
      const reason = controller.signal.reason || e?.message || 'aborted'
      const code = reason === 'timeout' ? 'streaming_timeout' : 'aborted'
      return errAnswer(code, 'Запрос к Ollama отменён: ' + reason, t0)
    }
    // ECONNREFUSED / ENOTFOUND — Ollama не запущена.
    const msg = e?.message || String(e)
    const isNetwork = /ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(msg)
    return errAnswer(isNetwork ? 'network_error' : 'unknown',
      isNetwork ? 'Ollama не запущена или недоступна (' + baseUrl + '). Запустите: ollama serve' : msg, t0)
  } finally {
    clearTimeout(timer)
    if (externalSignal && externalAbortHandler) {
      externalSignal.removeEventListener('abort', externalAbortHandler)
    }
  }
}

/**
 * Собрать messages для Ollama из AiBridgeQuestion.
 * Включает: systemPrompt (если есть), history (если есть), text как последний user.
 *
 * @param {AiBridgeQuestion} question
 * @returns {Array<{role: string, content: string}>}
 */
function buildMessages(question) {
  const messages = []
  if (question?.systemPrompt) {
    messages.push({ role: 'system', content: question.systemPrompt })
  }
  if (Array.isArray(question?.history)) {
    for (const t of question.history) {
      if (!t || typeof t.text !== 'string') continue
      const role = t.role === 'assistant' ? 'assistant' : 'user'
      messages.push({ role, content: t.text })
    }
  }
  messages.push({ role: 'user', content: question?.text || '' })
  return messages
}

/**
 * Достать текст из ответа Ollama.
 * Поддерживает оба формата: новый /api/chat (data.message.content) и
 * старый /api/generate (data.response).
 */
function extractText(data) {
  if (!data) return ''
  if (data.message && typeof data.message.content === 'string') return data.message.content
  if (typeof data.response === 'string') return data.response
  return ''
}

/**
 * Сформировать AiBridgeAnswer для ошибки.
 */
function errAnswer(code, message, t0, debug) {
  return {
    version: AI_BRIDGE_CONTRACT_VERSION,
    ok: false,
    text: '',
    providerId: 'local',
    mode: 'local',
    latencyMs: Date.now() - t0,
    error: {
      code,
      message,
      retryable: code === 'network_error' || code === 'server_error' || code === 'streaming_timeout',
    },
    ...(debug ? { debug } : {}),
  }
}

/**
 * Безопасное чтение текста response (для error message).
 */
async function safeText(res) {
  try { return (await res.text()).slice(0, 500) }
  catch (_) { return '' }
}
