// v1.2.0 (Этап 2): тесты renderer-side wrapper sendQuestion.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendQuestion, AI_BRIDGE_CONTRACT_VERSION } from './index.js'

const baseQuestion = {
  version: 1,
  text: 'hi',
  source: { messengerId: 'native_cc' },
}

let savedWindow

beforeEach(() => {
  savedWindow = global.window
  global.window = { api: { invoke: vi.fn() } }
})

afterEach(() => {
  global.window = savedWindow
})

describe('sendQuestion (Этап 2)', () => {
  it('без mode → config_invalid', async () => {
    const r = await sendQuestion({ question: baseQuestion })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('config_invalid')
  })

  it('без question → config_invalid', async () => {
    const r = await sendQuestion({ mode: 'local' })
    expect(r.error.code).toBe('config_invalid')
  })

  it('window.api.invoke недоступен → config_invalid', async () => {
    global.window = { api: {} }
    const r = await sendQuestion({ mode: 'local', question: baseQuestion })
    expect(r.error.code).toBe('config_invalid')
    expect(r.error.message).toContain('IPC unavailable')
  })

  it('window отсутствует → config_invalid', async () => {
    global.window = undefined
    const r = await sendQuestion({ mode: 'local', question: baseQuestion })
    expect(r.error.code).toBe('config_invalid')
  })

  it('invoke вызывается с правильным каналом и payload', async () => {
    window.api.invoke.mockResolvedValue({
      version: 1, ok: true, text: 'pong', providerId: 'local', mode: 'local', latencyMs: 5,
    })
    await sendQuestion({ mode: 'local', question: baseQuestion, config: { baseUrl: 'x' } })
    expect(window.api.invoke).toHaveBeenCalledWith('ai-bridge:send', {
      mode: 'local',
      question: baseQuestion,
      config: { baseUrl: 'x' },
    })
  })

  it('возвращает то что вернул invoke', async () => {
    const expectedAnswer = {
      version: 1, ok: true, text: 'hello!', providerId: 'local', mode: 'local', latencyMs: 42,
    }
    window.api.invoke.mockResolvedValue(expectedAnswer)
    const r = await sendQuestion({ mode: 'local', question: baseQuestion })
    expect(r).toEqual(expectedAnswer)
  })

  it('invoke throws → AiBridgeAnswer{ok:false, code:unknown}', async () => {
    window.api.invoke.mockRejectedValue(new Error('IPC channel closed'))
    const r = await sendQuestion({ mode: 'local', question: baseQuestion })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('unknown')
    expect(r.error.message).toContain('IPC channel closed')
  })
})

describe('AI_BRIDGE_CONTRACT_VERSION re-export', () => {
  it('значение совпадает с contracts.js', () => {
    expect(AI_BRIDGE_CONTRACT_VERSION).toBe(1)
  })
})
