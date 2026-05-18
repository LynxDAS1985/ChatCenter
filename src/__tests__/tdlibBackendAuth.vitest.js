// v0.89.34: вынесено из tdlibBackend.vitest.js (был 373 строк, лимит 400).
// Покрывает: backend.auth (login flow, finalizePending, removeAccount),
// backend.media (dispatch), backend.forum (stub).

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'

function makeMockClient(invokeImpl) {
  const client = new EventEmitter()
  client.invoke = vi.fn(invokeImpl || (() => Promise.resolve({ '@type': 'ok' })))
  client.close = vi.fn(() => Promise.resolve())
  return client
}

function makeBackend() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_main', {})
  const backend = createTdlibBackend({
    manager: mgr,
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
  })
  return { mgr, mockClient, backend }
}

describe('backend.auth', () => {
  it('startLogin создаёт временный аккаунт и запускает flow', async () => {
    const { backend, mgr } = makeBackend()
    const beforeCount = mgr.listAccounts().length
    const promise = backend.auth.startLogin('+71234567890')
    const afterCount = mgr.listAccounts().length
    expect(afterCount).toBe(beforeCount + 1)
    const pendingAid = mgr.listAccounts().find(a => a.startsWith('tg_pending_'))
    const pendingClient = mgr.getClient(pendingAid)
    pendingClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitCode' },
    })
    const r = await promise
    expect(r).toEqual({ ok: true, step: 'code' })
  })

  it('submitCode без активного flow → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.auth.submitCode('12345')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no login in progress')
  })

  it('cancelLogin без активного flow → ok: true', async () => {
    const { backend } = makeBackend()
    const r = await backend.auth.cancelLogin()
    expect(r.ok).toBe(true)
  })

  it('startLogin без phone → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.auth.startLogin('')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('phone required')
  })

  it('finalizePending: после успешного submitPassword → getMe + rename + emit account:update', async () => {
    const { backend, mgr } = makeBackend()
    const accountUpdateEvent = vi.fn()
    mgr.on('account:update', accountUpdateEvent)
    const promise = backend.auth.startLogin('+71234567890')
    const pendingAid = mgr.listAccounts().find(a => a.startsWith('tg_pending_'))
    const pendingClient = mgr.getClient(pendingAid)
    pendingClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitCode' },
    })
    await promise
    const codePromise = backend.auth.submitCode('12345')
    pendingClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitPassword' },
    })
    await codePromise
    pendingClient.invoke.mockResolvedValueOnce({ '@type': 'ok' })
    pendingClient.invoke.mockResolvedValueOnce({
      '@type': 'user', id: 638454350,
      first_name: 'Иван', last_name: 'Петров',
      phone_number: '79521303032',
    })
    const pwdPromise = backend.auth.submitPassword('mypass')
    pendingClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateReady' },
    })
    const pwdResult = await pwdPromise
    expect(pwdResult.ok).toBe(true)
    expect(pwdResult.success).toBe(true)
    expect(pendingClient.invoke).toHaveBeenCalledWith({ '@type': 'getMe' })
    expect(mgr.listAccounts()).toContain('tg_638454350')
    expect(mgr.listAccounts()).not.toContain(pendingAid)
    expect(accountUpdateEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tg_638454350',
      messenger: 'telegram',
      status: 'connected',
      name: 'Иван Петров',
      phone: '+79521303032',
    }))
  })

  it('removeAccount проксирует в manager', async () => {
    const { backend } = makeBackend()
    const r = await backend.auth.removeAccount('tg_main')
    expect(r.ok).toBe(true)
  })
})

describe('backend.media', () => {
  it('download с invalid chatId', async () => {
    const { backend } = makeBackend()
    const r = await backend.media.download({ chatId: 'invalid', msgId: 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid chatId')
  })

  it('cleanup — вызывает optimizeStorage для каждого аккаунта', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ size: 1024 })
    const r = await backend.media.cleanup()
    expect(r.ok).toBe(true)
    expect(r.freedBytes).toBe(1024)
  })

  it('getCacheSize — суммирует по аккаунтам', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'storageStatisticsFast', files_size: 2048, file_count: 5,
    })
    const r = await backend.media.getCacheSize()
    expect(r.bytes).toBe(2048)
  })
})

describe('backend.forum', () => {
  it('forum.getTopicMessages — alias к messages.getTopic, NOT_IMPL по соглашению', async () => {
    const { backend } = makeBackend()
    const r = await backend.forum.getTopicMessages({ chatId: 'tg_main:-1' })
    expect(r.ok).toBe(false)
  })

  it('getTopicMessages возвращает NOT_IMPL', async () => {
    const { backend } = makeBackend()
    const r = await backend.forum.getTopicMessages({ chatId: 'tg_main:-1' })
    expect(r.ok).toBe(false)
  })
})
