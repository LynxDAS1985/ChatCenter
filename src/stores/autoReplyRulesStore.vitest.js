// v1.1.0: тесты autoReplyRulesStore.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createRuleRecord,
  createRule,
  listRules,
  updateRule,
  deleteRule,
  toggleRule,
  _internal,
} from './autoReplyRulesStore.js'

describe('createRuleRecord', () => {
  it('минимальные параметры → defaults', () => {
    const r = createRuleRecord({ name: 'X' })
    expect(r.id).toMatch(/^rule_/)
    expect(r.name).toBe('X')
    expect(r.enabled).toBe(true)
    expect(r.triggers.chatIds).toEqual([])
    expect(r.triggers.keywords).toEqual([])
    expect(r.triggers.keywordsMode).toBe('any')
    expect(r.triggers.schedule.enabled).toBe(false)
    expect(r.triggers.excludeBots).toBe(true)
    expect(r.triggers.excludeChannels).toBe(true)
    expect(r.triggers.excludeOutgoing).toBe(true)
    expect(r.action.type).toBe('ai_reply')
    expect(r.cooldownMinutes).toBe(60)
  })

  it('name обрезается до 100 символов', () => {
    const r = createRuleRecord({ name: 'A'.repeat(200) })
    expect(r.name.length).toBe(100)
  })

  it('пустой name → fallback', () => {
    expect(createRuleRecord({}).name).toBe('Правило без названия')
  })

  it('keywordsMode валидация — только any/all', () => {
    expect(createRuleRecord({ triggers: { keywordsMode: 'all' } }).triggers.keywordsMode).toBe('all')
    expect(createRuleRecord({ triggers: { keywordsMode: 'evil' } }).triggers.keywordsMode).toBe('any')
  })

  it('keywords ограничены до 50, фильтр пустых', () => {
    const r = createRuleRecord({ triggers: { keywords: ['a', '', 'b', null, 'c'] } })
    expect(r.triggers.keywords).toEqual(['a', 'b', 'c'])
  })

  it('action.type валидация — только ai_reply/mark_read', () => {
    expect(createRuleRecord({ action: { type: 'mark_read' } }).action.type).toBe('mark_read')
    expect(createRuleRecord({ action: { type: 'shrek_attack' } }).action.type).toBe('ai_reply')
  })

  it('schedule с invalid days → фильтрует', () => {
    const r = createRuleRecord({ triggers: { schedule: { enabled: true, days: [0, 1, 8, 5] } } })
    expect(r.triggers.schedule.days).toEqual([1, 5])
  })

  it('cooldownMinutes invalid → default 60', () => {
    expect(createRuleRecord({ cooldownMinutes: -10 }).cooldownMinutes).toBe(60)
    expect(createRuleRecord({ cooldownMinutes: 0 }).cooldownMinutes).toBe(60)
  })

  it('cooldownMinutes > 24h → clamp', () => {
    expect(createRuleRecord({ cooldownMinutes: 5000 }).cooldownMinutes).toBe(24 * 60)
  })

  it('excludeOutgoing false (явно) → false (default true)', () => {
    expect(createRuleRecord({ triggers: { excludeOutgoing: false } }).triggers.excludeOutgoing).toBe(false)
  })
})

describe('IPC wrappers', () => {
  let invokeMock

  beforeEach(() => {
    invokeMock = vi.fn().mockResolvedValue({ ok: true })
    globalThis.window = { api: { invoke: invokeMock } }
  })

  afterEach(() => { delete globalThis.window })

  it('createRule создаёт rule + invoke auto-reply:create', async () => {
    await createRule({ name: 'X' })
    expect(invokeMock).toHaveBeenCalledWith('auto-reply:create', expect.objectContaining({ name: 'X' }))
  })

  it('listRules → auto-reply:list', async () => {
    invokeMock.mockResolvedValueOnce({ ok: true, rules: [] })
    await listRules()
    expect(invokeMock).toHaveBeenCalledWith('auto-reply:list')
  })

  it('updateRule', async () => {
    await updateRule('rule_1', { enabled: false })
    expect(invokeMock).toHaveBeenCalledWith('auto-reply:update', { ruleId: 'rule_1', updates: { enabled: false } })
  })

  it('deleteRule', async () => {
    await deleteRule('rule_1')
    expect(invokeMock).toHaveBeenCalledWith('auto-reply:delete', { ruleId: 'rule_1' })
  })

  it('toggleRule(id, true) → updateRule с enabled:true', async () => {
    await toggleRule('rule_1', true)
    expect(invokeMock).toHaveBeenCalledWith('auto-reply:update', { ruleId: 'rule_1', updates: { enabled: true } })
  })

  it('createRule без window.api → ok:false', async () => {
    delete globalThis.window.api
    const r = await createRule({ name: 'X' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_ipc')
  })

  it('IPC throw → ok:false', async () => {
    invokeMock.mockRejectedValueOnce(new Error('boom'))
    const r = await createRule({ name: 'X' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })
})

describe('_internal', () => {
  it('generateId уникален', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) ids.add(_internal.generateId())
    expect(ids.size).toBe(100)
  })
})
