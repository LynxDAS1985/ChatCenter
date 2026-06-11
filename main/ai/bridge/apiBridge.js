// v1.2.0 (Этап 3 AI Bridge): API Bridge — обёртка над существующим aiProviderCaller.
//
// Принимает AiBridgeQuestion → формирует messages → вызывает callProvider →
// парсит ответ из формата провайдера → возвращает AiBridgeAnswer.
//
// Поддерживаемые провайдеры (через callProvider):
//   - anthropic (Claude API)
//   - openai (ChatGPT API)
//   - deepseek (DeepSeek API)
//   - gigachat (ГигаЧат API — OAuth + SSL bypass)
//
// БЕЗ tool use — Bridge только текст-ответ. Tool use — в aiToolExecutor (для AI Agent).
//
// Конфиг:
//   - providerId (обязательно)
//   - model (опц — иначе дефолт провайдера)
//   - timeoutMs (опц, default 60с)

/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeQuestion} AiBridgeQuestion */
/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiBridgeAnswer} AiBridgeAnswer */
/** @typedef {import('../../../src/utils/aiBridge/contracts.js').AiProviderId} AiProviderId */

import { AI_BRIDGE_CONTRACT_VERSION } from '../../../src/utils/aiBridge/contracts.js'

const DEFAULT_TIMEOUT_MS = 60000

/**
 * Фабрика API Bridge.
 *
 * @param {object} config
 * @param {AiProviderId} config.providerId — anthropic / openai / deepseek / gigachat
 * @param {string} [config.model]
 * @param {number} [config.timeoutMs]
 * @param {object} deps
 * @param {(args: object) => Promise<object>} deps.callProvider — функция из aiProviderCaller
 * @returns {{ ask: (q: AiBridgeQuestion) => Promise<AiBridgeAnswer> }}
 */
export function createApiBridge(config, deps) {
  if (!config?.providerId) throw new Error('createApiBridge: providerId required')
  if (typeof deps?.callProvider !== 'function') throw new Error('createApiBridge: deps.callProvider required')

  const providerId = config.providerId
  const model = config.model
  const timeoutMs = Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS
  const callProvider = deps.callProvider

  return {
    async ask(question) {
      return askApi({ question, providerId, model, timeoutMs, callProvider })
    },
  }
}

/**
 * Реализация одного запроса. Pure-ish — зависит только от callProvider (DI).
 *
 * @returns {Promise<AiBridgeAnswer>}
 */
async function askApi({ question, providerId, model, timeoutMs, callProvider }) {
  const t0 = Date.now()
  const messages = buildMessages(question)

  // Timeout через Promise.race + AbortController. callProvider — fetch внутри,
  // но он не принимает signal напрямую — поэтому race остаётся.
  const externalSignal = question?.signal
  if (externalSignal?.aborted) {
    return errAnswer(providerId, 'aborted', 'Запрос отменён до отправки', t0)
  }

  let timeoutHandle = null
  const timeoutPromise = new Promise((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ __timeout: true })
    }, timeoutMs)
  })

  let abortPromise = null
  if (externalSignal) {
    abortPromise = new Promise((resolve) => {
      const onAbort = () => resolve({ __aborted: true })
      externalSignal.addEventListener('abort', onAbort, { once: true })
    })
  }

  let raceWith = [callProvider({ provider: providerId, messages, model }), timeoutPromise]
  if (abortPromise) raceWith.push(abortPromise)

  let raw
  try {
    raw = await Promise.race(raceWith)
  } catch (e) {
    clearTimeout(timeoutHandle)
    return errFromException(providerId, e, t0)
  }
  clearTimeout(timeoutHandle)

  if (raw?.__timeout) {
    return errAnswer(providerId, 'streaming_timeout', 'API не ответил за ' + timeoutMs + 'мс', t0, { retryable: true })
  }
  if (raw?.__aborted) {
    return errAnswer(providerId, 'aborted', 'Запрос отменён', t0)
  }

  const text = extractText(raw, providerId)
  if (!text) {
    return errAnswer(providerId, 'no_answer', 'Провайдер вернул пустой ответ', t0, { rawData: raw })
  }

  return {
    version: AI_BRIDGE_CONTRACT_VERSION,
    ok: true,
    text,
    providerId,
    mode: 'api',
    latencyMs: Date.now() - t0,
    model: extractModel(raw, model),
  }
}

/**
 * Преобразовать AiBridgeQuestion в формат messages для callProvider.
 * callProvider извлекает system из messages[0].role='system' автоматически.
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
 * Извлечь текст из ответа провайдера. Разный shape:
 *   - Anthropic: data.content[].type='text', text
 *   - OpenAI/DeepSeek/GigaChat: data.choices[0].message.content
 */
function extractText(data, providerId) {
  if (!data) return ''
  if (providerId === 'anthropic') {
    // content — массив content blocks. Берём первый text.
    const blocks = Array.isArray(data.content) ? data.content : []
    for (const b of blocks) {
      if (b?.type === 'text' && typeof b.text === 'string') return b.text
    }
    return ''
  }
  // OpenAI-compatible (openai/deepseek/gigachat)
  const choice = Array.isArray(data.choices) ? data.choices[0] : null
  const msg = choice?.message
  if (typeof msg?.content === 'string') return msg.content
  return ''
}

/**
 * Достать модель из ответа провайдера или вернуть запрошенную.
 */
function extractModel(data, fallback) {
  return data?.model || fallback || undefined
}

/**
 * Преобразовать исключение от callProvider в AiBridgeError.
 * callProvider throws Error с сообщениями типа:
 *   - "callProvider: missing API key for ..."
 *   - "callProvider: HTTP 401 — ..."
 *   - "callProvider: HTTP 429 — ..."
 *   - "callProvider: HTTP 5xx — ..."
 *   - "callProvider: network error — ..."
 */
function errFromException(providerId, e, t0) {
  const msg = e?.message || String(e)
  let code = 'unknown'
  let retryable = false

  if (/missing API key/i.test(msg)) {
    code = 'auth_required'
  } else if (/HTTP 401|HTTP 403/i.test(msg)) {
    code = 'auth_required'
  } else if (/HTTP 429/i.test(msg)) {
    code = 'rate_limited'
    retryable = true
  } else if (/HTTP 5\d\d/i.test(msg)) {
    code = 'server_error'
    retryable = true
  } else if (/HTTP 4\d\d/i.test(msg)) {
    code = 'config_invalid'
  } else if (/network error|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(msg)) {
    code = 'network_error'
    retryable = true
  } else if (/unsupported provider/i.test(msg)) {
    code = 'config_invalid'
  } else if (/invalid JSON response/i.test(msg)) {
    code = 'server_error'
    retryable = true
  }

  return errAnswer(providerId, code, msg, t0, { retryable })
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
    mode: 'api',
    latencyMs: Date.now() - t0,
    error: {
      code,
      message,
      retryable: !!opts.retryable,
    },
    ...(opts.rawData ? { debug: { rawData: opts.rawData } } : {}),
  }
}
