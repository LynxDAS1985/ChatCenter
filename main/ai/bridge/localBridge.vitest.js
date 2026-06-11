// v1.2.0 (Этап 2): тесты Local Bridge (Ollama HTTP).
// Используем DI через `deps.fetch` — никаких сетевых вызовов.

import { describe, it, expect, vi } from 'vitest'
import { createLocalBridge } from './localBridge.js'

const baseQuestion = {
  version: 1,
  text: 'Привет!',
  source: { messengerId: 'native_cc' },
}

function okResponse(data = { message: { content: 'Здравствуйте!' }, model: 'llama3.1' }) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  }
}

function errResponse(status, body = '') {
  return {
    ok: false,
    status,
    statusText: status === 404 ? 'Not Found' : 'Internal Server Error',
    json: vi.fn().mockResolvedValue(null),
    text: vi.fn().mockResolvedValue(body),
  }
}

describe('createLocalBridge — happy path', () => {
  it('успешный ответ → ok:true + text + providerId=local + mode=local', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    const r = await bridge.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('Здравствуйте!')
    expect(r.providerId).toBe('local')
    expect(r.mode).toBe('local')
    expect(r.version).toBe(1)
    expect(typeof r.latencyMs).toBe('number')
  })

  it('URL вызова — baseUrl + /api/chat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({ baseUrl: 'http://my-ollama:9999' }, { fetch: fetchMock })
    await bridge.ask(baseQuestion)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://my-ollama:9999/api/chat',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('default baseUrl = 127.0.0.1:11434', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    await bridge.ask(baseQuestion)
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat')
  })

  it('trailing slash в baseUrl стрипится', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({ baseUrl: 'http://x/' }, { fetch: fetchMock })
    await bridge.ask(baseQuestion)
    expect(fetchMock.mock.calls[0][0]).toBe('http://x/api/chat')
  })
})

describe('createLocalBridge — body структура', () => {
  it('body — JSON с model + messages + stream:false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({ model: 'qwen2.5' }, { fetch: fetchMock })
    await bridge.ask(baseQuestion)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('qwen2.5')
    expect(body.stream).toBe(false)
    expect(Array.isArray(body.messages)).toBe(true)
  })

  it('messages — последний user с question.text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    await bridge.ask({ ...baseQuestion, text: 'Тест' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    const last = body.messages[body.messages.length - 1]
    expect(last).toEqual({ role: 'user', content: 'Тест' })
  })

  it('systemPrompt добавляется первым', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    await bridge.ask({ ...baseQuestion, systemPrompt: 'Ты помощник.' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Ты помощник.' })
  })

  it('history добавляется между system и финальным user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    await bridge.ask({
      ...baseQuestion,
      history: [
        { role: 'user', text: 'Прошлый вопрос' },
        { role: 'assistant', text: 'Прошлый ответ' },
      ],
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages).toHaveLength(3)
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Прошлый вопрос' })
    expect(body.messages[1]).toEqual({ role: 'assistant', content: 'Прошлый ответ' })
    expect(body.messages[2].role).toBe('user')
  })

  it('history с невалидными turn-ами игнорируется', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    await bridge.ask({
      ...baseQuestion,
      history: [null, { role: 'user' }, { role: 'user', text: 'OK' }],
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages.filter(m => m.role !== 'user' || m.content !== '').length).toBeGreaterThan(0)
    expect(body.messages.find(m => m.content === 'OK')).toBeTruthy()
  })
})

describe('createLocalBridge — ошибки', () => {
  it('HTTP 404 → config_invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(404, 'model not found'))
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    const r = await bridge.ask(baseQuestion)
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('config_invalid')
    expect(r.error.message).toContain('404')
  })

  it('HTTP 500 → server_error + retryable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(500, 'OOM'))
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('server_error')
    expect(r.error.retryable).toBe(true)
  })

  it('пустой ответ → no_answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ message: { content: '' } }))
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('no_answer')
  })

  it('ECONNREFUSED (Ollama не запущена) → network_error + retryable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new Error('fetch failed: ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('network_error')
    expect(r.error.retryable).toBe(true)
    expect(r.error.message).toContain('Ollama не запущена')
  })

  it('fetch undefined → config_invalid', async () => {
    // Bridge должен быть создан ПОСЛЕ обнуления globalThis.fetch,
    // потому что fetchImpl фиксируется при создании.
    const saved = globalThis.fetch
    globalThis.fetch = undefined
    try {
      const bridge = createLocalBridge({}, { fetch: undefined })
      const r = await bridge.ask(baseQuestion)
      expect(r.error.code).toBe('config_invalid')
    } finally {
      globalThis.fetch = saved
    }
  })

  it('старый формат /api/generate (response field) тоже парсится', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ response: 'Старый формат' }))
    const bridge = createLocalBridge({}, { fetch: fetchMock })
    const r = await bridge.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('Старый формат')
  })
})

describe('createLocalBridge — timeout / abort', () => {
  it('собственный timeout → streaming_timeout', async () => {
    const fetchMock = vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    }))
    const bridge = createLocalBridge({ timeoutMs: 30 }, { fetch: fetchMock })
    const r = await bridge.ask(baseQuestion)
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('streaming_timeout')
  })

  it('внешний AbortSignal → aborted', async () => {
    const fetchMock = vi.fn((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    }))
    const externalController = new AbortController()
    const bridge = createLocalBridge({ timeoutMs: 60000 }, { fetch: fetchMock })
    const p = bridge.ask({ ...baseQuestion, signal: externalController.signal })
    externalController.abort()
    const r = await p
    expect(r.error.code).toBe('aborted')
  })
})
