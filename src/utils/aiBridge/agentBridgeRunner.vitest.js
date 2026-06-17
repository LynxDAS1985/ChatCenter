// v1.2.2: тесты pure runner для AI Agent через Bridge.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAiAgentViaBridge } from './agentBridgeRunner.js'

let invokeMock
beforeEach(() => {
  invokeMock = vi.fn()
  globalThis.window.api = { invoke: invokeMock, send: vi.fn() }
})

function makeSetState() {
  const states = [{ steps: [] }]
  function setState(updater) {
    const prev = states[states.length - 1]
    states.push(typeof updater === 'function' ? updater(prev) : updater)
  }
  setState.history = states
  setState.last = () => states[states.length - 1]
  return setState
}

describe('runAiAgentViaBridge', () => {
  it('собирает payload с chain + question и вызывает ai-bridge:send', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'Ответ', providerId: 'anthropic', mode: 'api', latencyMs: 30 })
    const setState = makeSetState()
    const r = await runAiAgentViaBridge({
      source: { messengerId: 'native_cc', chatId: 'c1', messageId: 'm1' },
      provider: 'anthropic',
      recentMessages: [{ text: 'Привет', isOutgoing: false }],
      settings: { aiProviderKeys: { anthropic: { apiKey: 'a' } } },
    }, 'req_1', setState)

    expect(invokeMock).toHaveBeenCalledWith('ai-bridge:send', expect.objectContaining({
      chain: expect.any(Array),
      question: expect.objectContaining({
        version: 1,
        text: 'Привет',
        source: expect.objectContaining({ messengerId: 'native_cc', chatId: 'c1' }),
      }),
    }))
    expect(r.text).toBe('Ответ')
  })

  it('text берётся из последнего incoming сообщения', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'x', providerId: 'a', mode: 'api', latencyMs: 1 })
    await runAiAgentViaBridge({
      source: {},
      provider: 'openai',
      recentMessages: [
        { text: 'Старое', isOutgoing: false },
        { text: 'Новое', isOutgoing: false },
      ],
      settings: {},
    }, 'r', makeSetState())
    expect(invokeMock.mock.calls[0][1].question.text).toBe('Новое')
  })

  it('history — все кроме последнего, с правильными ролями', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'x', providerId: 'a', mode: 'api', latencyMs: 1 })
    await runAiAgentViaBridge({
      source: {},
      provider: 'openai',
      recentMessages: [
        { text: 'M1', isOutgoing: false },
        { text: 'A1', isOutgoing: true },
        { text: 'M2', isOutgoing: false },
      ],
      settings: {},
    }, 'r', makeSetState())
    expect(invokeMock.mock.calls[0][1].question.history).toEqual([
      { role: 'user', text: 'M1' },
      { role: 'assistant', text: 'A1' },
    ])
  })

  it('пустые recentMessages → дефолтный text + нет history', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'x', providerId: 'a', mode: 'api', latencyMs: 1 })
    await runAiAgentViaBridge({
      source: {},
      provider: 'openai',
      recentMessages: [],
      settings: {},
    }, 'r', makeSetState())
    expect(invokeMock.mock.calls[0][1].question.text).toContain('Помоги ответить')
    expect(invokeMock.mock.calls[0][1].question.history).toBeUndefined()
  })

  it('генерирует bridge_start + tool_result(bridge_answer) шаги', async () => {
    invokeMock.mockResolvedValue({
      ok: true, text: 'X', providerId: 'openai', mode: 'api', latencyMs: 50,
      debug: { attemptedFallbacks: [{ mode: 'api', providerId: 'anthropic', errorCode: 'rate_limited' }] },
    })
    const setState = makeSetState()
    await runAiAgentViaBridge({
      source: {},
      provider: 'anthropic',
      recentMessages: [{ text: 'Q', isOutgoing: false }],
      settings: { aiProviderKeys: { anthropic: { apiKey: 'a' }, openai: { apiKey: 'b' } } },
    }, 'req_1', setState)
    const last = setState.last()
    expect(last.steps[0].type).toBe('bridge_start')
    expect(last.steps[0].primary).toBe('anthropic')
    expect(last.steps[1].type).toBe('tool_result')
    expect(last.steps[1].name).toBe('bridge_answer')
    expect(last.steps[1].result.attemptedFallbacks).toHaveLength(1)
  })

  it('systemPrompt всегда добавляется', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'x', providerId: 'a', mode: 'api', latencyMs: 1 })
    await runAiAgentViaBridge({
      source: {}, provider: 'openai',
      recentMessages: [{ text: 'Q', isOutgoing: false }],
      settings: {},
    }, 'r', makeSetState())
    expect(invokeMock.mock.calls[0][1].question.systemPrompt).toContain('помощник менеджера')
  })

  it('provider mode=webview makes webui the primary chain step', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'x', providerId: 'gigachat', mode: 'webui', latencyMs: 1 })
    await runAiAgentViaBridge({
      source: {},
      provider: 'gigachat',
      recentMessages: [{ text: 'Q', isOutgoing: false }],
      settings: {
        aiProvider: 'gigachat',
        aiProviderKeys: {
          gigachat: { mode: 'webview', webviewUrl: 'https://giga.chat' },
        },
        aiBridgeSelectors: {
          gigachat: { input: '#prompt' },
        },
      },
    }, 'r', makeSetState())
    const chain = invokeMock.mock.calls[0][1].chain
    expect(chain[0]).toEqual({
      mode: 'webui',
      config: {
        providerId: 'gigachat',
        selectors: { input: '#prompt' },
      },
    })
  })

  it('provider mode=api keeps api as the primary chain step with model', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'x', providerId: 'openai', mode: 'api', latencyMs: 1 })
    await runAiAgentViaBridge({
      source: {},
      provider: 'openai',
      recentMessages: [{ text: 'Q', isOutgoing: false }],
      settings: {
        aiProvider: 'openai',
        aiProviderKeys: {
          openai: { mode: 'api', apiKey: 'sk-test', model: 'gpt-4o-mini' },
        },
      },
    }, 'r', makeSetState())
    const chain = invokeMock.mock.calls[0][1].chain
    expect(chain[0]).toEqual({
      mode: 'api',
      config: {
        providerId: 'openai',
        model: 'gpt-4o-mini',
      },
    })
  })
})
