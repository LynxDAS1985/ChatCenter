// v1.2.0-alpha.1 (Этап 1 AI Bridge): тесты detectAiProvider + reading config.

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WEBVIEW_PROVIDERS,
  detectAiProvider,
  extractHost,
  getDefaultSelectors,
  getProviderConfig,
  listProviderIds,
} from './aiWebviewConfigs.js'

describe('extractHost (Этап 1)', () => {
  it('полный URL → host без www', () => {
    expect(extractHost('https://chat.openai.com/c/abc')).toBe('chat.openai.com')
    expect(extractHost('https://www.chatgpt.com/')).toBe('chatgpt.com')
  })

  it('голый host → возвращается как есть в lowercase', () => {
    expect(extractHost('Chat.OpenAI.com')).toBe('chat.openai.com')
    expect(extractHost('giga.chat')).toBe('giga.chat')
  })

  it('некорректный вход → пустая строка', () => {
    expect(extractHost('')).toBe('')
    expect(extractHost(null)).toBe('')
    expect(extractHost(undefined)).toBe('')
    expect(extractHost(123)).toBe('')
    expect(extractHost('://not-a-url')).toBe('')
  })

  it('host с путём и без схемы', () => {
    expect(extractHost('chat.deepseek.com/login')).toBe('chat.deepseek.com')
  })
})

describe('detectAiProvider (Этап 1)', () => {
  it('chat.openai.com → openai', () => {
    expect(detectAiProvider('https://chat.openai.com/').id).toBe('openai')
  })

  it('chatgpt.com → openai (новый домен)', () => {
    expect(detectAiProvider('https://chatgpt.com/c/abc').id).toBe('openai')
  })

  it('chat.deepseek.com → deepseek', () => {
    expect(detectAiProvider('https://chat.deepseek.com/').id).toBe('deepseek')
  })

  it('claude.ai → anthropic', () => {
    expect(detectAiProvider('https://claude.ai/chat/123').id).toBe('anthropic')
  })

  it('giga.chat → gigachat', () => {
    expect(detectAiProvider('https://giga.chat/').id).toBe('gigachat')
  })

  it('поддомен → matches parent pattern', () => {
    expect(detectAiProvider('https://api.chat.openai.com/').id).toBe('openai')
  })

  it('неизвестный сайт → null', () => {
    expect(detectAiProvider('https://example.com/')).toBeNull()
    expect(detectAiProvider('https://google.com/')).toBeNull()
  })

  it('пустой / мусорный вход → null', () => {
    expect(detectAiProvider('')).toBeNull()
    expect(detectAiProvider(null)).toBeNull()
    expect(detectAiProvider(undefined)).toBeNull()
  })

  it('case insensitive', () => {
    expect(detectAiProvider('https://CHAT.OpenAI.com/').id).toBe('openai')
  })
})

describe('getProviderConfig (Этап 1)', () => {
  it('по известному id → конфиг', () => {
    const cfg = getProviderConfig('openai')
    expect(cfg).toBeTruthy()
    expect(cfg.id).toBe('openai')
    expect(cfg.defaultUrl).toContain('openai')
    expect(cfg.selectors.input).toBe('#prompt-textarea')
  })

  it('по неизвестному id → null', () => {
    expect(getProviderConfig('foo')).toBeNull()
    expect(getProviderConfig(null)).toBeNull()
    expect(getProviderConfig('')).toBeNull()
  })

  it('все 4 провайдера присутствуют', () => {
    expect(getProviderConfig('openai')).toBeTruthy()
    expect(getProviderConfig('deepseek')).toBeTruthy()
    expect(getProviderConfig('anthropic')).toBeTruthy()
    expect(getProviderConfig('gigachat')).toBeTruthy()
  })
})

describe('getDefaultSelectors (Этап 1)', () => {
  it('возвращает 4 ключевых селектора', () => {
    const s = getDefaultSelectors('openai')
    expect(s).toBeTruthy()
    expect(s.input).toBeTruthy()
    expect(s.submitButton).toBeTruthy()
    expect(s.lastAssistantMessage).toBeTruthy()
    expect(s.streamingIndicator).toBeTruthy()
  })

  it('null для неизвестного', () => {
    expect(getDefaultSelectors('foo')).toBeNull()
  })
})

describe('listProviderIds (Этап 1)', () => {
  it('возвращает все 4 id', () => {
    const ids = listProviderIds()
    expect(ids).toContain('openai')
    expect(ids).toContain('deepseek')
    expect(ids).toContain('anthropic')
    expect(ids).toContain('gigachat')
    expect(ids).toHaveLength(4)
  })
})

describe('DEFAULT_WEBVIEW_PROVIDERS — immutability', () => {
  it('массив frozen', () => {
    expect(Object.isFrozen(DEFAULT_WEBVIEW_PROVIDERS)).toBe(true)
  })

  it('каждый провайдер frozen', () => {
    for (const p of DEFAULT_WEBVIEW_PROVIDERS) {
      expect(Object.isFrozen(p)).toBe(true)
      expect(Object.isFrozen(p.selectors)).toBe(true)
      expect(Object.isFrozen(p.hostPatterns)).toBe(true)
    }
  })

  it('каждый провайдер имеет обязательные поля', () => {
    for (const p of DEFAULT_WEBVIEW_PROVIDERS) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.label).toBe('string')
      expect(typeof p.defaultUrl).toBe('string')
      expect(Array.isArray(p.hostPatterns)).toBe(true)
      expect(p.hostPatterns.length).toBeGreaterThan(0)
      expect(typeof p.selectors.input).toBe('string')
      expect(typeof p.selectors.submitButton).toBe('string')
      expect(typeof p.selectors.lastAssistantMessage).toBe('string')
      expect(typeof p.selectors.streamingIndicator).toBe('string')
    }
  })
})
