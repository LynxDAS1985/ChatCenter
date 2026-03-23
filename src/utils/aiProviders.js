/**
 * AI провайдеры — конфигурации, утилиты, константы.
 * Вынесено из AISidebar.jsx для тестируемости и переиспользования.
 */

// Паттерны распознавания API-ключей в буфере обмена
export function looksLikeApiKey(provider, text) {
  if (!text || text.length < 20) return false
  const t = text.trim()
  if (provider === 'openai')    return /^sk-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'anthropic') return /^sk-ant-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'deepseek')  return /^sk-[a-zA-Z0-9_\-]{20,}$/.test(t)
  if (provider === 'gigachat')  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(t)
  return t.startsWith('sk-') && t.length > 20
}

export const DEFAULT_SYSTEM_PROMPT =
  'Ты — ИИ-помощник менеджера по продажам. Клиент написал сообщение. ' +
  'Предложи РОВНО 3 варианта ответа: кратко (1-2 фразы), развёрнуто (3-4 предложения), официально (деловой тон). ' +
  'Ответ ТОЛЬКО в формате JSON-массива: ["вариант1","вариант2","вариант3"]. ' +
  'Отвечай на том же языке что клиент.'

export const PROVIDERS = [
  { id: 'openai',    label: 'OpenAI',    icon: '🌐', defaultModel: 'gpt-4o-mini',              free: false },
  { id: 'anthropic', label: 'Claude',    icon: '🤖', defaultModel: 'claude-haiku-4-5-20251001', free: false },
  { id: 'deepseek',  label: 'DeepSeek',  icon: '🔍', defaultModel: 'deepseek-chat',             free: true  },
  { id: 'gigachat',  label: 'ГигаЧат',   icon: '💬', defaultModel: 'GigaChat',                  free: true  },
]

export const DEFAULT_WEBVIEW_URLS = {
  openai:    'https://chat.openai.com',
  anthropic: 'https://claude.ai',
  deepseek:  'https://chat.deepseek.com',
  gigachat:  'https://giga.chat',
}

export const MODEL_HINTS = {
  openai:    ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
  deepseek:  ['deepseek-chat', 'deepseek-reasoner'],
  gigachat:  ['GigaChat', 'GigaChat-Plus', 'GigaChat-Pro'],
}

export const PROVIDER_URLS = {
  openai:    'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  deepseek:  'https://platform.deepseek.com/api_keys',
  gigachat:  'https://developers.sber.ru/studio',
}

export const BILLING_URLS = {
  openai:    'https://platform.openai.com/account/billing/overview',
  anthropic: 'https://console.anthropic.com/settings/billing',
  deepseek:  'https://platform.deepseek.com/account/billing',
  gigachat:  'https://developers.sber.ru/portal/tools/gigachat',
}

export const isBillingError = (err) =>
  !!err && (err.includes('средств') || err.includes('баланс') || err.includes('balance') || err.includes('insufficient'))

export function getProviderCfg(settings, pid) {
  const pKeys = settings.aiProviderKeys || {}
  const pData = pKeys[pid] || {}
  const active = settings.aiProvider || 'openai'
  const base = {
    mode:         pData.mode         || 'api',
    webviewUrl:   pData.webviewUrl   || DEFAULT_WEBVIEW_URLS[pid] || '',
    contextMode:  pData.contextMode  || 'last',
    model:        pData.model        || PROVIDERS.find(p => p.id === pid)?.defaultModel || '',
    apiKey:       pData.apiKey       || '',
    clientSecret: pData.clientSecret || '',
  }
  if (pid === active) {
    return {
      ...base,
      apiKey:       settings.aiApiKey       || base.apiKey,
      clientSecret: settings.aiClientSecret || base.clientSecret,
      model:        settings.aiModel        || base.model,
    }
  }
  return base
}

export function isProviderConnected(settings, pid) {
  const cfg = getProviderCfg(settings, pid)
  if (cfg.mode === 'webview') return true
  if (pid === 'gigachat') return !!(cfg.apiKey && cfg.clientSecret)
  return !!cfg.apiKey
}
