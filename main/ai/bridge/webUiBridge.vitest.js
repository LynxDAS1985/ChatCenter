// v1.2.0 (Этап 4): тесты WebUI Bridge.
// Без реального webContents — используем fake с send + on.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createWebUiBridge,
  registerWebview,
  deliverAnswer,
  deliverError,
  clearWebUiBridgeState,
} from './webUiBridge.js'

const baseQuestion = {
  version: 1,
  text: 'Привет!',
  source: { messengerId: 'native_cc' },
}

beforeEach(() => {
  clearWebUiBridgeState()
})

function makeWebContents() {
  return { send: vi.fn() }
}

describe('createWebUiBridge — validation', () => {
  it('throws без providerId', () => {
    expect(() => createWebUiBridge({})).toThrow(/providerId required/)
  })

  it('возвращает {ask} с правильным providerId', () => {
    const b = createWebUiBridge({ providerId: 'openai' })
    expect(typeof b.ask).toBe('function')
  })
})

describe('createWebUiBridge — webview не зарегистрирован', () => {
  it('mode=webui без registerWebview → config_invalid', async () => {
    const bridge = createWebUiBridge({ providerId: 'openai' })
    const r = await bridge.ask(baseQuestion)
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('config_invalid')
    expect(r.error.message).toContain('не открыт')
  })
})

describe('createWebUiBridge — happy path', () => {
  it('inject отправляется в webContents, ответ доставляется через deliverAnswer', async () => {
    const wc = makeWebContents()
    registerWebview('openai', wc)
    const bridge = createWebUiBridge({ providerId: 'openai' })

    const askPromise = bridge.ask(baseQuestion)

    // Проверить что webContents.send вызван с правильным каналом
    await new Promise(r => setTimeout(r, 0))
    expect(wc.send).toHaveBeenCalledWith('ai-bridge:webui:inject', expect.objectContaining({
      questionId: expect.stringMatching(/^q_\d+_\d+$/),
      text: 'Привет!',
    }))

    // Извлечь questionId из переданного payload
    const payload = wc.send.mock.calls[0][1]
    deliverAnswer({ provider: 'openai', questionId: payload.questionId, text: 'Ответ от AI' })

    const r = await askPromise
    expect(r.ok).toBe(true)
    expect(r.text).toBe('Ответ от AI')
    expect(r.providerId).toBe('openai')
    expect(r.mode).toBe('webui')
  })

  it('custom selectors прокидываются в inject', async () => {
    const wc = makeWebContents()
    registerWebview('deepseek', wc)
    const customSelectors = { input: '#my-input' }
    const bridge = createWebUiBridge({ providerId: 'deepseek', selectors: customSelectors })

    const askPromise = bridge.ask(baseQuestion)
    await new Promise(r => setTimeout(r, 0))
    expect(wc.send.mock.calls[0][1].selectors).toEqual(customSelectors)

    const id = wc.send.mock.calls[0][1].questionId
    deliverAnswer({ provider: 'deepseek', questionId: id, text: 'OK' })
    await askPromise
  })
})

describe('createWebUiBridge — ошибки', () => {
  it('deliverError → AiBridgeAnswer с правильным error', async () => {
    const wc = makeWebContents()
    registerWebview('openai', wc)
    const bridge = createWebUiBridge({ providerId: 'openai' })

    const askPromise = bridge.ask(baseQuestion)
    await new Promise(r => setTimeout(r, 0))
    const id = wc.send.mock.calls[0][1].questionId
    deliverError({
      provider: 'openai',
      questionId: id,
      code: 'input_not_found',
      message: 'не найден textarea',
    })

    const r = await askPromise
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('input_not_found')
    expect(r.error.message).toContain('не найден textarea')
  })

  it('пустой ответ → no_answer', async () => {
    const wc = makeWebContents()
    registerWebview('openai', wc)
    const bridge = createWebUiBridge({ providerId: 'openai' })

    const askPromise = bridge.ask(baseQuestion)
    await new Promise(r => setTimeout(r, 0))
    const id = wc.send.mock.calls[0][1].questionId
    deliverAnswer({ provider: 'openai', questionId: id, text: '' })

    const r = await askPromise
    expect(r.error.code).toBe('no_answer')
  })

  it('webContents.send throws → unknown error', async () => {
    const wc = { send: vi.fn(() => { throw new Error('webContents destroyed') }) }
    registerWebview('openai', wc)
    const bridge = createWebUiBridge({ providerId: 'openai' })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('unknown')
    expect(r.error.message).toContain('destroyed')
  })
})

describe('createWebUiBridge — timeout / abort', () => {
  it('timeout → streaming_timeout + retryable', async () => {
    const wc = makeWebContents()
    registerWebview('openai', wc)
    const bridge = createWebUiBridge({ providerId: 'openai', timeoutMs: 30 })

    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('streaming_timeout')
    expect(r.error.retryable).toBe(true)
  })

  it('signal aborted сразу → aborted, без send', async () => {
    const wc = makeWebContents()
    registerWebview('openai', wc)
    const ac = new AbortController()
    ac.abort()
    const bridge = createWebUiBridge({ providerId: 'openai' })

    const r = await bridge.ask({ ...baseQuestion, signal: ac.signal })
    expect(r.error.code).toBe('aborted')
    expect(wc.send).not.toHaveBeenCalled()
  })

  it('signal abort в процессе → aborted', async () => {
    const wc = makeWebContents()
    registerWebview('openai', wc)
    const ac = new AbortController()
    const bridge = createWebUiBridge({ providerId: 'openai', timeoutMs: 60000 })

    const p = bridge.ask({ ...baseQuestion, signal: ac.signal })
    setTimeout(() => ac.abort(), 10)
    const r = await p
    expect(r.error.code).toBe('aborted')
  })
})

describe('registerWebview / unregister', () => {
  it('unregister удаляет webview', async () => {
    const wc = makeWebContents()
    const unreg = registerWebview('openai', wc)
    unreg()
    const bridge = createWebUiBridge({ providerId: 'openai' })
    const r = await bridge.ask(baseQuestion)
    expect(r.error.code).toBe('config_invalid')
  })

  it('повторный register заменяет', async () => {
    const wc1 = makeWebContents()
    const wc2 = makeWebContents()
    registerWebview('openai', wc1)
    registerWebview('openai', wc2)
    const bridge = createWebUiBridge({ providerId: 'openai' })
    bridge.ask(baseQuestion)
    await new Promise(r => setTimeout(r, 0))
    expect(wc2.send).toHaveBeenCalled()
    expect(wc1.send).not.toHaveBeenCalled()
  })

  it('registerWebview без webContents → no-op', () => {
    const unreg = registerWebview('openai', null)
    expect(typeof unreg).toBe('function')
    expect(() => unreg()).not.toThrow()
  })
})

describe('deliverAnswer / deliverError — без pending', () => {
  it('deliverAnswer с неизвестным questionId → no throw', () => {
    expect(() => deliverAnswer({ questionId: 'q_unknown', text: 'x' })).not.toThrow()
  })

  it('deliverError с неизвестным questionId → no throw', () => {
    expect(() => deliverError({ questionId: 'q_unknown', code: 'x' })).not.toThrow()
  })
})
