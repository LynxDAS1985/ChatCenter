// v0.97.0 (Phase 1 M1.9): тесты aiToolIpcHandlers.
//
// Тестируем validation + integration с aiToolExecutor.
// ipcMain мокается (отдельный hooks API).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мокаем electron ipcMain через vi.hoisted (factory hoisted to top).
const { ipcHandlers, ipcListeners } = vi.hoisted(() => ({
  ipcHandlers: new Map(),
  ipcListeners: new Map(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel, fn) => ipcHandlers.set(channel, fn),
    on: (channel, fn) => ipcListeners.set(channel, fn),
  },
}))

beforeEach(() => {
  ipcHandlers.clear()
  ipcListeners.clear()
})

import { initAiToolIpcHandlers, _internal } from './aiToolIpcHandlers.js'
import { createToolRegistry } from '../../src/shared/tools/toolRegistry.js'

const fakeEvent = {
  sender: { send: vi.fn(), isDestroyed: () => false },
}

describe('aiToolIpcHandlers — init', () => {
  it('регистрирует handle ai:agent:run и on ai:agent:cancel', () => {
    initAiToolIpcHandlers({ getRegistry: () => createToolRegistry() })
    expect(ipcHandlers.has('ai:agent:run')).toBe(true)
    expect(ipcListeners.has('ai:agent:cancel')).toBe(true)
  })
})

describe('aiToolIpcHandlers — validation', () => {
  it('без requestId → ok:false', async () => {
    initAiToolIpcHandlers({ getRegistry: () => createToolRegistry() })
    const handler = ipcHandlers.get('ai:agent:run')
    const r = await handler(fakeEvent, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_requestId')
  })

  it('невалидный source → ok:false', async () => {
    initAiToolIpcHandlers({ getRegistry: () => createToolRegistry() })
    const handler = ipcHandlers.get('ai:agent:run')
    const r = await handler(fakeEvent, { requestId: 'r1', source: { messengerId: 'x' } })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_source')
  })

  it('valid source но без provider → ok:false', async () => {
    initAiToolIpcHandlers({ getRegistry: () => createToolRegistry() })
    const handler = ipcHandlers.get('ai:agent:run')
    const r = await handler(fakeEvent, {
      requestId: 'r1',
      source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_provider')
  })

  it('provider не доступен (нет callProvider) → ok:false', async () => {
    initAiToolIpcHandlers({
      getRegistry: () => createToolRegistry(),
      getHandlerContext: () => ({}),
      getCallProvider: () => null,
    })
    const handler = ipcHandlers.get('ai:agent:run')
    const r = await handler(fakeEvent, {
      requestId: 'r1',
      source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
      provider: 'anthropic',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/provider_not_available/)
  })
})

describe('aiToolIpcHandlers — happy path', () => {
  it('agent loop запускается и возвращает результат', async () => {
    const callProvider = vi.fn(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Готово' }],
    }))

    initAiToolIpcHandlers({
      getRegistry: () => createToolRegistry(),
      getHandlerContext: () => ({}),
      getCallProvider: () => callProvider,
    })

    const handler = ipcHandlers.get('ai:agent:run')
    const r = await handler(fakeEvent, {
      requestId: 'r1',
      source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
      provider: 'anthropic',
    })

    expect(r.ok).toBe(true)
    expect(r.finalAnswer).toBe('Готово')
    expect(callProvider).toHaveBeenCalledTimes(1)
  })

  it('после run requestId удалён из activeRuns', async () => {
    const callProvider = vi.fn(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
    }))

    initAiToolIpcHandlers({
      getRegistry: () => createToolRegistry(),
      getHandlerContext: () => ({}),
      getCallProvider: () => callProvider,
    })

    const handler = ipcHandlers.get('ai:agent:run')
    await handler(fakeEvent, {
      requestId: 'r1',
      source: { messengerId: 'native_cc', accountId: 'a', chatId: 'c', messageId: 'm' },
      provider: 'anthropic',
    })

    expect(_internal.activeRuns.has('r1')).toBe(false)
  })
})

describe('aiToolIpcHandlers — cancel', () => {
  it('cancel удаляет активную задачу', () => {
    initAiToolIpcHandlers({ getRegistry: () => createToolRegistry() })
    // Поставить вручную фиктивный run
    const abortController = new AbortController()
    _internal.activeRuns.set('r1', { abortController })

    const cancelHandler = ipcListeners.get('ai:agent:cancel')
    cancelHandler(null, { requestId: 'r1' })

    expect(_internal.activeRuns.has('r1')).toBe(false)
  })

  it('cancel для несуществующего id → no-op', () => {
    initAiToolIpcHandlers({ getRegistry: () => createToolRegistry() })
    const cancelHandler = ipcListeners.get('ai:agent:cancel')
    expect(() => cancelHandler(null, { requestId: 'unknown' })).not.toThrow()
  })
})
