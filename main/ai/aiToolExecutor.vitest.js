// v0.97.0 (Phase 1 M1.7): тесты aiToolExecutor.

import { describe, it, expect, vi } from 'vitest'
import { runAgentLoop, getAdapter } from './aiToolExecutor.js'
import { createToolRegistry } from '../../src/shared/tools/toolRegistry.js'
import { createNotificationSource } from '../../src/shared/notificationSource.js'

const SOURCE = createNotificationSource({
  messengerId: 'native_cc',
  accountId: 'tg_1',
  chatId: '-100',
  messageId: '1',
})

function makeRegistry() {
  const r = createToolRegistry()
  r.register('get_chat_history', {
    schema: { type: 'object', required: ['chatId'], properties: { chatId: { type: 'string' } } },
    handler: async (_source, args) => ({ ok: true, result: { messages: [{ id: '1', text: 'hi' }] } }),
    permission: 'auto',
    description: 'get history',
  })
  r.register('deny_tool', {
    schema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true }),
    permission: 'deny',
    description: 'deny',
  })
  r.register('confirm_tool', {
    schema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true }),
    permission: 'confirm',
    description: 'confirm',
  })
  return r
}

describe('getAdapter', () => {
  it('возвращает adapter для известных provider', () => {
    expect(getAdapter('anthropic')).toBeTruthy()
    expect(getAdapter('openai')).toBeTruthy()
    expect(getAdapter('deepseek')).toBeTruthy()
    expect(getAdapter('gigachat')).toBeTruthy()
  })

  it('возвращает null для unknown', () => {
    expect(getAdapter('unknown')).toBe(null)
  })
})

describe('runAgentLoop — happy path (Anthropic)', () => {
  it('AI без tool_use → возвращает finalAnswer сразу', async () => {
    const registry = makeRegistry()
    const callProvider = vi.fn(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Готово' }],
    }))

    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [{ role: 'user', content: 'Привет' }],
    })

    expect(r.ok).toBe(true)
    expect(r.finalAnswer).toBe('Готово')
    expect(r.iterations).toBe(1)
    expect(callProvider).toHaveBeenCalledTimes(1)
  })

  it('AI с одним tool_call → tool + продолжение → final', async () => {
    const registry = makeRegistry()
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'get_chat_history', input: { chatId: 'X' } },
          ],
        }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Прочитал' }] }
    })

    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [{ role: 'user', content: 'Прочитай историю' }],
    })

    expect(r.ok).toBe(true)
    expect(r.finalAnswer).toBe('Прочитал')
    expect(r.iterations).toBe(2)
    expect(r.audit).toHaveLength(1)
    expect(r.audit[0].name).toBe('get_chat_history')
    expect(r.audit[0].result.ok).toBe(true)
  })
})

describe('runAgentLoop — permission guard', () => {
  it('AI вызывает deny tool → error в audit, AI продолжает', async () => {
    const registry = makeRegistry()
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'deny_tool', input: {} }],
        }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Понял что нельзя' }] }
    })

    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [],
    })

    expect(r.ok).toBe(true)
    expect(r.audit[0].result.error).toBe('permission_denied')
  })

  it('confirm tool без onConfirmRequest → confirm_required_no_handler', async () => {
    const registry = makeRegistry()
    // Регистрируем confirm-tool с известным id (Permission Guard знает default для get_chat_history)
    registry.register('mark_as_read', {
      schema: { type: 'object', properties: {} },
      handler: async () => ({ ok: true }),
      permission: 'confirm',
      description: 'mark',
    })
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'mark_as_read', input: { upToMessageId: 'x' } }],
        }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Понятно' }] }
    })

    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [],
      // НЕТ onConfirmRequest
    })

    expect(r.audit[0].result.error).toBe('confirm_required_no_handler')
  })

  it('Phase 2: confirm tool + onConfirmRequest(confirmed) → выполняется', async () => {
    const registry = makeRegistry()
    registry.register('mark_as_read', {
      schema: { type: 'object', properties: {} },
      handler: async () => ({ ok: true, result: { marked: true } }),
      permission: 'confirm',
      description: 'mark',
    })
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'mark_as_read', input: { upToMessageId: 'x' } }],
        }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Готово' }] }
    })
    const onConfirmRequest = vi.fn(async () => ({ confirmed: true }))

    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [],
      onConfirmRequest,
    })

    expect(onConfirmRequest).toHaveBeenCalledWith(expect.objectContaining({
      toolId: 'mark_as_read',
      tier: 'confirm',
    }))
    expect(r.ok).toBe(true)
    expect(r.audit[0].result.ok).toBe(true)
  })

  it('Phase 2: onConfirmRequest(confirmed:false) → denied_by_user', async () => {
    const registry = makeRegistry()
    registry.register('mark_as_read', {
      schema: { type: 'object', properties: {} },
      handler: async () => ({ ok: true }),
      permission: 'confirm',
      description: 'mark',
    })
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'mark_as_read', input: { upToMessageId: 'x' } }],
        }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Понятно' }] }
    })
    const onConfirmRequest = vi.fn(async () => ({ confirmed: false }))

    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [],
      onConfirmRequest,
    })

    expect(r.audit[0].result.error).toBe('denied_by_user')
  })

  it('Phase 2: webview messengerId → permission_denied scope', async () => {
    const registry = makeRegistry()
    const webviewSource = { messengerId: 'webview-telegram', accountId: 'wv', chatId: 'c', messageId: 'm' }
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'get_chat_history', input: { chatId: 'X' } }],
        }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'cant' }] }
    })

    const r = await runAgentLoop({
      source: webviewSource,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [],
    })

    expect(r.audit[0].result.reason).toBe('webview_messenger_not_supported')
  })
})

describe('runAgentLoop — границы', () => {
  it('max iterations → abort', async () => {
    const registry = makeRegistry()
    // AI бесконечно зовёт tool
    const callProvider = vi.fn(async () => ({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: `t-${Math.random()}`, name: 'get_chat_history', input: { chatId: 'X' } }],
    }))

    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [],
      maxIterations: 3,
    })

    expect(r.ok).toBe(false)
    expect(r.error).toBe('max_iterations_reached')
    expect(r.iterations).toBe(3)
  })

  it('unknown tool → error в audit', async () => {
    const registry = makeRegistry()
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'x', name: 'nonexistent_tool', input: {} }],
        }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }
    })

    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry,
      callProvider,
      handlerContext: {},
      initialMessages: [],
    })

    expect(r.audit[0].result.error).toBe('unknown_tool')
  })

  it('provider не указан → ok:false', async () => {
    const r = await runAgentLoop({
      source: SOURCE,
      registry: makeRegistry(),
      callProvider: vi.fn(),
      handlerContext: {},
      initialMessages: [],
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_provider')
  })

  it('unknown provider → ok:false', async () => {
    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'fake_provider',
      registry: makeRegistry(),
      callProvider: vi.fn(),
      handlerContext: {},
      initialMessages: [],
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/unknown_provider/)
  })

  it('provider call throws → graceful error', async () => {
    const callProvider = vi.fn(async () => { throw new Error('network') })
    const r = await runAgentLoop({
      source: SOURCE,
      provider: 'anthropic',
      registry: makeRegistry(),
      callProvider,
      handlerContext: {},
      initialMessages: [],
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/provider_call_failed/)
  })
})

// v1.0.4: AbortSignal + confirm timeout + read-only re-try.
describe('runAgentLoop — v1.0.4 stability', () => {
  it('AbortSignal aborted ДО старта → возвращает {error:aborted, iterations:0}', async () => {
    const registry = makeRegistry()
    const callProvider = vi.fn()
    const ac = new AbortController()
    ac.abort()
    const r = await runAgentLoop({
      source: SOURCE, provider: 'anthropic', registry, callProvider,
      handlerContext: {}, initialMessages: [], signal: ac.signal,
    })
    expect(r.error).toBe('aborted')
    expect(callProvider).not.toHaveBeenCalled()
  })

  it('AbortSignal — провайдер throws AbortError → выходим тихо', async () => {
    const registry = makeRegistry()
    const callProvider = vi.fn(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e })
    const ac = new AbortController()
    const r = await runAgentLoop({
      source: SOURCE, provider: 'anthropic', registry, callProvider,
      handlerContext: {}, initialMessages: [], signal: ac.signal,
    })
    expect(r.error).toBe('aborted')
    expect(r.iterations).toBe(1)
  })

  it('confirm timeout — onConfirmRequest зависает >timeout → confirm_timeout в audit', async () => {
    const registry = makeRegistry()
    registry.register('mark_as_read', {
      schema: { type: 'object', properties: {} },
      handler: async () => ({ ok: true }),
      permission: 'confirm',
      description: 'mark',
    })
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: 'mark_as_read', input: {} }] }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }
    })
    const onConfirmRequest = vi.fn(() => new Promise(() => {}))  // зависает навсегда

    const r = await runAgentLoop({
      source: SOURCE, provider: 'anthropic', registry, callProvider,
      handlerContext: {}, initialMessages: [],
      onConfirmRequest,
      confirmTimeoutMs: 50,  // 50мс для быстрого теста
    })

    expect(r.ok).toBe(true)
    expect(r.audit[0].result.error).toBe('confirm_timeout')
    expect(r.audit[0].permissionResult).toBe('confirm_timeout')
  })

  it('confirm timeout=0 (off) — ждёт до конца', async () => {
    const registry = makeRegistry()
    registry.register('mark_as_read', {
      schema: { type: 'object', properties: {} },
      handler: async () => ({ ok: true }),
      permission: 'confirm',
      description: 'mark',
    })
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: 'mark_as_read', input: {} }] }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }
    })
    const onConfirmRequest = vi.fn(async () => ({ confirmed: true }))

    const r = await runAgentLoop({
      source: SOURCE, provider: 'anthropic', registry, callProvider,
      handlerContext: {}, initialMessages: [],
      onConfirmRequest,
      confirmTimeoutMs: 0,  // off
    })

    expect(r.ok).toBe(true)
    expect(r.audit[0].result.ok).toBe(true)
  })

  it('read-only retry — handler первый раз падает, второй раз ок → success', async () => {
    const registry = createToolRegistry()
    let handlerCalls = 0
    registry.register('get_chat_history', {
      schema: { type: 'object', properties: {} },
      handler: async () => {
        handlerCalls++
        if (handlerCalls === 1) throw new Error('transient_error')
        return { ok: true, result: { messages: [] } }
      },
      permission: 'auto',
      category: 'reading',  // ВАЖНО — только reading ретраится
      description: 'get history',
    })
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: 'get_chat_history', input: {} }] }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }
    })

    const r = await runAgentLoop({
      source: SOURCE, provider: 'anthropic', registry, callProvider,
      handlerContext: {}, initialMessages: [],
      readRetryCount: 1,
    })

    expect(r.ok).toBe(true)
    expect(handlerCalls).toBe(2)  // первый throw + второй успех
    expect(r.audit[0].result.ok).toBe(true)
    expect(r.audit[0].attempts).toBe(2)
  })

  it('non-reading tool НЕ ретраится при throw (writing/navigation опасно)', async () => {
    const registry = createToolRegistry()
    let handlerCalls = 0
    // Используем известный tool 'goto_message' (Permission Guard: default auto).
    // category=navigation — Не reading → не ретраится.
    registry.register('goto_message', {
      schema: { type: 'object', properties: {} },
      handler: async () => {
        handlerCalls++
        throw new Error('send_failed')
      },
      permission: 'auto',
      category: 'navigation',  // НЕ reading → НЕ retry
      description: 'goto',
    })
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: 'goto_message', input: {} }] }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }
    })

    const r = await runAgentLoop({
      source: SOURCE, provider: 'anthropic', registry, callProvider,
      handlerContext: {}, initialMessages: [],
      readRetryCount: 3,  // даже с большим retryCount — не должен ретраить writing
    })

    expect(handlerCalls).toBe(1)  // только один раз
    expect(r.audit[0].result.ok).toBe(false)
  })

  it('readRetryCount=0 → нет ретраев даже для reading', async () => {
    const registry = createToolRegistry()
    let handlerCalls = 0
    registry.register('get_chat_history', {
      schema: { type: 'object', properties: {} },
      handler: async () => { handlerCalls++; throw new Error('fail') },
      permission: 'auto',
      category: 'reading',
      description: 'get',
    })
    let call = 0
    const callProvider = vi.fn(async () => {
      call++
      if (call === 1) {
        return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: 'get_chat_history', input: {} }] }
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }
    })

    const r = await runAgentLoop({
      source: SOURCE, provider: 'anthropic', registry, callProvider,
      handlerContext: {}, initialMessages: [],
      readRetryCount: 0,
    })

    expect(handlerCalls).toBe(1)
    expect(r.audit[0].result.error).toBe('fail')
  })
})

import { _internal } from './aiToolExecutor.js'

describe('runWithTimeout helper (v1.0.4)', () => {
  it('успех до таймаута → возвращает результат', async () => {
    const r = await _internal.runWithTimeout(
      () => Promise.resolve({ confirmed: true }),
      1000, 'timeout', null,
    )
    expect(r.confirmed).toBe(true)
  })

  it('зависает > timeout → возвращает {confirmed:false, error:timeout}', async () => {
    const r = await _internal.runWithTimeout(
      () => new Promise(() => {}),
      30, 'my_timeout', null,
    )
    expect(r).toEqual({ confirmed: false, error: 'my_timeout' })
  })

  it('throw → {confirmed:false, error}', async () => {
    const r = await _internal.runWithTimeout(
      () => { throw new Error('boom') },
      1000, 'timeout', null,
    )
    expect(r).toEqual({ confirmed: false, error: 'boom' })
  })

  it('timeoutMs=0 → без timeout, ждём результат', async () => {
    const r = await _internal.runWithTimeout(
      () => Promise.resolve({ confirmed: true, x: 1 }),
      0, 'timeout', null,
    )
    expect(r.confirmed).toBe(true)
  })

  it('AbortSignal aborted → {confirmed:false, error:aborted}', async () => {
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 20)
    const r = await _internal.runWithTimeout(
      () => new Promise(() => {}),
      1000, 'timeout', ac.signal,
    )
    expect(r.error).toBe('aborted')
  })
})
