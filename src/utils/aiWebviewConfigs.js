// v1.2.0-alpha.1 (Этап 1 AI Bridge): дефолтные конфиги webview для AI провайдеров.
//
// Содержит:
// - DEFAULT_WEBVIEW_PROVIDERS — массив конфигов 4 провайдеров (chat.openai.com, chat.deepseek.com,
//   claude.ai, giga.chat) с дефолтными селекторами.
// - detectAiProvider(urlOrHost) — определить провайдера по URL (для webview-preload routing).
// - getDefaultSelectors(providerId) — получить дефолтные селекторы по id.
//
// Источник селекторов — phase-ai-bridge-providers.md (проверено на 9 июня 2026).
// Юзер сможет переопределить через UI Custom Selectors (Этап 8).
//
// ВАЖНО:
// - Только ЧИСТЫЕ функции и константы. Никаких side-effects на импорт.
// - НЕ зависит от Electron API. Можно тестировать в jsdom.

/** @typedef {import('./aiBridge/contracts.js').AiWebviewProviderConfig} AiWebviewProviderConfig */
/** @typedef {import('./aiBridge/contracts.js').AiProviderId} AiProviderId */
/** @typedef {import('./aiBridge/contracts.js').AiWebviewSelectors} AiWebviewSelectors */

/** @type {readonly AiWebviewProviderConfig[]} */
export const DEFAULT_WEBVIEW_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'openai',
    label: 'ChatGPT',
    defaultUrl: 'https://chat.openai.com/',
    hostPatterns: Object.freeze(['chat.openai.com', 'chatgpt.com']),
    selectors: Object.freeze({
      input: '#prompt-textarea',
      submitButton: '[data-testid="send-button"]',
      lastAssistantMessage: '[data-message-author-role="assistant"] .markdown',
      streamingIndicator: '.result-streaming, [data-message-status="in_progress"]',
    }),
    debounceMs: 800,
    cooldownMs: 3000,
  }),
  Object.freeze({
    id: 'deepseek',
    label: 'DeepSeek',
    defaultUrl: 'https://chat.deepseek.com/',
    hostPatterns: Object.freeze(['chat.deepseek.com']),
    selectors: Object.freeze({
      input: 'textarea[placeholder*="Send a message"], textarea[placeholder*="Сообщение"], #chat-input',
      submitButton: 'button[type="submit"]:not([disabled]), button.send-button, [aria-label="Send"]',
      lastAssistantMessage: '.ds-markdown:last-of-type, [class*="message-content"]:last-child',
      streamingIndicator: '[class*="streaming"], [class*="typing-indicator"]',
    }),
    debounceMs: 800,
    cooldownMs: 3000,
  }),
  Object.freeze({
    id: 'anthropic',
    label: 'Claude',
    defaultUrl: 'https://claude.ai/',
    hostPatterns: Object.freeze(['claude.ai']),
    selectors: Object.freeze({
      input: 'div[contenteditable="true"][role="textbox"], [data-testid="chat-input"]',
      submitButton: 'button[aria-label="Send Message"], [data-testid="send-button"]',
      lastAssistantMessage: '[data-is-streaming="false"][data-message-id]:last-of-type, .font-claude-message:last-of-type',
      streamingIndicator: '[data-is-streaming="true"]',
    }),
    debounceMs: 800,
    cooldownMs: 3000,
  }),
  Object.freeze({
    id: 'gigachat',
    label: 'ГигаЧат',
    defaultUrl: 'https://giga.chat/',
    hostPatterns: Object.freeze(['giga.chat', 'developers.sber.ru']),
    selectors: Object.freeze({
      input: 'textarea, [contenteditable="true"]',
      submitButton: 'button[type="submit"]',
      lastAssistantMessage: '[class*="message"][class*="assistant"]:last-of-type, [class*="bot"]:last-of-type',
      streamingIndicator: '[class*="typing"], [class*="loading"]',
    }),
    debounceMs: 800,
    cooldownMs: 3000,
  }),
])

/**
 * Извлечь host из URL. Безопасно к мусору на входе.
 * @param {string} urlOrHost — Полный URL или просто host (`chat.openai.com`).
 * @returns {string} — host в lower-case, без `www.`. Пусто при ошибке.
 */
export function extractHost(urlOrHost) {
  if (typeof urlOrHost !== 'string' || !urlOrHost.trim()) return ''
  const s = urlOrHost.trim()
  // Если выглядит как голый host (нет `://`) — берём первое слово до `/`
  if (!s.includes('://')) {
    const h = s.split('/')[0].toLowerCase()
    return h.startsWith('www.') ? h.slice(4) : h
  }
  try {
    const u = new URL(s)
    const h = u.host.toLowerCase()
    return h.startsWith('www.') ? h.slice(4) : h
  } catch (_) {
    return ''
  }
}

/**
 * Найти провайдера по URL/host. Возвращает null если не распознан.
 * Сравнение строгое: host должен совпасть с одним из hostPatterns (с учётом поддомена).
 * @param {string} urlOrHost
 * @returns {AiWebviewProviderConfig | null}
 */
export function detectAiProvider(urlOrHost) {
  const host = extractHost(urlOrHost)
  if (!host) return null
  for (const p of DEFAULT_WEBVIEW_PROVIDERS) {
    for (const pattern of p.hostPatterns) {
      if (host === pattern || host.endsWith('.' + pattern)) {
        return p
      }
    }
  }
  return null
}

/**
 * Получить конфиг провайдера по id (`openai`/`deepseek`/`anthropic`/`gigachat`).
 * @param {AiProviderId} providerId
 * @returns {AiWebviewProviderConfig | null}
 */
export function getProviderConfig(providerId) {
  if (!providerId) return null
  return DEFAULT_WEBVIEW_PROVIDERS.find(p => p.id === providerId) || null
}

/**
 * Получить дефолтные селекторы провайдера. Возвращает null если provider не известен.
 * @param {AiProviderId} providerId
 * @returns {AiWebviewSelectors | null}
 */
export function getDefaultSelectors(providerId) {
  const cfg = getProviderConfig(providerId)
  return cfg ? cfg.selectors : null
}

/**
 * Список всех известных provider id (для UI).
 * @returns {AiProviderId[]}
 */
export function listProviderIds() {
  return DEFAULT_WEBVIEW_PROVIDERS.map(p => p.id)
}
