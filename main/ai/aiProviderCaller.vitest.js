// v0.99.1 (Phase 3.5): тесты aiProviderCaller.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCallProvider, _internal } from './aiProviderCaller.js'

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  globalThis.fetch = fetchMock
})
afterEach(() => {
  delete globalThis.fetch
})

const fakeStorage = {
  get: (key, fallback) => {
    if (key === 'settings') {
      return {
        aiProviderKeys: {
          anthropic: { apiKey: 'sk-ant-test-key' },
          openai: { apiKey: 'sk-openai-test' },
          deepseek: { apiKey: 'sk-ds-test' },
        },
      }
    }
    return fallback
  },
}

describe('createCallProvider — Anthropic', () => {
  it('успешный вызов Anthropic', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    })
    const callProvider = createCallProvider({ storage: fakeStorage })
    const r = await callProvider({
      provider: 'anthropic',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    })
    expect(r.content[0].text).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test-key',
          'anthropic-version': '2023-06-01',
        }),
      })
    )
  })

  it('system prompt извлекается из messages[0]', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ content: [] }) })
    const callProvider = createCallProvider({ storage: fakeStorage })
    await callProvider({
      provider: 'anthropic',
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'hi' },
      ],
    })
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(callBody.system).toBe('You are helpful')
    expect(callBody.messages).toHaveLength(1)
    expect(callBody.messages[0].role).toBe('user')
  })
})

describe('createCallProvider — OpenAI / DeepSeek', () => {
  it('OpenAI: tools в body, Bearer auth', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })
    const callProvider = createCallProvider({ storage: fakeStorage })
    const r = await callProvider({
      provider: 'openai',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'test', parameters: {} } }],
    })
    expect(r.choices[0].message.content).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-openai-test',
        }),
      })
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.tools).toHaveLength(1)
  })

  it('DeepSeek: использует deepseek endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: {} }] }) })
    const callProvider = createCallProvider({ storage: fakeStorage })
    await callProvider({
      provider: 'deepseek',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.anything()
    )
  })
})

describe('createCallProvider — ошибки', () => {
  it('missing provider → throw', async () => {
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ messages: [] })).rejects.toThrow(/missing provider/)
  })

  it('unsupported provider (gigachat) → throw', async () => {
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ provider: 'gigachat', messages: [] })).rejects.toThrow(/unsupported provider/)
  })

  it('missing API key → throw', async () => {
    const emptyStorage = { get: () => ({}) }
    const callProvider = createCallProvider({ storage: emptyStorage })
    await expect(callProvider({ provider: 'anthropic', messages: [] })).rejects.toThrow(/missing API key/)
  })

  it('HTTP 500 → throw с описанием', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    })
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ provider: 'anthropic', messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow(/HTTP 500/)
  })

  it('network error → throw', async () => {
    fetchMock.mockRejectedValue(new Error('Network failure'))
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ provider: 'anthropic', messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow(/network error/)
  })
})

describe('createCallProvider — internal config', () => {
  it('ENDPOINTS содержит anthropic/openai/deepseek', () => {
    expect(_internal.ENDPOINTS.anthropic).toContain('api.anthropic.com')
    expect(_internal.ENDPOINTS.openai).toContain('api.openai.com')
    expect(_internal.ENDPOINTS.deepseek).toContain('api.deepseek.com')
  })

  it('DEFAULT_MODELS заполнены', () => {
    expect(_internal.DEFAULT_MODELS.anthropic).toMatch(/claude/)
    expect(_internal.DEFAULT_MODELS.openai).toMatch(/gpt/)
    expect(_internal.DEFAULT_MODELS.deepseek).toMatch(/deepseek/)
  })
})
