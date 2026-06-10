// v0.99.1 (Phase 3.5): callProvider — функция вызова AI API с tools параметром.
//
// Используется в aiToolExecutor для запросов к Anthropic / OpenAI / DeepSeek / ГигаЧат.
// Tools параметр уже сконвертирован в формат провайдера (через adapters).
//
// API ключи берутся из electron-store settings.aiProviderKeys[provider].apiKey.
// Никогда не передаются в renderer.

import * as anthropic from './adapters/anthropicAdapter.js'
import * as openai from './adapters/openaiAdapter.js'
// v1.1.4: ГигаЧат tool use — использует существующие OAuth + SSL bypass.
import { httpsPostSkipSsl, getGigaChatToken, GIGACHAT_CHAT_URL } from '../utils/gigachat.js'

const ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai:    'https://api.openai.com/v1/chat/completions',
  deepseek:  'https://api.deepseek.com/v1/chat/completions',
  // v1.1.4: gigachat НЕ использует fetch (нужен SSL bypass) — обрабатывается
  // отдельной веткой через httpsPostSkipSsl. ENDPOINTS используется только
  // для негигачатовых провайдеров.
}

const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai:    'gpt-4o-mini',
  deepseek:  'deepseek-chat',
  gigachat:  'GigaChat',
}

const MAX_TOKENS = 2048

/**
 * Получить API ключ для провайдера из electron-store.
 *
 * @param {object} storage — electron-store instance
 * @param {string} provider
 * @returns {{apiKey: string, clientSecret?: string} | null}
 */
function getProviderCreds(storage, provider) {
  if (!storage) return null
  try {
    const settings = storage.get('settings', {})
    const providerKeys = settings.aiProviderKeys || {}
    const data = providerKeys[provider] || {}
    // Если активный провайдер = этот — использовать legacy fields settings.aiApiKey
    if (settings.aiProvider === provider) {
      return {
        apiKey: settings.aiApiKey || data.apiKey || '',
        clientSecret: settings.aiClientSecret || data.clientSecret || '',
      }
    }
    return {
      apiKey: data.apiKey || '',
      clientSecret: data.clientSecret || '',
    }
  } catch (_) {
    return null
  }
}

/**
 * Создать callProvider функцию связанную с storage (для secret keys).
 *
 * @param {object} deps — { storage }
 * @returns {function} callProvider({ provider, messages, tools, model }) → response
 */
export function createCallProvider(deps) {
  const storage = deps?.storage

  return async function callProvider({ provider, messages, tools, model }) {
    if (!provider) throw new Error('callProvider: missing provider')

    // v1.1.4: ГигаЧат — отдельный код-путь (OAuth + SSL bypass через
    // httpsPostSkipSsl), потому что Node fetch не проходит сертификат Минцифры.
    if (provider === 'gigachat') {
      return await callGigaChat({ storage, messages, tools, model: model || DEFAULT_MODELS.gigachat })
    }

    const endpoint = ENDPOINTS[provider]
    if (!endpoint) {
      throw new Error(`callProvider: unsupported provider "${provider}"`)
    }

    const creds = getProviderCreds(storage, provider)
    if (!creds || !creds.apiKey) {
      throw new Error(`callProvider: missing API key for ${provider}`)
    }

    const actualModel = model || DEFAULT_MODELS[provider]

    // Системный prompt извлекаем из messages[0] если role='system'
    let systemPrompt = ''
    let userMessages = messages
    if (messages?.[0]?.role === 'system') {
      systemPrompt = messages[0].content
      userMessages = messages.slice(1)
    }

    let body, headers
    if (provider === 'anthropic') {
      // Anthropic: tools в request, system отдельным параметром
      body = {
        model: actualModel,
        max_tokens: MAX_TOKENS,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: userMessages,
      }
      if (Array.isArray(tools) && tools.length > 0) {
        body.tools = anthropic.toAnthropicTools
          ? anthropic.toAnthropicTools(tools.map(t => ({ id: t.name, description: t.description, inputSchema: t.input_schema })))
          : tools  // уже сконвертированы выше
        // Если tools уже сконвертированы (anthropic format) — используем напрямую
        if (tools[0]?.input_schema && !tools[0]?.inputSchema) {
          body.tools = tools
        }
      }
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': creds.apiKey,
        'anthropic-version': '2023-06-01',
      }
    } else {
      // OpenAI / DeepSeek: system как message с role='system' + tools
      body = {
        model: actualModel,
        max_tokens: MAX_TOKENS,
        messages: systemPrompt
          ? [{ role: 'system', content: systemPrompt }, ...userMessages]
          : userMessages,
      }
      if (Array.isArray(tools) && tools.length > 0) {
        // Tools уже в OpenAI формате (через openaiAdapter.toOpenAITools)
        body.tools = tools
      }
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.apiKey}`,
      }
    }

    // Выполнить fetch
    let response, data
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch (e) {
      throw new Error(`callProvider: network error — ${e?.message || e}`)
    }

    if (!response.ok) {
      let errText = ''
      try { errText = await response.text() } catch (_) {}
      throw new Error(`callProvider: HTTP ${response.status} — ${errText.slice(0, 200)}`)
    }

    try {
      data = await response.json()
    } catch (e) {
      throw new Error(`callProvider: invalid JSON response`)
    }

    return data
  }
}

/**
 * v1.1.4: вызов ГигаЧат с tool use (functions API).
 *
 * Отличия от Anthropic/OpenAI:
 * 1. OAuth — получаем access_token (кэш на 30 мин в gigachat.js).
 * 2. SSL bypass — Node fetch не проходит сертификат Минцифры, используем
 *    httpsPostSkipSsl с rejectUnauthorized:false.
 * 3. Старый OpenAI format — `functions` вместо `tools`, `function_call`
 *    вместо `tool_calls`. Конвертацию делает aiToolExecutor через
 *    adapter.toTools (= toGigaChatFunctions).
 * 4. Параллельные вызовы НЕ поддержаны — function_call возвращается ОДИН
 *    за раз. Адаптер parseGigaChatFunctionCall корректно обрабатывает.
 *
 * @returns {Promise<object>} полный response (как от API)
 */
async function callGigaChat({ storage, messages, tools, model }) {
  // ГигаЧат creds = {apiKey: clientId, clientSecret}
  const creds = getProviderCreds(storage, 'gigachat')
  if (!creds || !creds.apiKey || !creds.clientSecret) {
    throw new Error('callProvider: gigachat needs both clientId (apiKey) and clientSecret')
  }

  // OAuth — токен кэшируется на 30 мин в getGigaChatToken
  let token
  try {
    token = await getGigaChatToken(creds.apiKey.trim(), creds.clientSecret.trim())
  } catch (e) {
    throw new Error(`gigachat OAuth failed: ${e?.message || e}`)
  }

  // Системный prompt — отдельным сообщением в начало
  let systemPrompt = ''
  let userMessages = messages
  if (messages?.[0]?.role === 'system') {
    systemPrompt = messages[0].content
    userMessages = messages.slice(1)
  }

  const body = {
    model: model || DEFAULT_MODELS.gigachat,
    messages: systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...userMessages]
      : userMessages,
  }
  if (Array.isArray(tools) && tools.length > 0) {
    // tools уже сконвертированы через toGigaChatFunctions в executor.
    body.functions = tools
    body.function_call = 'auto'
  }

  let result
  try {
    result = await httpsPostSkipSsl(
      GIGACHAT_CHAT_URL,
      JSON.stringify(body),
      {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    )
  } catch (e) {
    throw new Error(`gigachat: network error — ${e?.message || e}`)
  }

  if (!result?.ok) {
    const errMsg = result?.data?.error?.message || result?.data?.message || 'HTTP error'
    const code = result?.data?.error?.code || result?.data?.code
    throw new Error(`gigachat HTTP ${code || '???'}: ${String(errMsg).slice(0, 200)}`)
  }
  return result.data
}

export const _internal = { ENDPOINTS, DEFAULT_MODELS, callGigaChat }
