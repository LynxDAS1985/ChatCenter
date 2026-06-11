// v1.1.18 (Этап 9): тесты fallback chain.

import { describe, it, expect, vi } from 'vitest'
import { createFallbackChain } from './fallbackChain.js'

const baseQuestion = {
  version: 1, text: 'hi', source: { messengerId: 'native_cc' },
}

function okAns(provider, text = 'ok') {
  return {
    version: 1, ok: true, text, providerId: provider, mode: 'api', latencyMs: 5,
  }
}
function errAns(provider, code, message = '', retryable = true) {
  return {
    version: 1, ok: false, text: '', providerId: provider, mode: 'api', latencyMs: 5,
    error: { code, message, retryable },
  }
}

function makeFactories({ apiBridge, localBridge, webUiBridge, callProvider } = {}) {
  return {
    createApiBridge: apiBridge ? (() => ({ ask: apiBridge })) : null,
    createLocalBridge: localBridge ? (() => ({ ask: localBridge })) : null,
    createWebUiBridge: webUiBridge ? (() => ({ ask: webUiBridge })) : null,
    callProvider: callProvider || vi.fn(),
  }
}

describe('createFallbackChain — валидация', () => {
  it('пустой steps → throw', () => {
    expect(() => createFallbackChain([], makeFactories())).toThrow(/steps/)
  })

  it('без factories → throw', () => {
    expect(() => createFallbackChain([{ mode: 'api' }])).toThrow(/factories/)
  })
})

describe('createFallbackChain — happy path', () => {
  it('первый шаг успешен → возврат сразу, без attempts в debug', async () => {
    const api = vi.fn().mockResolvedValue(okAns('anthropic', 'ответ Claude'))
    const chain = createFallbackChain(
      [{ mode: 'api', config: { providerId: 'anthropic' } }],
      makeFactories({ apiBridge: api })
    )
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('ответ Claude')
    expect(r.debug?.attemptedFallbacks).toBeUndefined()
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('первый retryable, второй ok → возврат второго + debug.attemptedFallbacks', async () => {
    const api1 = vi.fn().mockResolvedValue(errAns('anthropic', 'rate_limited', '429', true))
    const api2 = vi.fn().mockResolvedValue(okAns('openai', 'ChatGPT ответ'))
    // Используем разные bridge instances для разных шагов через DI
    let callCount = 0
    const factories = {
      createApiBridge: () => {
        callCount++
        return { ask: callCount === 1 ? api1 : api2 }
      },
      callProvider: vi.fn(),
    }
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
      { mode: 'api', config: { providerId: 'openai' } },
    ], factories)
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.providerId).toBe('openai')
    expect(r.debug.attemptedFallbacks).toHaveLength(1)
    expect(r.debug.attemptedFallbacks[0]).toMatchObject({ providerId: 'anthropic', errorCode: 'rate_limited' })
    expect(r.debug.successfulStepIndex).toBe(1)
  })

  it('все retryable упали → возврат последнего + exhausted=true', async () => {
    const ask = vi.fn()
      .mockResolvedValueOnce(errAns('anthropic', 'network_error', 'нет сети', true))
      .mockResolvedValueOnce(errAns('openai', 'server_error', '500', true))
    const factories = {
      createApiBridge: () => ({ ask }),
      callProvider: vi.fn(),
    }
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
      { mode: 'api', config: { providerId: 'openai' } },
    ], factories)
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(false)
    expect(r.providerId).toBe('openai')  // последний
    expect(r.debug.attemptedFallbacks).toHaveLength(2)
    expect(r.debug.exhausted).toBe(true)
  })
})

describe('createFallbackChain — non-retryable stop', () => {
  it('auth_required (НЕ missing key) → стоп, не пробуем следующий', async () => {
    const ask = vi.fn().mockResolvedValueOnce(errAns('anthropic', 'auth_required', 'неверный ключ', false))
    const ask2 = vi.fn()
    let c = 0
    const factories = {
      createApiBridge: () => ({ ask: ++c === 1 ? ask : ask2 }),
      callProvider: vi.fn(),
    }
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
      { mode: 'api', config: { providerId: 'openai' } },
    ], factories)
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('auth_required')
    expect(ask2).not.toHaveBeenCalled()
  })

  it('missing API key (auth_required + сообщение) → пробуем следующий', async () => {
    const ask1 = vi.fn().mockResolvedValue(errAns('anthropic', 'auth_required', 'missing API key for anthropic', false))
    const ask2 = vi.fn().mockResolvedValue(okAns('openai', 'OK'))
    let c = 0
    const factories = {
      createApiBridge: () => ({ ask: ++c === 1 ? ask1 : ask2 }),
      callProvider: vi.fn(),
    }
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
      { mode: 'api', config: { providerId: 'openai' } },
    ], factories)
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.providerId).toBe('openai')
  })

  it('aborted → стоп сразу', async () => {
    const ask = vi.fn().mockResolvedValue(errAns('anthropic', 'aborted', 'юзер отменил', false))
    const ask2 = vi.fn()
    let c = 0
    const factories = {
      createApiBridge: () => ({ ask: ++c === 1 ? ask : ask2 }),
      callProvider: vi.fn(),
    }
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
      { mode: 'api', config: { providerId: 'openai' } },
    ], factories)
    const r = await chain.ask(baseQuestion)
    expect(r.error.code).toBe('aborted')
    expect(ask2).not.toHaveBeenCalled()
  })

  it('unsupported_mode → стоп', async () => {
    const ask = vi.fn().mockResolvedValue(errAns('xxx', 'unsupported_mode', 'не поддерживается', false))
    const ask2 = vi.fn()
    let c = 0
    const factories = {
      createApiBridge: () => ({ ask: ++c === 1 ? ask : ask2 }),
      callProvider: vi.fn(),
    }
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
      { mode: 'api', config: { providerId: 'openai' } },
    ], factories)
    const r = await chain.ask(baseQuestion)
    expect(r.error.code).toBe('unsupported_mode')
    expect(ask2).not.toHaveBeenCalled()
  })
})

describe('createFallbackChain — смешанные modes', () => {
  it('api → local: api упал, local ok', async () => {
    const api = vi.fn().mockResolvedValue(errAns('anthropic', 'network_error', 'нет сети', true))
    const local = vi.fn().mockResolvedValue({
      ...okAns('local', 'локальный ответ'), mode: 'local',
    })
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
      { mode: 'local', config: { baseUrl: 'http://127.0.0.1:11434' } },
    ], makeFactories({ apiBridge: api, localBridge: local, callProvider: vi.fn() }))
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.providerId).toBe('local')
  })

  it('api → webui: api упал, webui ok', async () => {
    const api = vi.fn().mockResolvedValue(errAns('openai', 'rate_limited', '429', true))
    const webui = vi.fn().mockResolvedValue({
      ...okAns('openai', 'webui ответ'), mode: 'webui',
    })
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'openai' } },
      { mode: 'webui', config: { providerId: 'openai' } },
    ], makeFactories({ apiBridge: api, webUiBridge: webui, callProvider: vi.fn() }))
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.mode).toBe('webui')
  })

  it('step без providerId для api → unsupported_mode и переход к следующему', async () => {
    const api = vi.fn().mockResolvedValue(okAns('openai'))
    const factories = makeFactories({ apiBridge: api, callProvider: vi.fn() })
    const chain = createFallbackChain([
      { mode: 'api', config: {} },  // нет providerId
      { mode: 'api', config: { providerId: 'openai' } },
    ], factories)
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.debug.attemptedFallbacks[0].errorCode).toBe('unsupported_mode')
  })
})

describe('createFallbackChain — отмена через signal', () => {
  it('signal.aborted=true перед попыткой → возврат aborted', async () => {
    const api = vi.fn()
    const ac = new AbortController()
    ac.abort()
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
    ], makeFactories({ apiBridge: api, callProvider: vi.fn() }))
    const r = await chain.ask({ ...baseQuestion, signal: ac.signal })
    expect(r.error.code).toBe('aborted')
    expect(api).not.toHaveBeenCalled()
  })
})

describe('createFallbackChain — bridge throws', () => {
  it('throw из ask → конвертируется в AiBridgeAnswer{ok:false} и пробуется следующий', async () => {
    const ask1 = vi.fn().mockRejectedValue(new Error('что-то сломалось'))
    const ask2 = vi.fn().mockResolvedValue(okAns('openai', 'ok'))
    let c = 0
    const factories = {
      createApiBridge: () => ({ ask: ++c === 1 ? ask1 : ask2 }),
      callProvider: vi.fn(),
    }
    const chain = createFallbackChain([
      { mode: 'api', config: { providerId: 'anthropic' } },
      { mode: 'api', config: { providerId: 'openai' } },
    ], factories)
    const r = await chain.ask(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.debug.attemptedFallbacks[0].errorCode).toBe('unknown')
  })
})
