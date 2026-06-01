// v0.95.29: тесты formatChatStatus — Telegram-style header subtitle.

import { describe, it, expect } from 'vitest'
import { formatChatStatus } from './formatChatStatus.js'

const NOW = new Date('2026-06-01T17:30:00').getTime()

describe('formatChatStatus — Telegram-style header subtitle (v0.95.29)', () => {
  it('user онлайн → "в сети"', () => {
    expect(formatChatStatus({ type: 'user', isOnline: true }, { nowMs: NOW })).toBe('в сети')
  })

  it('user печатает (приоритет) → "печатает..."', () => {
    expect(formatChatStatus(
      { type: 'user', isOnline: true },
      { isTyping: true, nowMs: NOW }
    )).toBe('печатает...')
  })

  it('user offline только что (30 сек назад) → "был(а) только что"', () => {
    const lastSeen = NOW - 30_000
    expect(formatChatStatus(
      { type: 'user', isOnline: false, lastSeenAt: lastSeen, userStatusType: 'userStatusOffline' },
      { nowMs: NOW }
    )).toBe('был(а) только что')
  })

  it('user offline 15 минут назад → "был(а) 15 мин назад"', () => {
    const lastSeen = NOW - 15 * 60_000
    expect(formatChatStatus(
      { type: 'user', lastSeenAt: lastSeen, userStatusType: 'userStatusOffline' },
      { nowMs: NOW }
    )).toBe('был(а) 15 мин назад')
  })

  it('user offline сегодня в 14:25 → "был(а) в 14:25"', () => {
    const lastSeen = new Date('2026-06-01T14:25:00').getTime()
    expect(formatChatStatus(
      { type: 'user', lastSeenAt: lastSeen, userStatusType: 'userStatusOffline' },
      { nowMs: NOW }
    )).toBe('был(а) в 14:25')
  })

  it('user offline вчера → "был(а) вчера в HH:MM"', () => {
    const lastSeen = new Date('2026-05-31T20:00:00').getTime()
    const result = formatChatStatus(
      { type: 'user', lastSeenAt: lastSeen, userStatusType: 'userStatusOffline' },
      { nowMs: NOW }
    )
    expect(result).toMatch(/^был\(а\) вчера в \d{2}:\d{2}$/)
  })

  it('userStatusRecently → "был(а) недавно"', () => {
    expect(formatChatStatus(
      { type: 'user', userStatusType: 'userStatusRecently' },
      { nowMs: NOW }
    )).toBe('был(а) недавно')
  })

  it('userStatusLastWeek → "был(а) на этой неделе"', () => {
    expect(formatChatStatus(
      { type: 'user', userStatusType: 'userStatusLastWeek' },
      { nowMs: NOW }
    )).toBe('был(а) на этой неделе')
  })

  it('group с 1 участником → "1 участник"', () => {
    expect(formatChatStatus({ type: 'group', memberCount: 1 }, { nowMs: NOW })).toBe('1 участник')
  })

  it('group с 2 участниками → "2 участника"', () => {
    expect(formatChatStatus({ type: 'group', memberCount: 2 }, { nowMs: NOW })).toBe('2 участника')
  })

  it('group с 5 участниками → "5 участников"', () => {
    expect(formatChatStatus({ type: 'group', memberCount: 5 }, { nowMs: NOW })).toBe('5 участников')
  })

  it('group с 21 участниками → "21 участник" (правило склонения)', () => {
    expect(formatChatStatus({ type: 'group', memberCount: 21 }, { nowMs: NOW })).toBe('21 участник')
  })

  it('group с 1000 участников → "1 000 участников" (форматирование числа)', () => {
    const result = formatChatStatus({ type: 'group', memberCount: 1000 }, { nowMs: NOW })
    // 1 000 (с разделителем) или 1000 — зависит от locale формат, оба валидны
    expect(result).toMatch(/^1\s?000 участников$/)
  })

  it('group без memberCount → "группа"', () => {
    expect(formatChatStatus({ type: 'group', memberCount: 0 }, { nowMs: NOW })).toBe('группа')
  })

  it('channel с 1234 подписчиками → "1 234 подписчика"', () => {
    const result = formatChatStatus({ type: 'channel', memberCount: 1234 }, { nowMs: NOW })
    expect(result).toMatch(/^1\s?234 подписчика$/)
  })

  it('channel без memberCount → "канал"', () => {
    expect(formatChatStatus({ type: 'channel', memberCount: null }, { nowMs: NOW })).toBe('канал')
  })

  it('chat=null → пустая строка', () => {
    expect(formatChatStatus(null)).toBe('')
    expect(formatChatStatus(undefined)).toBe('')
  })

  it('user без status → "был(а) недавно" (fallback)', () => {
    expect(formatChatStatus({ type: 'user' }, { nowMs: NOW })).toBe('был(а) недавно')
  })

  it('реальный сценарий: страховая компания была вчера → "был(а) вчера в HH:MM"', () => {
    const lastSeen = new Date('2026-05-31T17:15:00').getTime()
    const result = formatChatStatus(
      { type: 'user', lastSeenAt: lastSeen, userStatusType: 'userStatusOffline', title: 'Страховая Компания' },
      { nowMs: NOW }
    )
    expect(result).toMatch(/^был\(а\) вчера в 17:15$/)
  })
})
