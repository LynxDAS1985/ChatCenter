// v0.89.0 — Stage 4 / Этап 3.6: тесты waitForReady + finalizeAccount.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'

function makeMockClient() {
  const c = new EventEmitter()
  c.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  c.close = vi.fn(() => Promise.resolve())
  return c
}

function emitAuth(client, stateType) {
  client.emit('update', {
    '@type': 'updateAuthorizationState',
    authorization_state: { '@type': stateType },
  })
}

describe('TdlibClientManager.waitForReady', () => {
  it('Если уже Ready на момент вызова — резолвится мгновенно', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_a', {})
    const client = mgr.getClient('tg_a')
    emitAuth(client, 'authorizationStateReady')
    const r = await mgr.waitForReady('tg_a', 5000)
    expect(r.ok).toBe(true)
    expect(r.state).toBe('authorizationStateReady')
  })

  it('Резолвится когда Ready приходит позже', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_a', {})
    const client = mgr.getClient('tg_a')
    const promise = mgr.waitForReady('tg_a', 5000)
    setTimeout(() => emitAuth(client, 'authorizationStateReady'), 10)
    const r = await promise
    expect(r.ok).toBe(true)
  })

  it('WaitPhoneNumber → ok:false с need-relogin', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_a', {})
    const client = mgr.getClient('tg_a')
    const promise = mgr.waitForReady('tg_a', 5000)
    setTimeout(() => emitAuth(client, 'authorizationStateWaitPhoneNumber'), 10)
    const r = await promise
    expect(r.ok).toBe(false)
    expect(r.error).toBe('need-relogin')
    expect(r.state).toBe('authorizationStateWaitPhoneNumber')
  })

  it('WaitCode → need-relogin', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_a', {})
    const client = mgr.getClient('tg_a')
    const promise = mgr.waitForReady('tg_a', 5000)
    setTimeout(() => emitAuth(client, 'authorizationStateWaitCode'), 10)
    const r = await promise
    expect(r.ok).toBe(false)
    expect(r.error).toBe('need-relogin')
  })

  it('Closed → ok:false с closed', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_a', {})
    const client = mgr.getClient('tg_a')
    const promise = mgr.waitForReady('tg_a', 5000)
    setTimeout(() => emitAuth(client, 'authorizationStateClosed'), 10)
    const r = await promise
    expect(r.ok).toBe(false)
    expect(r.error).toBe('closed')
  })

  it('WaitTdlibParameters игнорируется (tdl сама разбирается)', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_a', {})
    const client = mgr.getClient('tg_a')
    const promise = mgr.waitForReady('tg_a', 200)
    // Сначала шлём WaitTdlibParameters — должно игнорироваться
    setTimeout(() => emitAuth(client, 'authorizationStateWaitTdlibParameters'), 10)
    // Потом Ready
    setTimeout(() => emitAuth(client, 'authorizationStateReady'), 50)
    const r = await promise
    expect(r.ok).toBe(true)
  })

  it('Таймаут → ok:false', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_a', {})
    const r = await mgr.waitForReady('tg_a', 50)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('timeout')
  })

  it('Listener снимается после resolve (нет утечек)', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_a', {})
    const before = mgr.listenerCount('account:auth-state')
    const promise = mgr.waitForReady('tg_a', 50)
    await promise
    expect(mgr.listenerCount('account:auth-state')).toBe(before)
  })
})

describe('TdlibClientManager.finalizeAccount', () => {
  it('getMe → rename → emit account:update', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('pending', {})
    const client = mgr.getClient('pending')
    client.invoke.mockResolvedValueOnce({
      '@type': 'user', id: 638454350,
      first_name: 'Иван', last_name: 'Петров',
      phone_number: '79521303032',
    })
    const updateEvent = vi.fn()
    mgr.on('account:update', updateEvent)
    const r = await mgr.finalizeAccount('pending')
    expect(r.ok).toBe(true)
    expect(r.newAccountId).toBe('tg_638454350')
    expect(mgr.listAccounts()).toEqual(['tg_638454350'])
    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tg_638454350',
      messenger: 'telegram',
      status: 'connected',
      name: 'Иван Петров',
      phone: '+79521303032',
      userId: '638454350',
    }))
  })

  it('getMe возвращает только username (без имени) → @username', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('pending', {})
    const client = mgr.getClient('pending')
    client.invoke.mockResolvedValueOnce({
      '@type': 'user', id: 999,
      usernames: { active_usernames: ['user_x'] },
    })
    const updateEvent = vi.fn()
    mgr.on('account:update', updateEvent)
    await mgr.finalizeAccount('pending')
    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: '@user_x',
    }))
  })

  it('accountId не существует → ok:false', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    const r = await mgr.finalizeAccount('tg_nope')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no client')
  })

  it('getMe падает → ok:false с error', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('pending', {})
    const client = mgr.getClient('pending')
    client.invoke.mockRejectedValueOnce(new Error('CONNECTION_LOST'))
    const r = await mgr.finalizeAccount('pending')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('CONNECTION_LOST')
  })

  it('getMe возвращает без id → ok:false', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('pending', {})
    const client = mgr.getClient('pending')
    client.invoke.mockResolvedValueOnce({ '@type': 'user' })  // нет id
    const r = await mgr.finalizeAccount('pending')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no id')
  })

  it('Если client уже с правильным id (без pending) — getMe всё равно вызывается', async () => {
    const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
    mgr.createAccount('tg_638454350', {})
    const client = mgr.getClient('tg_638454350')
    client.invoke.mockResolvedValueOnce({
      '@type': 'user', id: 638454350, first_name: 'Иван', phone_number: '79521303032',
    })
    const r = await mgr.finalizeAccount('tg_638454350')
    expect(r.ok).toBe(true)
    expect(r.newAccountId).toBe('tg_638454350')
    expect(mgr.listAccounts()).toEqual(['tg_638454350'])
  })
})
