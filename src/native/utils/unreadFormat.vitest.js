import { describe, it, expect } from 'vitest'
import { formatUnreadCount } from './unreadFormat.js'

describe('formatUnreadCount', () => {
  it('keeps small counters exact', () => {
    expect(formatUnreadCount(9)).toBe('9')
    expect(formatUnreadCount(999)).toBe('999')
  })

  it('formats chat-list counters like Telegram compact K', () => {
    expect(formatUnreadCount(1000)).toBe('1K')
    expect(formatUnreadCount(2150)).toBe('2.1K')
    expect(formatUnreadCount(9999)).toBe('9.9K')
    expect(formatUnreadCount(12000)).toBe('12K')
  })

  it('can keep scroll-button counters exact longer', () => {
    expect(formatUnreadCount(2150, { exactUntil: 9999 })).toBe('2150')
    expect(formatUnreadCount(12000, { exactUntil: 9999 })).toBe('12K')
  })
})
