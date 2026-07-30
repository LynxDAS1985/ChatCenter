// v0.89.34: вынесено из tdlibBackend.vitest.js (был 373 строк, лимит 400).
// Покрывает: backend.auth (login flow, finalizePending, removeAccount),
// backend.media (dispatch), backend.forum (stub).

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

  // v1.2.145: регресс-тест бага «удалил аккаунт → остаётся папка-призрак».
  // Папка сессии названа именем СОЗДАНИЯ (accountSubdir), аккаунт потом переименован
  // (tg_pending_X → tg_realId). removeAccount должен удалить папку по имени создания,
  // а не по переименованному id (иначе папка остаётся и воскрешает призрака при старте).
  it('removeAccount удаляет папку по имени создания (accountSubdir), а не по новому id', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sess-'))
    const folder = path.join(tmp, 'tdlib-sessions', 'tg_pending_test')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'db.sqlite'), 'x')

    const mockClient = makeMockClient()
    const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
    mgr.createAccount('tg_pending_test', { accountSubdir: 'tg_pending_test' })
    mgr._renameAccount('tg_pending_test', 'tg_999') // симулируем финализацию логина

    const backend = createTdlibBackend({ manager: mgr, userDataDir: tmp })
    const r = await backend.auth.removeAccount('tg_999')
    expect(r.ok).toBe(true)
    expect(fs.existsSync(folder)).toBe(false) // папка-«времянка» реально удалена

    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (_) {}
  })

  // v1.2.146: удаление аккаунта чистит и дисковый кэш-файл tg-cache-<id>.json (по ТЕКУЩЕМУ id).
  it('removeAccount удаляет кэш-файл tg-cache-<accountId>.json', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cache-'))
    const cacheFile = path.join(tmp, 'tg-cache-tg_999.json')
    fs.writeFileSync(cacheFile, '{"chats":[]}')

    const mockClient = makeMockClient()
    const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
    mgr.createAccount('tg_pending_test', { accountSubdir: 'tg_pending_test' })
    mgr._renameAccount('tg_pending_test', 'tg_999')

    const backend = createTdlibBackend({ manager: mgr, userDataDir: tmp })
    await backend.auth.removeAccount('tg_999')
    expect(fs.existsSync(cacheFile)).toBe(false) // кэш-файл (по финальному id) удалён

    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (_) {}
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
