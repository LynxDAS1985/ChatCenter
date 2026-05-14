// v0.89.0 — Stage 4 / Этап 3.4: тесты нормализации tdl формата.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import {
  deepRenameKey, normalizeFromTdl, wrapClientForNormalization,
} from '../../main/native/backends/tdlibNormalize.js'

// ──────────────────────────────────────────────────────────────────────
// deepRenameKey
// ──────────────────────────────────────────────────────────────────────

describe('deepRenameKey', () => {
  it('переименовывает ключ на верхнем уровне', () => {
    expect(deepRenameKey('_', '@type', { _: 'message', id: 1 }))
      .toEqual({ '@type': 'message', id: 1 })
  })

  it('рекурсивно во вложенных объектах', () => {
    const input = {
      _: 'message',
      content: {
        _: 'messageText',
        text: { _: 'formattedText', text: 'привет', entities: [] },
      },
    }
    const output = deepRenameKey('_', '@type', input)
    expect(output['@type']).toBe('message')
    expect(output.content['@type']).toBe('messageText')
    expect(output.content.text['@type']).toBe('formattedText')
    expect(output.content.text.text).toBe('привет')
  })

  it('рекурсивно в массивах', () => {
    const input = {
      _: 'messages',
      messages: [
        { _: 'message', id: 1 },
        { _: 'message', id: 2 },
      ],
    }
    const output = deepRenameKey('_', '@type', input)
    expect(output.messages[0]['@type']).toBe('message')
    expect(output.messages[1]['@type']).toBe('message')
  })

  it('не мутирует исходный объект', () => {
    const input = { _: 'x' }
    const output = deepRenameKey('_', '@type', input)
    expect(input._).toBe('x')
    expect(output['@type']).toBe('x')
    expect(input).not.toHaveProperty('@type')
  })

  it('null / undefined / примитивы возвращаются как есть', () => {
    expect(deepRenameKey('_', '@type', null)).toBe(null)
    expect(deepRenameKey('_', '@type', undefined)).toBe(undefined)
    expect(deepRenameKey('_', '@type', 42)).toBe(42)
    expect(deepRenameKey('_', '@type', 'string')).toBe('string')
    expect(deepRenameKey('_', '@type', true)).toBe(true)
  })

  it('обратное переименование тоже работает', () => {
    expect(deepRenameKey('@type', '_', { '@type': 'message' }))
      .toEqual({ _: 'message' })
  })
})

describe('normalizeFromTdl', () => {
  it('конвертирует tdl-формат `_` в стандартный `@type`', () => {
    expect(normalizeFromTdl({
      _: 'updateAuthorizationState',
      authorization_state: { _: 'authorizationStateWaitCode' },
    })).toEqual({
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitCode' },
    })
  })
})

// ──────────────────────────────────────────────────────────────────────
// wrapClientForNormalization
// ──────────────────────────────────────────────────────────────────────

function makeRawClient() {
  const c = new EventEmitter()
  c.invoke = vi.fn()
  c.close = vi.fn(() => Promise.resolve())
  return c
}

describe('wrapClientForNormalization', () => {
  it('invoke нормализует результат `_` → `@type`', async () => {
    const raw = makeRawClient()
    raw.invoke.mockResolvedValueOnce({ _: 'ok', value: 1 })
    const wrapped = wrapClientForNormalization(raw)
    const r = await wrapped.invoke({ '@type': 'getOption', name: 'version' })
    expect(r).toEqual({ '@type': 'ok', value: 1 })
  })

  it('invoke передаёт request как есть (tdl сама переименует @type → _)', async () => {
    const raw = makeRawClient()
    raw.invoke.mockResolvedValueOnce({})
    const wrapped = wrapClientForNormalization(raw)
    await wrapped.invoke({ '@type': 'getChatHistory', chat_id: -1 })
    // Original запрос с @type должен дойти до raw.invoke
    expect(raw.invoke).toHaveBeenCalledWith({ '@type': 'getChatHistory', chat_id: -1 })
  })

  it('update events нормализуются для подписчиков', () => {
    const raw = makeRawClient()
    const wrapped = wrapClientForNormalization(raw)
    const handler = vi.fn()
    wrapped.on('update', handler)
    raw.emit('update', { _: 'updateNewMessage', message: { _: 'message', id: 1 } })
    expect(handler).toHaveBeenCalledWith({
      '@type': 'updateNewMessage',
      message: { '@type': 'message', id: 1 },
    })
  })

  it('off снимает наш wrapped listener', () => {
    const raw = makeRawClient()
    const wrapped = wrapClientForNormalization(raw)
    const handler = vi.fn()
    wrapped.on('update', handler)
    expect(raw.listenerCount('update')).toBe(1)
    wrapped.off('update', handler)
    expect(raw.listenerCount('update')).toBe(0)
  })

  it('on/off для не-update events работают напрямую', () => {
    const raw = makeRawClient()
    const wrapped = wrapClientForNormalization(raw)
    const handler = vi.fn()
    wrapped.on('error', handler)
    raw.emit('error', new Error('test'))
    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0].message).toBe('test')
  })

  it('close проксируется', async () => {
    const raw = makeRawClient()
    const wrapped = wrapClientForNormalization(raw)
    await wrapped.close()
    expect(raw.close).toHaveBeenCalled()
  })

  it('null/undefined client возвращается как есть', () => {
    expect(wrapClientForNormalization(null)).toBe(null)
    expect(wrapClientForNormalization(undefined)).toBe(undefined)
  })

  it('_raw expose исходный клиент', () => {
    const raw = makeRawClient()
    const wrapped = wrapClientForNormalization(raw)
    expect(wrapped._raw).toBe(raw)
  })
})

// ──────────────────────────────────────────────────────────────────────
// END-TO-END: реальный сценарий через обёрнутый клиент
// ──────────────────────────────────────────────────────────────────────

describe('реальный auth flow через wrapped client', () => {
  it('updateAuthorizationState → handler видит @type вместо _', async () => {
    const raw = makeRawClient()
    const wrapped = wrapClientForNormalization(raw)
    const handler = vi.fn()
    wrapped.on('update', handler)

    // Симулируем как реальный tdl emit-ит updates (с `_`)
    raw.emit('update', {
      _: 'updateAuthorizationState',
      authorization_state: {
        _: 'authorizationStateWaitTdlibParameters',
      },
    })
    raw.emit('update', {
      _: 'updateAuthorizationState',
      authorization_state: { _: 'authorizationStateWaitPhoneNumber' },
    })
    raw.emit('update', {
      _: 'updateAuthorizationState',
      authorization_state: { _: 'authorizationStateWaitCode' },
    })

    expect(handler).toHaveBeenCalledTimes(3)
    // Каждый вызов должен прийти с @type
    expect(handler.mock.calls[0][0]['@type']).toBe('updateAuthorizationState')
    expect(handler.mock.calls[0][0].authorization_state['@type']).toBe('authorizationStateWaitTdlibParameters')
    expect(handler.mock.calls[2][0].authorization_state['@type']).toBe('authorizationStateWaitCode')
  })
})
