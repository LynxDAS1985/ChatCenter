// v1.2.8: тесты импорта/экспорта правил.

import { describe, it, expect } from 'vitest'
import { exportRulesToJson, parseImportJson } from './rulesImportExport.js'

const sampleRule = {
  id: 'r1',
  name: 'Test',
  enabled: true,
  triggers: {
    chatIds: ['c1'],
    messengerIds: [],
    senderIds: [],
    keywords: ['счёт'],
    keywordsMode: 'any',
    schedule: { enabled: false },
    excludeBots: true,
    excludeChannels: true,
    excludeOutgoing: true,
  },
  action: { type: 'ai_reply', aiPromptHint: 'Ответь дружелюбно' },
  cooldownMinutes: 60,
  matchedCount: 42,
  lastMatchedAt: 1700000000000,
}

describe('exportRulesToJson', () => {
  it('не-массив → throw', () => {
    expect(() => exportRulesToJson(null)).toThrow(/массивом/)
    expect(() => exportRulesToJson({})).toThrow()
  })

  it('возвращает валидный JSON', () => {
    const json = exportRulesToJson([sampleRule])
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('содержит ccVersion и exportedAt', () => {
    const json = exportRulesToJson([sampleRule], '1.2.8')
    const obj = JSON.parse(json)
    expect(obj.ccVersion).toBe('1.2.8')
    expect(obj.exportedAt).toBeTruthy()
    expect(new Date(obj.exportedAt).getTime()).toBeGreaterThan(0)
  })

  it('убирает runtime поля (id / matchedCount / lastMatchedAt)', () => {
    const json = exportRulesToJson([sampleRule])
    const obj = JSON.parse(json)
    expect(obj.rules[0].id).toBeUndefined()
    expect(obj.rules[0].matchedCount).toBeUndefined()
    expect(obj.rules[0].lastMatchedAt).toBeUndefined()
  })

  it('сохраняет name / triggers / action / cooldownMinutes', () => {
    const json = exportRulesToJson([sampleRule])
    const obj = JSON.parse(json)
    const r = obj.rules[0]
    expect(r.name).toBe('Test')
    expect(r.triggers.chatIds).toEqual(['c1'])
    expect(r.action.type).toBe('ai_reply')
    expect(r.action.aiPromptHint).toBe('Ответь дружелюбно')
    expect(r.cooldownMinutes).toBe(60)
  })

  it('пустой массив → валидный JSON с rules:[]', () => {
    const json = exportRulesToJson([])
    expect(JSON.parse(json).rules).toEqual([])
  })
})

describe('parseImportJson — ошибки', () => {
  it('пустая строка → error', () => {
    const r = parseImportJson('')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/пустой/)
  })

  it('невалидный JSON → error', () => {
    const r = parseImportJson('{not json}')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/JSON/)
  })

  it('не объект → error', () => {
    const r = parseImportJson(JSON.stringify([1, 2, 3]))
    expect(r.ok).toBe(false)
  })

  it('нет rules массива → error', () => {
    const r = parseImportJson(JSON.stringify({ foo: 'bar' }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/rules/)
  })

  it('пустой rules → error «ни одного валидного»', () => {
    const r = parseImportJson(JSON.stringify({ rules: [] }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Ни одного валидного/)
  })
})

describe('parseImportJson — валидация правил', () => {
  it('правило без name → пропущено + warning', () => {
    const r = parseImportJson(JSON.stringify({
      rules: [
        { action: { type: 'ai_reply' }, triggers: {} },  // без name
        { name: 'ok', action: { type: 'ai_reply' }, triggers: {} },
      ],
    }))
    expect(r.ok).toBe(true)
    expect(r.rules).toHaveLength(1)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('правило без action.type → пропущено', () => {
    const r = parseImportJson(JSON.stringify({
      rules: [
        { name: 'x', action: {}, triggers: {} },
      ],
    }))
    expect(r.ok).toBe(false)
  })

  it('неизвестный action.type → пропущено', () => {
    const r = parseImportJson(JSON.stringify({
      rules: [
        { name: 'x', action: { type: 'magic' }, triggers: {} },
      ],
    }))
    expect(r.ok).toBe(false)
  })

  it('action.type ai_reply / mark_read оба валидны', () => {
    const r = parseImportJson(JSON.stringify({
      rules: [
        { name: 'a', action: { type: 'ai_reply' }, triggers: {} },
        { name: 'b', action: { type: 'mark_read' }, triggers: {} },
      ],
    }))
    expect(r.ok).toBe(true)
    expect(r.rules).toHaveLength(2)
  })

  it('старая версия v1.0.0 → warning, но импорт продолжается', () => {
    const r = parseImportJson(JSON.stringify({
      ccVersion: '1.0.0',
      rules: [{ name: 'x', action: { type: 'ai_reply' }, triggers: {} }],
    }))
    expect(r.ok).toBe(true)
    expect(r.warnings.some(w => w.includes('1.0.0'))).toBe(true)
  })

  it('текущая версия v1.2.8 → нет warning', () => {
    const r = parseImportJson(JSON.stringify({
      ccVersion: '1.2.8',
      rules: [{ name: 'x', action: { type: 'ai_reply' }, triggers: {} }],
    }))
    expect(r.ok).toBe(true)
    expect(r.warnings.find(w => w.includes('версии'))).toBeFalsy()
  })

  it('useBridge сохраняется', () => {
    const r = parseImportJson(JSON.stringify({
      rules: [{
        name: 'x',
        action: { type: 'ai_reply', useBridge: true, aiPromptHint: 'hi' },
        triggers: {},
      }],
    }))
    expect(r.ok).toBe(true)
    expect(r.rules[0].action.useBridge).toBe(true)
  })

  it('runtime поля (id, matchedCount) обрезаются — не должны попасть', () => {
    const r = parseImportJson(JSON.stringify({
      rules: [{
        id: 'old-id',
        matchedCount: 99,
        name: 'x',
        action: { type: 'ai_reply' },
        triggers: {},
      }],
    }))
    expect(r.rules[0].id).toBeUndefined()
    expect(r.rules[0].matchedCount).toBeUndefined()
  })

  it('keywordsMode не all → нормализуется в any', () => {
    const r = parseImportJson(JSON.stringify({
      rules: [{
        name: 'x',
        action: { type: 'ai_reply' },
        triggers: { keywordsMode: 'foo' },
      }],
    }))
    expect(r.rules[0].triggers.keywordsMode).toBe('any')
  })

  it('cooldownMinutes из 0 → 60 default', () => {
    const r = parseImportJson(JSON.stringify({
      rules: [{
        name: 'x',
        action: { type: 'ai_reply' },
        triggers: {},
        cooldownMinutes: 0,
      }],
    }))
    expect(r.rules[0].cooldownMinutes).toBe(60)
  })
})

describe('export → import round-trip', () => {
  it('экспортированные правила можно импортировать обратно', () => {
    const original = [
      { name: 'R1', enabled: true,
        triggers: { chatIds: ['c1'], keywords: ['k'], keywordsMode: 'any',
                    schedule: { enabled: false }, excludeBots: true, excludeChannels: true, excludeOutgoing: true,
                    messengerIds: [], senderIds: [] },
        action: { type: 'ai_reply', aiPromptHint: 'привет' },
        cooldownMinutes: 30 },
    ]
    const json = exportRulesToJson(original)
    const r = parseImportJson(json)
    expect(r.ok).toBe(true)
    expect(r.rules).toHaveLength(1)
    expect(r.rules[0].name).toBe('R1')
    expect(r.rules[0].action.aiPromptHint).toBe('привет')
    expect(r.rules[0].cooldownMinutes).toBe(30)
  })
})
