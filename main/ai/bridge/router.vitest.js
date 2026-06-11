// v1.2.0-alpha.1 (Этап 1): тесты router-каркаса.

import { describe, it, expect, vi } from 'vitest'
import { createAiBridgeRouter } from './router.js'

const baseQuestion = {
  version: 1,
  text: 'hello',
  source: { messengerId: 'native_cc' },
}

describe('createAiBridgeRouter (Этап 1)', () => {
  it('mode=local без deps → unsupported_mode', async () => {
    const router = createAiBridgeRouter('local')
    const r = await router.ask(baseQuestion)
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('unsupported_mode')
    expect(r.mode).toBe('local')
    expect(typeof r.latencyMs).toBe('number')
  })

  it('mode=api без deps → unsupported_mode', async () => {
    const router = createAiBridgeRouter('api')
    const r = await router.ask(baseQuestion)
    expect(r.error.code).toBe('unsupported_mode')
  })

  it('mode=webui без deps → unsupported_mode', async () => {
    const router = createAiBridgeRouter('webui')
    const r = await router.ask(baseQuestion)
    expect(r.error.code).toBe('unsupported_mode')
  })

  it('mode=local с deps.localBridge → bridge.ask вызван', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true, text: 'pong' })
    const router = createAiBridgeRouter('local', { localBridge: { ask: fake } })
    const r = await router.ask(baseQuestion)
    expect(fake).toHaveBeenCalledWith(baseQuestion)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('pong')
  })

  it('mode=api маршрутизируется в apiBridge, не в local', async () => {
    const localFake = vi.fn().mockResolvedValue({ ok: true, text: 'local' })
    const apiFake = vi.fn().mockResolvedValue({ ok: true, text: 'api' })
    const router = createAiBridgeRouter('api', {
      localBridge: { ask: localFake },
      apiBridge: { ask: apiFake },
    })
    const r = await router.ask(baseQuestion)
    expect(apiFake).toHaveBeenCalled()
    expect(localFake).not.toHaveBeenCalled()
    expect(r.text).toBe('api')
  })

  it('bridge.ask throws → ловится и возвращается AiBridgeAnswer{ok:false, code:unknown}', async () => {
    const fake = vi.fn().mockRejectedValue(new Error('boom'))
    const router = createAiBridgeRouter('local', { localBridge: { ask: fake } })
    const r = await router.ask(baseQuestion)
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('unknown')
    expect(r.error.message).toBe('boom')
  })

  it('unknown mode → unsupported_mode', async () => {
    const router = createAiBridgeRouter('xyz')
    const r = await router.ask(baseQuestion)
    expect(r.error.code).toBe('unsupported_mode')
  })

  it('latencyMs >= 0 даже на error', async () => {
    const router = createAiBridgeRouter('local')
    const r = await router.ask(baseQuestion)
    expect(r.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
