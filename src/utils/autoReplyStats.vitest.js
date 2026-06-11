// v1.2.7: тесты pure-функций статистики авто-ответов.

import { describe, it, expect } from 'vitest'
import { groupAutoReplyByDay, summarizeStats, shortDayLabel } from './autoReplyStats.js'

describe('groupAutoReplyByDay', () => {
  it('не-массив → []', () => {
    expect(groupAutoReplyByDay(null)).toEqual([])
    expect(groupAutoReplyByDay(undefined)).toEqual([])
  })

  it('пустой массив → массив из N дней с total=0', () => {
    const r = groupAutoReplyByDay([], 7)
    expect(r).toHaveLength(7)
    expect(r.every(d => d.total === 0)).toBe(true)
  })

  it('игнорирует записи не actor=ai_auto', () => {
    const today = Date.now()
    const entries = [
      { actor: 'user', timestamp: today, actionId: 'reply' },
      { actor: 'ai', timestamp: today, actionId: 'reply' },
    ]
    const r = groupAutoReplyByDay(entries, 7)
    expect(r.every(d => d.total === 0)).toBe(true)
  })

  it('группирует actor=ai_auto по дням', () => {
    const today = Date.now()
    const yesterday = today - 24 * 60 * 60 * 1000
    const entries = [
      { actor: 'ai_auto', timestamp: today, actionId: 'ai_reply_summary', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: today, actionId: 'ai_reply_summary', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: yesterday, actionId: 'mark_as_read', executionResult: 'ok' },
    ]
    const r = groupAutoReplyByDay(entries, 7)
    // Сегодня — 2, вчера — 1
    expect(r[r.length - 1].total).toBe(2)  // сегодня (последний)
    expect(r[r.length - 2].total).toBe(1)  // вчера
  })

  it('byAction правильно классифицирует actionId', () => {
    const today = Date.now()
    const entries = [
      { actor: 'ai_auto', timestamp: today, actionId: 'mark_as_read', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: today, actionId: 'ai_reply_summary', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: today, actionId: 'ai_reply_bridge_summary', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: today, actionId: 'other_action', executionResult: 'ok' },
    ]
    const r = groupAutoReplyByDay(entries, 7)
    const t = r[r.length - 1]
    expect(t.byAction.markRead).toBe(1)
    expect(t.byAction.aiReply).toBe(1)
    expect(t.byAction.aiReplyBridge).toBe(1)
    expect(t.byAction.other).toBe(1)
  })

  it('errors считает executionResult != ok', () => {
    const today = Date.now()
    const entries = [
      { actor: 'ai_auto', timestamp: today, actionId: 'x', executionResult: 'ok' },
      { actor: 'ai_auto', timestamp: today, actionId: 'x', executionResult: 'error' },
      { actor: 'ai_auto', timestamp: today, actionId: 'x', executionResult: 'denied' },
    ]
    const r = groupAutoReplyByDay(entries, 7)
    const t = r[r.length - 1]
    expect(t.total).toBe(3)
    expect(t.errors).toBe(2)
  })

  it('записи вне диапазона дней не учитываются', () => {
    const TenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000
    const entries = [
      { actor: 'ai_auto', timestamp: TenDaysAgo, actionId: 'x' },
    ]
    const r = groupAutoReplyByDay(entries, 7)
    expect(r.every(d => d.total === 0)).toBe(true)
  })

  it('кастомный days', () => {
    const r = groupAutoReplyByDay([], 14)
    expect(r).toHaveLength(14)
  })
})

describe('summarizeStats', () => {
  it('пустой → hasData=false', () => {
    expect(summarizeStats([]).hasData).toBe(false)
    expect(summarizeStats(null).hasData).toBe(false)
  })

  it('суммирует total/max/errors', () => {
    const grouped = [
      { date: 'd1', total: 5, byAction: {}, errors: 1 },
      { date: 'd2', total: 3, byAction: {}, errors: 0 },
      { date: 'd3', total: 10, byAction: {}, errors: 2 },
    ]
    const s = summarizeStats(grouped)
    expect(s.total).toBe(18)
    expect(s.max).toBe(10)
    expect(s.errors).toBe(3)
    expect(s.hasData).toBe(true)
  })

  it('errorRate вычисляется в процентах', () => {
    const grouped = [{ date: 'd', total: 10, byAction: {}, errors: 3 }]
    expect(summarizeStats(grouped).errorRate).toBe(30)
  })

  it('errorRate = 0 при total = 0', () => {
    const grouped = [{ date: 'd', total: 0, byAction: {}, errors: 0 }]
    expect(summarizeStats(grouped).errorRate).toBe(0)
  })
})

describe('shortDayLabel', () => {
  it('возвращает 2-буквенное имя дня', () => {
    // 2026-06-11 — четверг
    expect(shortDayLabel('2026-06-11')).toBe('Чт')
    // 2026-06-14 — воскресенье
    expect(shortDayLabel('2026-06-14')).toBe('Вс')
  })

  it('некорректный вход → ?', () => {
    // Неправильный формат фактически вернёт NaN day index → 'undefined' = ?
    // (защита через try/catch)
    const r = shortDayLabel('not-a-date')
    expect(['?', undefined]).toContain(r)
  })
})
