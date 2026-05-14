// v0.89.0 — Stage 4 / Этап 3.5: тесты _renameAccount для TdlibClientManager.
//
// Вынесено в отдельный файл из tdlibClient.vitest.js (тот достиг лимита 400 строк).
// _renameAccount нужен в post-login flow: tg_pending_${ts} → tg_${realUserId}.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'

function makeMockClient() {
  const c = new EventEmitter()
  c.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  c.close = vi.fn(() => Promise.resolve())
  return c
}

function makeManager() {
  const mgr = new TdlibClientManager({ clientFactory: () => makeMockClient() })
  return mgr
}

describe('TdlibClientManager._renameAccount', () => {
  it('меняет id в Map + эмитит account:renamed', () => {
    const mgr = makeManager()
    mgr.createAccount('tg_pending_X', { apiId: 1 })
    const renameEvent = vi.fn()
    mgr.on('account:renamed', renameEvent)
    const ok = mgr._renameAccount('tg_pending_X', 'tg_42')
    expect(ok).toBe(true)
    expect(mgr.listAccounts()).toEqual(['tg_42'])
    expect(renameEvent).toHaveBeenCalledWith({ oldId: 'tg_pending_X', newId: 'tg_42' })
  })

  it('запись record.accountId обновляется', () => {
    const mgr = makeManager()
    mgr.createAccount('tg_pending_Y', {})
    mgr._renameAccount('tg_pending_Y', 'tg_99')
    // getClient теперь работает только по новому id
    expect(mgr.getClient('tg_pending_Y')).toBe(null)
    expect(mgr.getClient('tg_99')).toBeTruthy()
  })

  it('user/chat cache переезжают с записью', () => {
    const mgr = makeManager()
    mgr.createAccount('tg_pending_Z', {})
    const client = mgr.getClient('tg_pending_Z')
    client.emit('update', { '@type': 'updateUser', user: { id: 5, first_name: 'X' } })
    expect(mgr.getUserCached('tg_pending_Z', 5)?.first_name).toBe('X')
    mgr._renameAccount('tg_pending_Z', 'tg_888')
    // Cache доступен по новому id
    expect(mgr.getUserCached('tg_888', 5)?.first_name).toBe('X')
  })

  it('целевое имя занято → false (без изменений)', () => {
    const mgr = makeManager()
    mgr.createAccount('tg_a', {})
    mgr.createAccount('tg_b', {})
    const renameEvent = vi.fn()
    mgr.on('account:renamed', renameEvent)
    expect(mgr._renameAccount('tg_a', 'tg_b')).toBe(false)
    expect(mgr.listAccounts().sort()).toEqual(['tg_a', 'tg_b'])
    expect(renameEvent).not.toHaveBeenCalled()
  })

  it('oldId не найден → false', () => {
    const mgr = makeManager()
    expect(mgr._renameAccount('tg_nope', 'tg_x')).toBe(false)
  })

  it('oldId === newId → false (noop)', () => {
    const mgr = makeManager()
    mgr.createAccount('tg_same', {})
    expect(mgr._renameAccount('tg_same', 'tg_same')).toBe(false)
  })

  it('пустые id → false', () => {
    const mgr = makeManager()
    mgr.createAccount('tg_x', {})
    expect(mgr._renameAccount('', 'tg_new')).toBe(false)
    expect(mgr._renameAccount('tg_x', '')).toBe(false)
  })
})
