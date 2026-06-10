// v1.1.3: тесты multi-provider fallback.

import { describe, it, expect, vi } from 'vitest'
import {
  isFallbackWorthy,
  createCallProviderWithFallback,
  _internal,
} from './aiProviderFallback.js'

describe('isFallbackWorthy', () => {
  it('network errors → true', () => {
    expect(isFallbackWorthy(new Error('network error'))).toBe(true)
    expect(isFallbackWorthy(new Error('ECONNREFUSED'))).toBe(true)
    expect(isFallbackWorthy(new Error('fetch failed'))).toBe(true)
    expect(isFallbackWorthy(new Error('socket hang up'))).toBe(true)
    expect(isFallbackWorthy(new Error('timeout'))).toBe(true)
  })

  it('HTTP 5xx → true', () => {
    expect(isFallbackWorthy(new Error('callProvider: HTTP 500 — server error'))).toBe(true)
    expect(isFallbackWorthy(new Error('HTTP 503'))).toBe(true)
    expect(isFallbackWorthy(new Error('HTTP 599'))).toBe(true)
  })

  it('rate limit (429) → true', () => {
    expect(isFallbackWorthy(new Error('HTTP 429 too many requests'))).toBe(true)
    expect(isFallbackWorthy(new Error('Rate limit exceeded'))).toBe(true)
  })

  it('overloaded / service unavailable → true', () => {
    expect(isFallbackWorthy(new Error('Anthropic overloaded'))).toBe(true)
    expect(isFallbackWorthy(new Error('service unavailable'))).toBe(true)
  })

  it('HTTP 4xx (НЕ 429) → false (content/auth error — другой провайдер не поможет)', () => {
    expect(isFallbackWorthy(new Error('HTTP 400 bad request'))).toBe(false)
    expect(isFallbackWorthy(new Error('HTTP 401 unauthorized'))).toBe(false)
    expect(isFallbackWorthy(new Error('HTTP 403 forbidden'))).toBe(false)
  })

  it('null / undefined / пустая строка → false', () => {
    expect(isFallbackWorthy(null)).toBe(false)
    expect(isFallbackWorthy(undefined)).toBe(false)
    expect(isFallbackWorthy('')).toBe(false)
  })
})

describe('createCallProviderWithFallback', () => {
  it('throws если baseCallProvider не функция', () => {
    expect(() => createCallProviderWithFallback({ getProviderChain: () => [] })).toThrow(/baseCallProvider required/)
  })

  it('throws если getProviderChain не функция', () => {
    expect(() => createCallProviderWithFallback({ baseCallProvider: () => {} })).toThrow(/getProviderChain required/)
  })

  it('пустой chain → throw', async () => {
    const fn = createCallProviderWithFallback({
      baseCallProvider: vi.fn(),
      getProviderChain: () => [],
    })
    await expect(fn({ messages: [] })).rejects.toThrow(/no providers/)
  })

  it('1-й провайдер успешен → возвращает результат, 2-й не зван', async () => {
    const base = vi.fn().mockResolvedValue({ ok: true, data: 'from_anthropic' })
    const fn = createCallProviderWithFallback({
      baseCallProvider: base,
      getProviderChain: () => [{ provider: 'anthropic' }, { provider: 'openai' }],
    })
    const r = await fn({ messages: [{ role: 'user', content: 'hi' }] })
    expect(r.data).toBe('from_anthropic')
    expect(base).toHaveBeenCalledTimes(1)
    expect(base).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic' }))
  })

  it('1-й upal network error → 2-й вызван, успех', async () => {
    const base = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true, data: 'from_openai' })
    const onFallback = vi.fn()
    const fn = createCallProviderWithFallback({
      baseCallProvider: base,
      getProviderChain: () => [{ provider: 'anthropic' }, { provider: 'openai' }],
      onFallback,
    })
    const r = await fn({ messages: [] })
    expect(r.data).toBe('from_openai')
    expect(base).toHaveBeenCalledTimes(2)
    expect(base.mock.calls[0][0].provider).toBe('anthropic')
    expect(base.mock.calls[1][0].provider).toBe('openai')
    // onFallback вызван дважды: 1) retrying, 2) success после fallback
    expect(onFallback).toHaveBeenCalledTimes(2)
    expect(onFallback.mock.calls[0][3]).toBe('retrying')
    expect(onFallback.mock.calls[1][3]).toBe('success')
  })

  it('1-й upal с content error (HTTP 400) → НЕ пробуем 2-й, throw', async () => {
    const base = vi.fn().mockRejectedValueOnce(new Error('HTTP 400 bad request'))
    const fn = createCallProviderWithFallback({
      baseCallProvider: base,
      getProviderChain: () => [{ provider: 'anthropic' }, { provider: 'openai' }],
    })
    await expect(fn({ messages: [] })).rejects.toThrow(/HTTP 400/)
    expect(base).toHaveBeenCalledTimes(1)
  })

  it('все провайдеры упали worthy ошибками → throw с last error', async () => {
    const base = vi.fn()
      .mockRejectedValueOnce(new Error('network error 1'))
      .mockRejectedValueOnce(new Error('HTTP 503 unavailable'))
    const fn = createCallProviderWithFallback({
      baseCallProvider: base,
      getProviderChain: () => [{ provider: 'anthropic' }, { provider: 'openai' }],
    })
    // Поскольку 2-й (последний) тоже worthy но нет next — кидаем его error напрямую.
    await expect(fn({ messages: [] })).rejects.toThrow(/HTTP 503 unavailable/)
    expect(base).toHaveBeenCalledTimes(2)
  })

  it('AbortSignal aborted между retries → выход без следующего провайдера', async () => {
    const base = vi.fn().mockRejectedValueOnce(new Error('network'))
    const ac = new AbortController()
    const fn = createCallProviderWithFallback({
      baseCallProvider: base,
      getProviderChain: () => [{ provider: 'anthropic' }, { provider: 'openai' }],
    })
    // signal abort до 2-го вызова
    ac.abort()
    await expect(fn({ messages: [], signal: ac.signal })).rejects.toThrow(/aborted|network/)
  })

  it('пропускает entry без provider field', async () => {
    const base = vi.fn().mockResolvedValue({ ok: true })
    const fn = createCallProviderWithFallback({
      baseCallProvider: base,
      getProviderChain: () => [{ /* нет provider */ }, { provider: 'openai' }],
    })
    const r = await fn({ messages: [] })
    expect(r.ok).toBe(true)
    expect(base).toHaveBeenCalledTimes(1)
    expect(base.mock.calls[0][0].provider).toBe('openai')
  })

  it('model передаётся из chain entry', async () => {
    const base = vi.fn().mockResolvedValue({ ok: true })
    const fn = createCallProviderWithFallback({
      baseCallProvider: base,
      getProviderChain: () => [{ provider: 'anthropic', model: 'claude-opus' }],
    })
    await fn({ messages: [] })
    expect(base).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'anthropic',
      model: 'claude-opus',
    }))
  })

  it('messages/tools/signal пробрасываются', async () => {
    const base = vi.fn().mockResolvedValue({ ok: true })
    const fn = createCallProviderWithFallback({
      baseCallProvider: base,
      getProviderChain: () => [{ provider: 'anthropic' }],
    })
    const ac = new AbortController()
    const msgs = [{ role: 'user', content: 'hi' }]
    const tools = [{ name: 'x' }]
    await fn({ messages: msgs, tools, signal: ac.signal })
    expect(base).toHaveBeenCalledWith(expect.objectContaining({
      messages: msgs,
      tools,
      signal: ac.signal,
    }))
  })
})

describe('_internal', () => {
  it('isFallbackWorthy exported', () => {
    expect(typeof _internal.isFallbackWorthy).toBe('function')
  })
})
