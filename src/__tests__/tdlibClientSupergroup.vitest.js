// v0.89.25: тесты supergroup cache для TdlibClientManager.
// Вынесены из tdlibClient.vitest.js (тот превышал лимит 400 строк).
//
// Контекст: TDLib шлёт `updateSupergroup` ОТДЕЛЬНО от `updateNewChat`. В этом
// событии — объект `supergroup` с `is_forum`, `is_channel`, `is_broadcast_group`,
// `status` и т.п. Поле `is_forum` отсутствует в `chatTypeSupergroup` (это
// внутренняя ссылка через supergroup_id). См. ловушка #24 в mistakes/tdlib-forum.md.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'

function makeMockClient() {
  const client = new EventEmitter()
  client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  client.close = vi.fn(() => Promise.resolve())
  return client
}

function makeManager() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  return { mgr, mockClient }
}

describe('supergroup cache via updateSupergroup', () => {
  it('updateSupergroup сохраняется в supergroupCache', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 999, is_channel: false, is_forum: true },
    })
    const sg = mgr.getSupergroup('tg_a', 999)
    expect(sg).toBeDefined()
    expect(sg.is_forum).toBe(true)
    expect(sg.id).toBe(999)
  })

  it('getSupergroup возвращает null если supergroup не закеширован', () => {
    const { mgr } = makeManager()
    mgr.createAccount('tg_a', {})
    expect(mgr.getSupergroup('tg_a', 12345)).toBe(null)
  })

  it('getSupergroup возвращает null при null/undefined supergroupId', () => {
    const { mgr } = makeManager()
    mgr.createAccount('tg_a', {})
    expect(mgr.getSupergroup('tg_a', null)).toBe(null)
    expect(mgr.getSupergroup('tg_a', undefined)).toBe(null)
  })

  it('updateSupergroup обновляет существующую запись (is_forum может прийти позже)', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 555, is_forum: false },
    })
    expect(mgr.getSupergroup('tg_a', 555).is_forum).toBe(false)
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 555, is_forum: true },
    })
    expect(mgr.getSupergroup('tg_a', 555).is_forum).toBe(true)
  })

  it('updateSupergroup для несуществующего account — не падает', () => {
    const { mockClient } = makeManager()
    expect(() => mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 999, is_forum: true },
    })).not.toThrow()
  })
})
