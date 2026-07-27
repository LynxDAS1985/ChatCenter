// v1.2.130: тесты краткого времени последнего сообщения для строки списка чатов.
import { describe, it, expect } from 'vitest'
import { formatChatListTime } from '../native/utils/formatChatListTime.js'

// Фиксированное «сейчас»: среда, 2024-05-15 14:30 (локальное время машины).
const NOW = new Date(2024, 4, 15, 14, 30, 0).getTime()
const H = 60 * 60 * 1000
const DAY = 24 * H

describe('formatChatListTime', () => {
  it('нет времени (0/undefined/null/отрицательное) → пустая строка', () => {
    expect(formatChatListTime(0, NOW)).toBe('')
    expect(formatChatListTime(undefined, NOW)).toBe('')
    expect(formatChatListTime(null, NOW)).toBe('')
    expect(formatChatListTime(-5, NOW)).toBe('')
  })

  it('сегодня → HH:MM с ведущими нулями', () => {
    const today0905 = new Date(2024, 4, 15, 9, 5, 0).getTime()
    expect(formatChatListTime(today0905, NOW)).toBe('09:05')
    const today1245 = new Date(2024, 4, 15, 12, 45, 0).getTime()
    expect(formatChatListTime(today1245, NOW)).toBe('12:45')
  })

  it('вчера → «вчера»', () => {
    const yst = new Date(2024, 4, 14, 23, 59, 0).getTime()
    expect(formatChatListTime(yst, NOW)).toBe('вчера')
  })

  it('на этой неделе (2-6 дней назад) → короткий день недели', () => {
    // 3 дня назад от среды 15-го = воскресенье 12-е → «вс»
    const threeDaysAgo = new Date(2024, 4, 12, 10, 0, 0).getTime()
    expect(formatChatListTime(threeDaysAgo, NOW)).toBe('вс')
  })

  it('старше недели → DD.MM.YY', () => {
    const old = new Date(2024, 3, 1, 10, 0, 0).getTime() // 1 апреля 2024
    expect(formatChatListTime(old, NOW)).toBe('01.04.24')
  })

  it('ровно неделю назад → уже дата (граница 7 дней)', () => {
    const weekAgo = NOW - 7 * DAY
    // 7 дней назад = среда 8 мая → не попадает в «< 7 дней» → дата
    expect(formatChatListTime(weekAgo, NOW)).toBe('08.05.24')
  })
})
