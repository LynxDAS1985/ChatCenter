// v0.89.34: вынесено из tdlibClient.vitest.js (был 396 строк, лимит 400).
// Покрывает: auth state, errors, updateDeleteMessages, updateFile, getAccountChats.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'

function makeMockClient() {
  const client = new EventEmitter()
  client.close = vi.fn(() => Promise.resolve())
  client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  return client
}
function makeManager() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  return { mgr, mockClient }
}

describe('auth state + errors', () => {
  it('updateAuthorizationState → emit account:auth-state + сохраняет в getAuthState', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const authEvent = vi.fn()
    mgr.on('account:auth-state', authEvent)
    mockClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitPhoneNumber' },
    })
    expect(authEvent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'tg_a',
      state: 'authorizationStateWaitPhoneNumber',
    }))
    expect(mgr.getAuthState('tg_a')).toBe('authorizationStateWaitPhoneNumber')
  })

  it('client.error → emit account:error', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const errEvent = vi.fn()
    mgr.on('account:error', errEvent)
    const err = new Error('test error')
    mockClient.emit('error', err)
    expect(errEvent).toHaveBeenCalledWith({ accountId: 'tg_a', error: err })
  })

  it('updateDeleteMessages is_permanent → message:deleted', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const delEvent = vi.fn()
    mgr.on('message:deleted', delEvent)
    mockClient.emit('update', {
      '@type': 'updateDeleteMessages',
      chat_id: -1, message_ids: [100, 101], is_permanent: true,
    })
    expect(delEvent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'tg_a', chatId: 'tg_a:-1',
      messageIds: ['100', '101'],
    }))
  })

  it('updateDeleteMessages is_permanent=false → не эмитим', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const delEvent = vi.fn()
    mgr.on('message:deleted', delEvent)
    mockClient.emit('update', {
      '@type': 'updateDeleteMessages',
      chat_id: -1, message_ids: [1], is_permanent: false,
    })
    expect(delEvent).not.toHaveBeenCalled()
  })

  it('неизвестный @type → update:raw', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const rawEvent = vi.fn()
    mgr.on('update:raw', rawEvent)
    mockClient.emit('update', { '@type': 'updateFutureThing', some: 'data' })
    expect(rawEvent).toHaveBeenCalled()
  })

  it('updateFile → file:update event с { accountId, file }', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const fileEvent = vi.fn()
    mgr.on('file:update', fileEvent)
    const file = { id: 100, local: { downloaded_size: 50000, is_downloading_completed: false } }
    mockClient.emit('update', { '@type': 'updateFile', file })
    expect(fileEvent).toHaveBeenCalledWith({ accountId: 'tg_a', file })
  })
})

describe('getAccountChats', () => {
  it('возвращает список замапленных чатов из cache', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: 1, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'A', unread_count: 0 },
    })
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 5, is_channel: true }, title: 'B', unread_count: 3 },
    })
    const chats = mgr.getAccountChats('tg_a')
    expect(chats).toHaveLength(2)
    expect(chats.find(c => c.id === 'tg_a:1')?.title).toBe('A')
    expect(chats.find(c => c.id === 'tg_a:-1001')?.type).toBe('channel')
  })

  it('пустой аккаунт → пустой массив', () => {
    const { mgr } = makeManager()
    mgr.createAccount('tg_a', {})
    expect(mgr.getAccountChats('tg_a')).toEqual([])
  })

  it('несуществующий аккаунт → пустой массив', () => {
    const { mgr } = makeManager()
    expect(mgr.getAccountChats('tg_nope')).toEqual([])
  })
})
