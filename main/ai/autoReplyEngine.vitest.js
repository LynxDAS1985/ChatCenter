// v1.1.0: тесты autoReplyEngine — все pure functions, no mocks.

import { describe, it, expect } from 'vitest'
import {
  matchRule,
  findMatchingRules,
  checkCooldown,
  checkSchedule,
  checkKeywords,
  describeRuleMatch,
  _internal,
} from './autoReplyEngine.js'

// ─── checkKeywords ──────────────────────────────────────────────────────────

describe('checkKeywords', () => {
  it('пустой массив keywords → true (нет фильтра)', () => {
    expect(checkKeywords([], 'any', 'hello')).toBe(true)
    expect(checkKeywords(null, 'any', 'hello')).toBe(true)
  })

  it('mode=any → true если хотя бы один keyword содержится', () => {
    expect(checkKeywords(['счёт', 'invoice'], 'any', 'нужен счёт пожалуйста')).toBe(true)
    expect(checkKeywords(['счёт', 'invoice'], 'any', 'send invoice please')).toBe(true)
    expect(checkKeywords(['счёт', 'invoice'], 'any', 'привет как дела')).toBe(false)
  })

  it('mode=all → true только если ВСЕ keywords содержатся', () => {
    expect(checkKeywords(['счёт', 'срочно'], 'all', 'счёт нужен срочно')).toBe(true)
    expect(checkKeywords(['счёт', 'срочно'], 'all', 'нужен счёт')).toBe(false)
  })

  it('case-insensitive', () => {
    expect(checkKeywords(['Hello'], 'any', 'hello world')).toBe(true)
    expect(checkKeywords(['привет'], 'any', 'ПРИВЕТ')).toBe(true)
  })

  it('пустой text → false если есть keywords', () => {
    expect(checkKeywords(['x'], 'any', '')).toBe(false)
    expect(checkKeywords(['x'], 'any', null)).toBe(false)
  })
})

// ─── checkSchedule ──────────────────────────────────────────────────────────

describe('checkSchedule', () => {
  it('schedule отключён → true', () => {
    expect(checkSchedule({ enabled: false }, Date.now())).toBe(true)
    expect(checkSchedule(null, Date.now())).toBe(true)
  })

  // Используем фиксированную дату: 2026-06-09 (Вт) 14:00 локального времени
  const tueAt14 = new Date(2026, 5, 9, 14, 0, 0).getTime()
  const tueAt7 = new Date(2026, 5, 9, 7, 0, 0).getTime()
  const tueAt19 = new Date(2026, 5, 9, 19, 0, 0).getTime()
  const satAt14 = new Date(2026, 5, 13, 14, 0, 0).getTime()  // Сб

  it('пн-пт 09:00-18:00 — вторник 14:00 → true', () => {
    const s = { enabled: true, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }
    expect(checkSchedule(s, tueAt14)).toBe(true)
  })

  it('пн-пт 09:00-18:00 — вторник 07:00 → false (рано)', () => {
    const s = { enabled: true, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }
    expect(checkSchedule(s, tueAt7)).toBe(false)
  })

  it('пн-пт 09:00-18:00 — вторник 19:00 → false (поздно)', () => {
    const s = { enabled: true, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }
    expect(checkSchedule(s, tueAt19)).toBe(false)
  })

  it('пн-пт — суббота 14:00 → false (не тот день)', () => {
    const s = { enabled: true, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }
    expect(checkSchedule(s, satAt14)).toBe(false)
  })

  it('через полночь — from=22:00 to=06:00 — Вт 23:00 → true', () => {
    const tueAt23 = new Date(2026, 5, 9, 23, 0, 0).getTime()
    const s = { enabled: true, days: [1, 2], from: '22:00', to: '06:00' }
    expect(checkSchedule(s, tueAt23)).toBe(true)
  })

  it('через полночь — Вт 12:00 → false', () => {
    const s = { enabled: true, days: [1, 2], from: '22:00', to: '06:00' }
    expect(checkSchedule(s, tueAt14)).toBe(false)
  })

  it('parseTimeMinutes — invalid → -1', () => {
    expect(_internal.parseTimeMinutes('25:00')).toBe(-1)
    expect(_internal.parseTimeMinutes('9:99')).toBe(-1)
    expect(_internal.parseTimeMinutes('abc')).toBe(-1)
    expect(_internal.parseTimeMinutes(null)).toBe(-1)
  })
})

// ─── checkCooldown ──────────────────────────────────────────────────────────

describe('checkCooldown', () => {
  it('lastMatchedAt=null → true (никогда не срабатывало)', () => {
    expect(checkCooldown({ lastMatchedAt: null, cooldownMinutes: 60 }, Date.now())).toBe(true)
  })

  it('cooldown=0 → true (нет cooldown)', () => {
    expect(checkCooldown({ lastMatchedAt: Date.now(), cooldownMinutes: 0 }, Date.now())).toBe(true)
  })

  it('прошло меньше cooldown → false', () => {
    const now = Date.now()
    const rule = { lastMatchedAt: now - 30 * 60 * 1000, cooldownMinutes: 60 }  // 30мин назад, cooldown 60
    expect(checkCooldown(rule, now)).toBe(false)
  })

  it('прошло больше cooldown → true', () => {
    const now = Date.now()
    const rule = { lastMatchedAt: now - 90 * 60 * 1000, cooldownMinutes: 60 }
    expect(checkCooldown(rule, now)).toBe(true)
  })
})

// ─── matchRule (главная) ───────────────────────────────────────────────────

function baseRule(overrides = {}) {
  return {
    id: 'rule_1',
    name: 'Test',
    enabled: true,
    triggers: {
      chatIds: [], messengerIds: [], senderIds: [], keywords: [],
      keywordsMode: 'any',
      schedule: { enabled: false, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
      excludeBots: true,
      excludeChannels: true,
      excludeOutgoing: true,
    },
    action: { type: 'ai_reply', aiPromptHint: '' },
    cooldownMinutes: 60,
    matchedCount: 0,
    lastMatchedAt: null,
    ...overrides,
  }
}

function baseMessage(overrides = {}) {
  return {
    text: 'привет нужен счёт',
    chatId: 'tg_main:-100',
    messengerId: 'native_cc',
    senderId: '611696632',
    isOutgoing: false,
    chatType: 'private',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('matchRule', () => {
  const NOW = Date.now()

  it('rule.enabled=false → false', () => {
    expect(matchRule(baseRule({ enabled: false }), baseMessage(), NOW)).toBe(false)
  })

  it('минимальное rule (без фильтров) + native_cc → true', () => {
    expect(matchRule(baseRule(), baseMessage(), NOW)).toBe(true)
  })

  it('isOutgoing=true → false (excludeOutgoing default)', () => {
    expect(matchRule(baseRule(), baseMessage({ isOutgoing: true }), NOW)).toBe(false)
  })

  it('messengerId=webview_X → false (default только native_*)', () => {
    expect(matchRule(baseRule(), baseMessage({ messengerId: 'whatsapp' }), NOW)).toBe(false)
  })

  it('chatIds whitelist — match → true, miss → false', () => {
    const r = baseRule({ triggers: { ...baseRule().triggers, chatIds: ['tg_main:-100'] } })
    expect(matchRule(r, baseMessage({ chatId: 'tg_main:-100' }), NOW)).toBe(true)
    expect(matchRule(r, baseMessage({ chatId: 'tg_main:-999' }), NOW)).toBe(false)
  })

  it('senderIds whitelist', () => {
    const r = baseRule({ triggers: { ...baseRule().triggers, senderIds: ['611696632'] } })
    expect(matchRule(r, baseMessage({ senderId: '611696632' }), NOW)).toBe(true)
    expect(matchRule(r, baseMessage({ senderId: 'other' }), NOW)).toBe(false)
  })

  it('keywords any — match', () => {
    const r = baseRule({ triggers: { ...baseRule().triggers, keywords: ['счёт', 'invoice'], keywordsMode: 'any' } })
    expect(matchRule(r, baseMessage({ text: 'нужен счёт' }), NOW)).toBe(true)
    expect(matchRule(r, baseMessage({ text: 'привет как дела' }), NOW)).toBe(false)
  })

  it('keywords all', () => {
    const r = baseRule({ triggers: { ...baseRule().triggers, keywords: ['счёт', 'срочно'], keywordsMode: 'all' } })
    expect(matchRule(r, baseMessage({ text: 'счёт нужен срочно' }), NOW)).toBe(true)
    expect(matchRule(r, baseMessage({ text: 'нужен счёт' }), NOW)).toBe(false)
  })

  it('excludeBots — chatType=bot → false', () => {
    expect(matchRule(baseRule(), baseMessage({ chatType: 'bot' }), NOW)).toBe(false)
  })

  it('excludeChannels — chatType=channel → false', () => {
    expect(matchRule(baseRule(), baseMessage({ chatType: 'channel' }), NOW)).toBe(false)
  })

  it('schedule enabled + outside hours → false', () => {
    const tueAt22 = new Date(2026, 5, 9, 22, 0, 0).getTime()
    const r = baseRule({
      triggers: {
        ...baseRule().triggers,
        schedule: { enabled: true, days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
      },
    })
    expect(matchRule(r, baseMessage(), tueAt22)).toBe(false)
  })

  it('cooldown active → false', () => {
    const now = Date.now()
    const r = baseRule({ lastMatchedAt: now - 10 * 60 * 1000, cooldownMinutes: 60 })
    expect(matchRule(r, baseMessage(), now)).toBe(false)
  })

  it('cooldown прошёл → true', () => {
    const now = Date.now()
    const r = baseRule({ lastMatchedAt: now - 120 * 60 * 1000, cooldownMinutes: 60 })
    expect(matchRule(r, baseMessage(), now)).toBe(true)
  })
})

describe('findMatchingRules', () => {
  it('возвращает только matched + enabled', () => {
    const rules = [
      baseRule({ id: 'r1', triggers: { ...baseRule().triggers, keywords: ['счёт'] } }),
      baseRule({ id: 'r2', triggers: { ...baseRule().triggers, keywords: ['attack'] } }),
      baseRule({ id: 'r3', enabled: false }),
    ]
    const matched = findMatchingRules(rules, baseMessage({ text: 'нужен счёт' }), Date.now())
    expect(matched.map(r => r.id)).toEqual(['r1'])
  })

  it('пустой массив правил → []', () => {
    expect(findMatchingRules([], baseMessage(), Date.now())).toEqual([])
    expect(findMatchingRules(null, baseMessage(), Date.now())).toEqual([])
  })
})

describe('describeRuleMatch', () => {
  it('возвращает структуру для audit', () => {
    const r = baseRule({ name: 'Test rule', triggers: { ...baseRule().triggers, keywords: ['x'] } })
    const m = baseMessage()
    const d = describeRuleMatch(r, m)
    expect(d.ruleId).toBe('rule_1')
    expect(d.ruleName).toBe('Test rule')
    expect(d.chatId).toBe(m.chatId)
    expect(d.triggerSnapshot.keywords).toEqual(['x'])
    expect(d.triggerSnapshot.action).toBe('ai_reply')
  })
})
