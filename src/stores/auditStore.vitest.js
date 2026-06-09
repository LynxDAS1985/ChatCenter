// v0.98.0 (Phase 2 M2.4): тесты Audit Log store.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createAuditRecord,
  logAuditEvent,
  listAuditEvents,
  clearOldAudit,
  getRecentRevertableActions,
  _internal,
} from './auditStore.js'

describe('createAuditRecord', () => {
  it('создаёт запись с обязательными полями', () => {
    const r = createAuditRecord({
      actor: 'ai',
      actorId: 'ai_anthropic',
      actionId: 'reply_to_message',
      source: { messengerId: 'native_cc' },
      args: { text: 'Hi' },
      permissionResult: 'confirmed',
      executionResult: 'ok',
      durationMs: 234,
    })
    expect(r.id).toMatch(/^audit_/)
    expect(r.timestamp).toBeGreaterThan(0)
    expect(r.actor).toBe('ai')
    expect(r.actionId).toBe('reply_to_message')
  })

  it('обрезает длинный text', () => {
    const longText = 'A'.repeat(500)
    const r = createAuditRecord({ actionId: 'x', args: { text: longText } })
    expect(r.args.text.length).toBe(201)
    expect(r.args.text.endsWith('…')).toBe(true)
  })

  it('скрывает API keys / secrets', () => {
    const r = createAuditRecord({
      actionId: 'x',
      args: { apiKey: 'sk-secret-123', clientSecret: 'oauth', text: 'hi' },
    })
    expect(r.args.apiKey).toBe('[REDACTED]')
    expect(r.args.clientSecret).toBe('[REDACTED]')
    expect(r.args.text).toBe('hi')
  })

  it('пустой params → defaults', () => {
    const r = createAuditRecord(null)
    expect(r.actor).toBe('unknown')
    expect(r.actionId).toBe('unknown')
    expect(r.source).toBe(null)
  })
})

describe('logAuditEvent', () => {
  let invokeMock
  beforeEach(() => {
    invokeMock = vi.fn()
    globalThis.window = { api: { invoke: invokeMock } }
  })
  afterEach(() => {
    delete globalThis.window
  })

  it('успешный invoke', async () => {
    invokeMock.mockResolvedValue({ ok: true, id: 'audit_xxx' })
    const r = await logAuditEvent({ actionId: 'goto_message' })
    expect(r.ok).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('audit:log', expect.objectContaining({
      actionId: 'goto_message',
    }))
  })

  it('нет window.api → ok:false', async () => {
    delete globalThis.window.api
    const r = await logAuditEvent({ actionId: 'x' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_ipc')
  })

  it('invoke throws → graceful', async () => {
    invokeMock.mockRejectedValue(new Error('IPC fail'))
    const r = await logAuditEvent({ actionId: 'x' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('IPC fail')
  })
})

describe('listAuditEvents / clearOldAudit / getRecentRevertableActions', () => {
  let invokeMock
  beforeEach(() => {
    invokeMock = vi.fn(() => Promise.resolve({ ok: true, records: [] }))
    globalThis.window = { api: { invoke: invokeMock } }
  })
  afterEach(() => {
    delete globalThis.window
  })

  it('listAuditEvents с фильтром', async () => {
    await listAuditEvents({ actionId: 'reply_to_message' }, 50)
    expect(invokeMock).toHaveBeenCalledWith('audit:list', {
      filter: { actionId: 'reply_to_message' },
      limit: 50,
    })
  })

  it('clearOldAudit', async () => {
    await clearOldAudit(30)
    expect(invokeMock).toHaveBeenCalledWith('audit:clear', { olderThanDays: 30 })
  })

  it('getRecentRevertableActions default count=5', async () => {
    await getRecentRevertableActions()
    expect(invokeMock).toHaveBeenCalledWith('audit:recent-revertable', { count: 5 })
  })
})

describe('_internal helpers', () => {
  it('sanitizeArgs null → null', () => {
    expect(_internal.sanitizeArgs(null)).toBe(null)
  })

  it('TEXT_PREVIEW_LIMIT = 200', () => {
    expect(_internal.TEXT_PREVIEW_LIMIT).toBe(200)
  })

  it('generateId уникален', () => {
    const ts = Date.now()
    const id1 = _internal.generateId(ts)
    const id2 = _internal.generateId(ts)
    expect(id1).not.toBe(id2)
  })
})
