// v0.95.21: тесты getDisplayUnreadCount.
//
// Главные контракты (регрессионная защита):
// 1. Обычный чат (не форум) → chat.unreadCount как есть
// 2. Форум-чат, темы загружены → число тем с unread > 0 (Telegram Desktop поведение)
// 3. Форум-чат, темы НЕ загружены → 0 (не используем TDLib aggregate)
// 4. Edge cases: null/undefined / пустой массив тем / NaN unreadCount

import { describe, it, expect } from 'vitest'
import { getDisplayUnreadCount } from './displayUnread.js'

describe('getDisplayUnreadCount — бейдж в списке чатов (v0.95.21)', () => {
  it('обычный чат → возвращает chat.unreadCount', () => {
    const chat = { id: 'c1', isForum: false, unreadCount: 35 }
    expect(getDisplayUnreadCount(chat, {})).toBe(35)
  })

  it('обычный чат + unreadCount=0 → 0', () => {
    const chat = { id: 'c1', isForum: false, unreadCount: 0 }
    expect(getDisplayUnreadCount(chat, {})).toBe(0)
  })

  it('обычный чат → forumTopics игнорируются', () => {
    const chat = { id: 'c1', isForum: false, unreadCount: 7 }
    const forumTopics = { c1: [{ unreadCount: 3 }, { unreadCount: 5 }] }
    expect(getDisplayUnreadCount(chat, forumTopics)).toBe(7)
  })

  it('форум-чат, темы загружены, 2 темы с unread → 2', () => {
    const chat = { id: 'c1', isForum: true, unreadCount: 6200 }  // TDLib aggregate
    const forumTopics = {
      c1: [
        { id: 't1', unreadCount: 3 },     // count
        { id: 't2', unreadCount: 0 },
        { id: 't3', unreadCount: 7 },     // count
        { id: 't4', unreadCount: 0 },
      ],
    }
    expect(getDisplayUnreadCount(chat, forumTopics)).toBe(2)
  })

  it('форум-чат, все темы пустые → 0 (даже если TDLib aggregate=6200)', () => {
    const chat = { id: 'c1', isForum: true, unreadCount: 6200 }
    const forumTopics = {
      c1: [
        { unreadCount: 0 },
        { unreadCount: 0 },
      ],
    }
    expect(getDisplayUnreadCount(chat, forumTopics)).toBe(0)
  })

  it('форум-чат, темы НЕ загружены → 0 (не используем TDLib aggregate)', () => {
    const chat = { id: 'c1', isForum: true, unreadCount: 6200 }
    expect(getDisplayUnreadCount(chat, {})).toBe(0)
    expect(getDisplayUnreadCount(chat, undefined)).toBe(0)
    expect(getDisplayUnreadCount(chat, null)).toBe(0)
  })

  it('форум-чат, темы=пустой массив → 0', () => {
    const chat = { id: 'c1', isForum: true, unreadCount: 6200 }
    expect(getDisplayUnreadCount(chat, { c1: [] })).toBe(0)
  })

  it('форум-чат, тема без unreadCount поля → не считается', () => {
    const chat = { id: 'c1', isForum: true, unreadCount: 6200 }
    const forumTopics = {
      c1: [
        { id: 't1' },                     // нет поля
        { id: 't2', unreadCount: null },  // null
        { id: 't3', unreadCount: NaN },   // NaN
        { id: 't4', unreadCount: 5 },     // count
      ],
    }
    expect(getDisplayUnreadCount(chat, forumTopics)).toBe(1)
  })

  it('chat=null → 0 (защита)', () => {
    expect(getDisplayUnreadCount(null, {})).toBe(0)
    expect(getDisplayUnreadCount(undefined, {})).toBe(0)
  })

  it('форум-чат, все темы с unread=1 (10 тем) → 10', () => {
    const chat = { id: 'c1', isForum: true, unreadCount: 6200 }
    const forumTopics = {
      c1: Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, unreadCount: 1 })),
    }
    expect(getDisplayUnreadCount(chat, forumTopics)).toBe(10)
  })

  it('реальный сценарий юзера: чат «Un1c4d3 Support», Q/D=3 + General=7, остальные 0 → 2', () => {
    const chat = { id: 'tg:1234', isForum: true, unreadCount: 6200 }
    const forumTopics = {
      'tg:1234': [
        { id: 'qd', title: 'Questions/Discussions', unreadCount: 3 },
        { id: 'news', title: 'News', unreadCount: 0 },
        { id: 'general', title: 'General', unreadCount: 7 },
        { id: 'instr', title: 'Instructions', unreadCount: 0 },
        { id: 'links', title: 'Important Links', unreadCount: 0 },
        { id: 'support', title: 'Support', unreadCount: 0 },
      ],
    }
    expect(getDisplayUnreadCount(chat, forumTopics)).toBe(2)
  })

  it('форум-чат, unreadCount как строка "5" → корректно (приведение)', () => {
    const chat = { id: 'c1', isForum: true, unreadCount: 0 }
    const forumTopics = {
      c1: [
        { unreadCount: '5' },   // строка → Number('5')=5 → count
        { unreadCount: '0' },   // строка → 0 → не count
      ],
    }
    expect(getDisplayUnreadCount(chat, forumTopics)).toBe(1)
  })
})
