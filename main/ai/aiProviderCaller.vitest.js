// v0.99.1 (Phase 3.5): тесты aiProviderCaller.
// v1.1.4: + тесты ГигаЧат tool use (OAuth + SSL bypass + functions API).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// v1.1.4: mock gigachat utils ДО импорта aiProviderCaller (vi.hoisted порядок).
const { mockHttpsPostSkipSsl, mockGetGigaChatToken } = vi.hoisted(() => ({
  mockHttpsPostSkipSsl: vi.fn(),
  mockGetGigaChatToken: vi.fn(),
}))

vi.mock('../utils/gigachat.js', () => ({
  httpsPostSkipSsl: mockHttpsPostSkipSsl,
  getGigaChatToken: mockGetGigaChatToken,
  GIGACHAT_CHAT_URL: 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions',
}))

import { createCallProvider, _internal } from './aiProviderCaller.js'

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  globalThis.fetch = fetchMock
  mockHttpsPostSkipSsl.mockReset()
  mockGetGigaChatToken.mockReset()
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
          gigachat: { apiKey: 'gc-client-id', clientSecret: 'gc-client-secret' },
        },
      }
    }
    return fallback
  },
}

const storageWithoutGigachatSecret = {
  get: () => ({ aiProviderKeys: { gigachat: { apiKey: 'gc-client-id' /* no secret */ } } }),
}

const storageEmptyGigachat = {
  get: () => ({ aiProviderKeys: {} }),
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

  // v0.99.1: ГигаЧат был unsupported.
  // v1.1.4: ГигаЧат поддерживается, тесты в отдельном describe «ГигаЧат (v1.1.4)».
  // Здесь — проверяем что unknown provider всё ещё throw.
  it('unknown provider → throw', async () => {
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ provider: 'unknown_xx', messages: [] })).rejects.toThrow(/unsupported provider/)
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
    expect(_internal.DEFAULT_MODELS.gigachat).toBe('GigaChat')
  })

  it('callGigaChat экспортирован в _internal', () => {
    expect(typeof _internal.callGigaChat).toBe('function')
  })
})

// v1.1.4: ГигаЧат tool use
describe('createCallProvider — ГигаЧат (v1.1.4)', () => {
  it('успешный вызов с tools → functions/function_call:auto + Bearer token', async () => {
    mockGetGigaChatToken.mockResolvedValueOnce('mock-access-token-123')
    mockHttpsPostSkipSsl.mockResolvedValueOnce({
      ok: true,
      data: { choices: [{ message: { content: 'Привет!' }, finish_reason: 'stop' }] },
    })

    const callProvider = createCallProvider({ storage: fakeStorage })
    const r = await callProvider({
      provider: 'gigachat',
      messages: [{ role: 'user', content: 'тест' }],
      tools: [{ name: 'get_chat_history', description: 'История', parameters: {} }],
    })

    expect(r.choices[0].message.content).toBe('Привет!')
    expect(mockGetGigaChatToken).toHaveBeenCalledWith('gc-client-id', 'gc-client-secret')
    expect(mockHttpsPostSkipSsl).toHaveBeenCalledTimes(1)
    const [url, bodyStr, headers] = mockHttpsPostSkipSsl.mock.calls[0]
    expect(url).toContain('gigachat.devices.sberbank.ru')
    expect(headers.Authorization).toBe('Bearer mock-access-token-123')
    expect(headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(bodyStr)
    expect(body.functions).toEqual([{ name: 'get_chat_history', description: 'История', parameters: {} }])
    expect(body.function_call).toBe('auto')
    expect(body.model).toBe('GigaChat')  // DEFAULT
  })

  it('без tools — НЕ передаём functions/function_call в body', async () => {
    mockGetGigaChatToken.mockResolvedValueOnce('tok')
    mockHttpsPostSkipSsl.mockResolvedValueOnce({ ok: true, data: { choices: [{ message: { content: 'ok' } }] } })

    const callProvider = createCallProvider({ storage: fakeStorage })
    await callProvider({ provider: 'gigachat', messages: [{ role: 'user', content: 'hi' }] })

    const body = JSON.parse(mockHttpsPostSkipSsl.mock.calls[0][1])
    expect(body.functions).toBeUndefined()
    expect(body.function_call).toBeUndefined()
  })

  it('system prompt извлекается из messages[0] и отправляется первым в body.messages', async () => {
    mockGetGigaChatToken.mockResolvedValueOnce('tok')
    mockHttpsPostSkipSsl.mockResolvedValueOnce({ ok: true, data: { choices: [{ message: { content: 'ok' } }] } })

    const callProvider = createCallProvider({ storage: fakeStorage })
    await callProvider({
      provider: 'gigachat',
      messages: [
        { role: 'system', content: 'Ты помощник' },
        { role: 'user', content: 'привет' },
      ],
    })

    const body = JSON.parse(mockHttpsPostSkipSsl.mock.calls[0][1])
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Ты помощник' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'привет' })
  })

  it('кастомная модель → передаётся в body.model', async () => {
    mockGetGigaChatToken.mockResolvedValueOnce('tok')
    mockHttpsPostSkipSsl.mockResolvedValueOnce({ ok: true, data: { choices: [{ message: { content: 'ok' } }] } })

    const callProvider = createCallProvider({ storage: fakeStorage })
    await callProvider({ provider: 'gigachat', model: 'GigaChat-Pro', messages: [] })

    const body = JSON.parse(mockHttpsPostSkipSsl.mock.calls[0][1])
    expect(body.model).toBe('GigaChat-Pro')
  })

  it('нет clientId → throw', async () => {
    const callProvider = createCallProvider({ storage: storageEmptyGigachat })
    await expect(callProvider({ provider: 'gigachat', messages: [] }))
      .rejects.toThrow(/needs both clientId.*clientSecret/)
    expect(mockGetGigaChatToken).not.toHaveBeenCalled()
  })

  it('нет clientSecret → throw', async () => {
    const callProvider = createCallProvider({ storage: storageWithoutGigachatSecret })
    await expect(callProvider({ provider: 'gigachat', messages: [] }))
      .rejects.toThrow(/needs both clientId.*clientSecret/)
    expect(mockGetGigaChatToken).not.toHaveBeenCalled()
  })

  it('OAuth fail → throw с явным сообщением', async () => {
    mockGetGigaChatToken.mockRejectedValueOnce(new Error('auth failed'))
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ provider: 'gigachat', messages: [] }))
      .rejects.toThrow(/gigachat OAuth failed.*auth failed/)
  })

  it('HTTP error (ok:false) → throw с кодом и message', async () => {
    mockGetGigaChatToken.mockResolvedValueOnce('tok')
    mockHttpsPostSkipSsl.mockResolvedValueOnce({
      ok: false,
      data: { error: { code: 429, message: 'Too many requests' } },
    })
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ provider: 'gigachat', messages: [] }))
      .rejects.toThrow(/gigachat HTTP 429.*Too many requests/)
  })

  it('network error (throws) → понятное сообщение', async () => {
    mockGetGigaChatToken.mockResolvedValueOnce('tok')
    mockHttpsPostSkipSsl.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ provider: 'gigachat', messages: [] }))
      .rejects.toThrow(/gigachat: network error.*ECONNREFUSED/)
  })

  it('trim() применяется к clientId/Secret (защита от случайных пробелов)', async () => {
    const storageSpaces = {
      get: () => ({ aiProviderKeys: { gigachat: { apiKey: '  gc-id  ', clientSecret: '  gc-secret  ' } } }),
    }
    mockGetGigaChatToken.mockResolvedValueOnce('tok')
    mockHttpsPostSkipSsl.mockResolvedValueOnce({ ok: true, data: { choices: [{ message: { content: 'x' } }] } })

    const callProvider = createCallProvider({ storage: storageSpaces })
    await callProvider({ provider: 'gigachat', messages: [] })

    expect(mockGetGigaChatToken).toHaveBeenCalledWith('gc-id', 'gc-secret')
  })

  it('unsupported provider — сообщение без упоминания "ГигаЧат не поддерживается"', async () => {
    const callProvider = createCallProvider({ storage: fakeStorage })
    await expect(callProvider({ provider: 'evil_provider', messages: [] }))
      .rejects.toThrow(/unsupported provider "evil_provider"/)
  })
})
