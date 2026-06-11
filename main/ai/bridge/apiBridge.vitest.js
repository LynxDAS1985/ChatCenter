// v1.2.0 (Этап 3): тесты API Bridge.
// Используем DI через `deps.callProvider` — никаких сетевых вызовов.

import { describe, it, expect, vi } from 'vitest'
import { createApiBridge } from './apiBridge.js'

const baseQuestion = {
  version: 1,
  text: 'Привет!',
  source: { messengerId: 'native_cc' },
}

function mockAnthropicResponse(text = 'Здравствуйте!') {
  return {
    id: 'msg_1',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
  }
}

function mockOpenAIResponse(text = 'Hi!') {
  return {
    id: 'chatcmpl-1',
    model: 'gpt-4o-mini',
    choices: [{ message: { role: 'assistant', content: text } }],
  }
}

describe('createApiBridge — validation', () => {
  it('throws без providerId', () => {
    expect(() => createApiBridge({}, { callProvider: () => {} })).toThrow(/providerId required/)
  })

  it('throws без callProvider', () => {
    expect(() => createApiBridge({ providerId: 'openai' }, {})).toThrow(/callProvider required/)
  })
})

describe('createApiBridge — happy path Anthropic', () => {
  it('успешный ответ → ok:true + parsed text', async () => {
    const callProvider = vi.fn().mockResolvedValue(mockAnthropicResponse('Тест ОК'))
    const bridge = createApiBridge({ providerId: 'anthropic' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('Тест ОК')
    expect(r.providerId).toBe('anthropic')
    expect(r.mode).toBe('api')
    expect(typeof r.latencyMs).toBe('number')
    expect(r.model).toBe('claude-haiku-4-5-20251001')
  })

  it('callProvider вызван с правильным провайдером и моделью', async () => {
    const callProvider = vi.fn().mockResolvedValue(mockAnthropicResponse())
    const bridge = createApiBridge({ providerId: 'anthropic', model: 'claude-opus-4-8' }, { callProvider })
    await bridge.ask(baseQuestion)
    expect(callProvider).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
    }))
  })

  it('Anthropic: пропускает не-text блоки', async () => {
    const callProvider = vi.fn().mockResolvedValue({
      content: [
        { type: 'tool_use', name: 'x', input: {} },
        { type: 'text', text: 'После tool' },
      ],
    })
    const bridge = createApiBridge({ providerId: 'anthropic' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.text).toBe('После tool')
  })
})

describe('createApiBridge — happy path OpenAI / DeepSeek / GigaChat', () => {
  for (const provider of ['openai', 'deepseek', 'gigachat']) {
    it(`${provider}: choices[0].message.content`, async () => {
      const callProvider = vi.fn().mockResolvedValue(mockOpenAIResponse(provider + ' ответ'))
      const bridge = createApiBridge({ providerId: provider }, { callProvider })
      const r = await bridge.ask(baseQuestion)
      expect(r.ok).toBe(true)
      expect(r.text).toBe(provider + ' ответ')
      expect(r.providerId).toBe(provider)
    })
  }
})

describe('createApiBridge — messages структура', () => {
  it('text question → один user message', async () => {
    const callProvider = vi.fn().mockResolvedValue(mockOpenAIResponse())
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    await bridge.ask({ ...baseQuestion, text: 'Один' })
    expect(callProvider.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'Один' },
    ])
  })

  it('systemPrompt → первый system message', async () => {
    const callProvider = vi.fn().mockResolvedValue(mockOpenAIResponse())
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    await bridge.ask({ ...baseQuestion, systemPrompt: 'Ты помощник' })
    expect(callProvider.mock.calls[0][0].messages[0]).toEqual({ role: 'system', content: 'Ты помощник' })
  })

  it('history → правильный порядок (system → history → user)', async () => {
    const callProvider = vi.fn().mockResolvedValue(mockOpenAIResponse())
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    await bridge.ask({
      ...baseQuestion,
      systemPrompt: 'sys',
      history: [
        { role: 'user', text: 'h1' },
        { role: 'assistant', text: 'a1' },
      ],
    })
    expect(callProvider.mock.calls[0][0].messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'h1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'Привет!' },
    ])
  })

  it('невалидные history turn-ы игнорируются', async () => {
    const callProvider = vi.fn().mockResolvedValue(mockOpenAIResponse())
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    await bridge.ask({
      ...baseQuestion,
      history: [null, { role: 'user' }, { role: 'user', text: 'OK' }],
    })
    const msgs = callProvider.mock.calls[0][0].messages
    expect(msgs.find(m => m.content === 'OK')).toBeTruthy()
    expect(msgs.length).toBe(2)  // 1 валидный history + 1 финальный
  })
})

describe('createApiBridge — error mapping', () => {
  it('callProvider missing API key → auth_required', async () => {
    const callProvider = vi.fn().mockRejectedValue(new Error('callProvider: missing API key for anthropic'))
    const bridge = createApiBridge({ providerId: 'anthropic' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('auth_required')
  })

  it('HTTP 401 → auth_required', async () => {
    const callProvider = vi.fn().mockRejectedValue(new Error('callProvider: HTTP 401 — Unauthorized'))
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('auth_required')
  })

  it('HTTP 429 → rate_limited + retryable', async () => {
    const callProvider = vi.fn().mockRejectedValue(new Error('callProvider: HTTP 429 — Too Many Requests'))
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('rate_limited')
    expect(r.error.retryable).toBe(true)
  })

  it('HTTP 500 → server_error + retryable', async () => {
    const callProvider = vi.fn().mockRejectedValue(new Error('callProvider: HTTP 500 — Server crashed'))
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('server_error')
    expect(r.error.retryable).toBe(true)
  })

  it('HTTP 400 → config_invalid', async () => {
    const callProvider = vi.fn().mockRejectedValue(new Error('callProvider: HTTP 400 — Bad request'))
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('config_invalid')
  })

  it('network error → network_error + retryable', async () => {
    const callProvider = vi.fn().mockRejectedValue(new Error('callProvider: network error — ENOTFOUND'))
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('network_error')
    expect(r.error.retryable).toBe(true)
  })

  it('unknown error → unknown code', async () => {
    const callProvider = vi.fn().mockRejectedValue(new Error('something weird'))
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('unknown')
    expect(r.error.message).toContain('something weird')
  })

  it('пустой content → no_answer', async () => {
    const callProvider = vi.fn().mockResolvedValue({ content: [] })
    const bridge = createApiBridge({ providerId: 'anthropic' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('no_answer')
  })

  it('OpenAI пустой choices → no_answer', async () => {
    const callProvider = vi.fn().mockResolvedValue({ choices: [] })
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('no_answer')
  })
})

describe('createApiBridge — timeout / abort', () => {
  it('собственный timeout → streaming_timeout (retryable)', async () => {
    // callProvider никогда не резолвится
    const callProvider = vi.fn(() => new Promise(() => {}))
    const bridge = createApiBridge({ providerId: 'openai', timeoutMs: 30 }, { callProvider })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('streaming_timeout')
    expect(r.error.retryable).toBe(true)
  })

  it('signal уже aborted → aborted сразу', async () => {
    const ac = new AbortController()
    ac.abort()
    const callProvider = vi.fn(() => new Promise(() => {}))
    const bridge = createApiBridge({ providerId: 'openai' }, { callProvider })
    const r = await bridge.ask({ ...baseQuestion, signal: ac.signal })
    expect(r.error.code).toBe('aborted')
    expect(callProvider).not.toHaveBeenCalled()
  })

  it('signal abort в процессе → aborted', async () => {
    const ac = new AbortController()
    const callProvider = vi.fn(() => new Promise(() => {}))
    const bridge = createApiBridge({ providerId: 'openai', timeoutMs: 60000 }, { callProvider })
    const p = bridge.ask({ ...baseQuestion, signal: ac.signal })
    setTimeout(() => ac.abort(), 10)
    const r = await p
    expect(r.error.code).toBe('aborted')
  })
})

describe('createApiBridge — все 4 провайдера регистрируются', () => {
  for (const id of ['anthropic', 'openai', 'deepseek', 'gigachat']) {
    it(`providerId=${id} принимается`, () => {
      const bridge = createApiBridge({ providerId: id }, { callProvider: vi.fn() })
      expect(typeof bridge.ask).toBe('function')
    })
  }
})
