// v0.99.0 (Phase 3 M3.2): тесты useAIAgent.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useAIAgent from './useAIAgent.js'

let invokeMock, onMock, eventHandlers
beforeEach(() => {
  eventHandlers = {}
  invokeMock = vi.fn()
  onMock = vi.fn((channel, handler) => {
    eventHandlers[channel] = handler
    return () => { delete eventHandlers[channel] }
  })
  globalThis.window.api = {
    invoke: invokeMock,
    on: onMock,
    send: vi.fn(),
  }
})

describe('useAIAgent', () => {
  it('start → isRunning=true + invoke ai:agent:run', async () => {
    invokeMock.mockResolvedValue({ ok: true, finalAnswer: 'Ответ' })
    const { result } = renderHook(() => useAIAgent())

    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
        provider: 'anthropic',
      })
    })

    expect(invokeMock).toHaveBeenCalledWith('ai:agent:run', expect.objectContaining({
      provider: 'anthropic',
      requestId: expect.stringMatching(/^ai_req_/),
    }))
    expect(result.current.state.finalAnswer).toBe('Ответ')
    expect(result.current.state.isRunning).toBe(false)
  })

  it('ai:agent:step event для правильного requestId → добавляется в steps', async () => {
    // Захватываем requestId через invoke mock
    let capturedRequestId = null
    invokeMock.mockImplementation((channel, params) => {
      if (channel === 'ai:agent:run') {
        capturedRequestId = params.requestId
        // Эмулируем step event ДО resolve
        Promise.resolve().then(() => {
          eventHandlers['ai:agent:step']?.({
            requestId: capturedRequestId,
            step: { type: 'tool_call', name: 'get_chat_history', input: {} },
          })
        })
        return Promise.resolve({ ok: true, finalAnswer: 'done' })
      }
      return Promise.resolve({ ok: true })
    })

    const { result } = renderHook(() => useAIAgent())

    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
        provider: 'anthropic',
      })
      // Дождёмся step event
      await new Promise(r => setTimeout(r, 50))
    })

    expect(result.current.state.steps.length).toBeGreaterThan(0)
  })

  it('cancel → invoke ai:agent:cancel + isRunning=false', async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}))  // never resolves
    const { result } = renderHook(() => useAIAgent())

    act(() => {
      result.current.start({
        source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
        provider: 'anthropic',
      })
    })

    act(() => {
      result.current.cancel()
    })

    expect(globalThis.window.api.send).toHaveBeenCalledWith('ai:agent:cancel', expect.objectContaining({
      requestId: expect.any(String),
    }))
    expect(result.current.state.isRunning).toBe(false)
  })

  it('error в invoke → state.error', async () => {
    invokeMock.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useAIAgent())

    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
        provider: 'anthropic',
      })
    })

    expect(result.current.state.error).toBe('network')
  })

  it('confirmStep с updatedArgs → invoke confirm-response confirmed:true', () => {
    const { result } = renderHook(() => useAIAgent())
    invokeMock.mockResolvedValue({ ok: true })

    act(() => {
      result.current.start({
        source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
        provider: 'anthropic',
      })
    })

    act(() => {
      result.current.confirmStep({ text: 'Изменённый текст' })
    })

    expect(globalThis.window.api.send).toHaveBeenCalledWith('ai:agent:confirm-response', expect.objectContaining({
      confirmed: true,
      updatedArgs: { text: 'Изменённый текст' },
    }))
  })

  it('cancelStep → confirmed:false', () => {
    const { result } = renderHook(() => useAIAgent())
    invokeMock.mockResolvedValue({ ok: true })

    act(() => {
      result.current.start({
        source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
        provider: 'anthropic',
      })
    })

    act(() => {
      result.current.cancelStep()
    })

    expect(globalThis.window.api.send).toHaveBeenCalledWith('ai:agent:confirm-response', expect.objectContaining({
      confirmed: false,
    }))
  })

  it('reset → state clear', () => {
    const { result } = renderHook(() => useAIAgent())
    act(() => result.current.reset())
    expect(result.current.state.isRunning).toBe(false)
    expect(result.current.state.steps).toEqual([])
  })
})

// v1.2.2: Bridge-режим — простой Q&A через AI Bridge с auto-резервом.
describe('useAIAgent — Bridge режим (v1.2.2)', () => {
  it('useBridge=true → не вызывает ai:agent:run, вместо вызывает ai-bridge:send', async () => {
    invokeMock.mockResolvedValue({
      version: 1, ok: true, text: 'Bridge ответил', providerId: 'anthropic', mode: 'api', latencyMs: 50,
    })
    const { result } = renderHook(() => useAIAgent())

    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc', chatId: 'c1', messageId: 'm1' },
        provider: 'anthropic',
        recentMessages: [
          { text: 'Привет, есть вопрос', isOutgoing: false },
        ],
        useBridge: true,
        settings: { aiProviderKeys: { anthropic: { apiKey: 'sk-a' } } },
      })
    })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock.mock.calls[0][0]).toBe('ai-bridge:send')
    // НЕ ai:agent:run
    const call = invokeMock.mock.calls[0]
    expect(call[0]).not.toBe('ai:agent:run')
    // chain включает primary (anthropic)
    expect(call[1].chain).toBeDefined()
    expect(call[1].chain[0].config.providerId).toBe('anthropic')
    expect(result.current.state.finalAnswer).toBe('Bridge ответил')
    expect(result.current.state.isRunning).toBe(false)
  })

  it('Bridge: text вопроса берётся из последнего incoming сообщения', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'X', providerId: 'openai', mode: 'api', latencyMs: 1 })
    const { result } = renderHook(() => useAIAgent())
    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc' },
        provider: 'openai',
        recentMessages: [
          { text: 'Старое', isOutgoing: false },
          { text: 'Новое — главный вопрос', isOutgoing: false },
        ],
        useBridge: true,
        settings: {},
      })
    })
    const payload = invokeMock.mock.calls[0][1]
    expect(payload.question.text).toBe('Новое — главный вопрос')
  })

  it('Bridge: history собирается из recentMessages (без последнего)', async () => {
    invokeMock.mockResolvedValue({ ok: true, text: 'X', providerId: 'openai', mode: 'api', latencyMs: 1 })
    const { result } = renderHook(() => useAIAgent())
    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc' },
        provider: 'openai',
        recentMessages: [
          { text: 'M1', isOutgoing: false },
          { text: 'A1', isOutgoing: true },
          { text: 'M2', isOutgoing: false },
        ],
        useBridge: true,
        settings: {},
      })
    })
    const payload = invokeMock.mock.calls[0][1]
    expect(payload.question.history).toEqual([
      { role: 'user', text: 'M1' },
      { role: 'assistant', text: 'A1' },
    ])
    expect(payload.question.text).toBe('M2')
  })

  it('Bridge: streaming шаги (bridge_start + tool_result bridge_answer)', async () => {
    invokeMock.mockResolvedValue({
      ok: true, text: 'Ответ', providerId: 'openai', mode: 'api', latencyMs: 100,
      debug: { attemptedFallbacks: [{ mode: 'api', providerId: 'anthropic', errorCode: 'rate_limited' }] },
    })
    const { result } = renderHook(() => useAIAgent())
    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc' },
        provider: 'anthropic',
        recentMessages: [{ text: 'Привет', isOutgoing: false }],
        useBridge: true,
        settings: { aiProviderKeys: { anthropic: { apiKey: 'a' }, openai: { apiKey: 'b' } } },
      })
    })
    const steps = result.current.state.steps
    expect(steps[0].type).toBe('bridge_start')
    expect(steps[0].primary).toBe('anthropic')
    expect(steps[1].type).toBe('tool_result')
    expect(steps[1].name).toBe('bridge_answer')
    expect(steps[1].result.providerId).toBe('openai')
    expect(steps[1].result.attemptedFallbacks).toHaveLength(1)
  })

  it('Bridge: ошибка → finalAnswer=null + error', async () => {
    invokeMock.mockResolvedValue({
      ok: false, text: '',
      error: { code: 'network_error', message: 'нет сети', retryable: true },
    })
    const { result } = renderHook(() => useAIAgent())
    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc' },
        provider: 'anthropic',
        recentMessages: [{ text: 'Q', isOutgoing: false }],
        useBridge: true,
        settings: {},
      })
    })
    expect(result.current.state.finalAnswer).toBeNull()
    expect(result.current.state.error).toContain('нет сети')
  })

  it('Bridge: invoke throws → error в state', async () => {
    invokeMock.mockRejectedValue(new Error('IPC сломан'))
    const { result } = renderHook(() => useAIAgent())
    await act(async () => {
      await result.current.start({
        source: { messengerId: 'native_cc' },
        provider: 'anthropic',
        recentMessages: [{ text: 'Q', isOutgoing: false }],
        useBridge: true,
        settings: {},
      })
    })
    expect(result.current.state.error).toContain('IPC сломан')
  })
})
