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
