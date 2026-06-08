// v0.96.0 (Phase 0 M0.2): тесты для useNotifyDispatcher.
// См. .memory-bank/ai-agent-plan/phases/phase-0-foundation.md

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotifyDispatcher } from './useNotifyDispatcher.js'
import { createNotificationSource } from '../shared/notificationSource.js'

const SOURCE_1 = createNotificationSource({
  messengerId: 'native_cc',
  accountId: 'tg_1',
  chatId: '-100',
  messageId: '1',
})

const SOURCE_2 = createNotificationSource({
  messengerId: 'native_cc',
  accountId: 'tg_1',
  chatId: '-100',
  messageId: '2',
})

let consoleErrorSpy
let consoleWarnSpy
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('useNotifyDispatcher — register + dispatch', () => {
  it('register + dispatch вызывает handler с правильными args', async () => {
    const { result } = renderHook(() => useNotifyDispatcher())
    const handler = vi.fn(async () => ({ ok: true, result: 'ok' }))

    act(() => {
      result.current.registerAction('test_action', handler)
    })

    let dispatchResult
    await act(async () => {
      dispatchResult = await result.current.dispatch('test_action', SOURCE_1, { foo: 'bar' })
    })

    expect(handler).toHaveBeenCalledWith(SOURCE_1, { foo: 'bar' })
    expect(dispatchResult).toEqual({ ok: true, result: 'ok' })
  })

  it('dispatch unknown action → warning + return ok:false', async () => {
    const { result } = renderHook(() => useNotifyDispatcher())

    let r
    await act(async () => {
      r = await result.current.dispatch('unknown', SOURCE_1, {})
    })

    expect(r).toEqual({ ok: false, error: 'unknown_action' })
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown action: unknown'))
  })

  it('handler throws → return ok:false с error', async () => {
    const { result } = renderHook(() => useNotifyDispatcher())
    const handler = vi.fn(async () => { throw new Error('boom') })

    act(() => result.current.registerAction('explode', handler))

    let r
    await act(async () => {
      r = await result.current.dispatch('explode', SOURCE_1, {})
    })

    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})

describe('useNotifyDispatcher — debounce', () => {
  it('debounce 500ms — повторный dispatch с тем же source → dropped', async () => {
    const { result } = renderHook(() => useNotifyDispatcher())
    const handler = vi.fn(async () => ({ ok: true }))

    act(() => result.current.registerAction('a', handler))

    await act(async () => {
      await result.current.dispatch('a', SOURCE_1, {})
    })
    let second
    await act(async () => {
      second = await result.current.dispatch('a', SOURCE_1, {})
    })

    expect(handler).toHaveBeenCalledTimes(1)  // второй раз НЕ вызвался
    expect(second).toEqual({ ok: false, dropped: 'debounce' })
  })

  it('разные source — debounce НЕ срабатывает', async () => {
    const { result } = renderHook(() => useNotifyDispatcher())
    const handler = vi.fn(async () => ({ ok: true }))

    act(() => result.current.registerAction('a', handler))

    await act(async () => {
      await result.current.dispatch('a', SOURCE_1, {})
      await result.current.dispatch('a', SOURCE_2, {})  // другой messageId
    })

    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('useNotifyDispatcher — управление registry', () => {
  it('unregisterAction удаляет handler', async () => {
    const { result } = renderHook(() => useNotifyDispatcher())
    const handler = vi.fn(async () => ({ ok: true }))

    act(() => result.current.registerAction('a', handler))
    expect(result.current.list()).toContain('a')

    act(() => result.current.unregisterAction('a'))
    expect(result.current.list()).not.toContain('a')

    let r
    await act(async () => {
      r = await result.current.dispatch('a', SOURCE_1, {})
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('unknown_action')
  })

  it('повторная регистрация перезаписывает + warning', () => {
    const { result } = renderHook(() => useNotifyDispatcher())
    const h1 = vi.fn(async () => ({ ok: true }))
    const h2 = vi.fn(async () => ({ ok: true }))

    act(() => result.current.registerAction('a', h1))
    act(() => result.current.registerAction('a', h2))

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'))
  })

  it('list возвращает все зарегистрированные actionId', () => {
    const { result } = renderHook(() => useNotifyDispatcher())
    act(() => {
      result.current.registerAction('a', async () => ({ ok: true }))
      result.current.registerAction('b', async () => ({ ok: true }))
      result.current.registerAction('c', async () => ({ ok: true }))
    })
    const list = result.current.list()
    expect(list).toHaveLength(3)
    expect(list).toEqual(expect.arrayContaining(['a', 'b', 'c']))
  })

  it('register с некорректным actionId → warning, не падает', () => {
    const { result } = renderHook(() => useNotifyDispatcher())
    act(() => {
      result.current.registerAction(null, async () => ({}))
      result.current.registerAction('', async () => ({}))
      result.current.registerAction('valid', null)
    })
    expect(consoleWarnSpy).toHaveBeenCalled()
    expect(result.current.list()).toEqual([])
  })
})
