// v0.99.1 (Phase 3.5): callProvider — функция вызова AI API с tools параметром.
//
// Используется в aiToolExecutor для запросов к Anthropic / OpenAI / DeepSeek / ГигаЧат.
// Tools параметр уже сконвертирован в формат провайдера (через adapters).
//
// API ключи берутся из electron-store settings.aiProviderKeys[provider].apiKey.
// Никогда не передаются в renderer.

import * as anthropic from './adapters/anthropicAdapter.js'
import * as openai from './adapters/openaiAdapter.js'
// gigachat: для будущей интеграции (нужен OAuth + SSL bypass)

const ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai:    'https://api.openai.com/v1/chat/completions',
  deepseek:  'https://api.deepseek.com/v1/chat/completions',
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

    const endpoint = ENDPOINTS[provider]
    if (!endpoint) {
      throw new Error(`callProvider: unsupported provider "${provider}". ГигаЧат пока не поддерживается в tool use (требует OAuth + SSL bypass).`)
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

export const _internal = { ENDPOINTS, DEFAULT_MODELS }
