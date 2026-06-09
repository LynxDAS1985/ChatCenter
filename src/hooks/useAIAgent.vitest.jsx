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

    expect(invokeMock).toHaveBeenCalledWith('ai:agent:cancel', expect.objectContaining({
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

    expect(invokeMock).toHaveBeenCalledWith('ai:agent:confirm-response', expect.objectContaining({
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

    expect(invokeMock).toHaveBeenCalledWith('ai:agent:confirm-response', expect.objectContaining({
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
