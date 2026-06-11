// v1.1.9: тесты localStorage cache для последних сообщений.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveChatCache, loadChatCache } from './nativeStoreCache.js'

beforeEach(() => {
  // jsdom localStorage сбрасываем перед каждым тестом
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('saveChatCache', () => {
  it('сохраняет до 50 последних сообщений', () => {
    const msgs = Array.from({ length: 100 }, (_, i) => ({ id: i }))
    saveChatCache('chat1', msgs)
    const r = loadChatCache('chat1')
    expect(r).toHaveLength(50)
    expect(r[0].id).toBe(50) // последние 50
    expect(r[49].id).toBe(99)
  })

  it('сохраняет меньше 50 как есть', () => {
    saveChatCache('chat1', [{ id: 1 }, { id: 2 }])
    expect(loadChatCache('chat1')).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('пустой массив → пустой массив', () => {
    saveChatCache('chat1', [])
    expect(loadChatCache('chat1')).toEqual([])
  })

  it('null chatId / не массив → no-op (без throw)', () => {
    expect(() => saveChatCache(null, [])).not.toThrow()
    expect(() => saveChatCache('chat1', null)).not.toThrow()
    expect(() => saveChatCache('chat1', 'not array')).not.toThrow()
    expect(loadChatCache('chat1')).toBeNull()
  })

  it('localStorage недоступен → no-op (silent)', () => {
    const original = global.localStorage
    Object.defineProperty(global, 'localStorage', {
      value: { setItem: () => { throw new Error('quota') } },
      configurable: true,
    })
    expect(() => saveChatCache('chat1', [{ id: 1 }])).not.toThrow()
    Object.defineProperty(global, 'localStorage', { value: original, configurable: true })
  })
})

describe('loadChatCache', () => {
  it('нет записи → null', () => {
    expect(loadChatCache('nonexistent')).toBeNull()
  })

  it('битый JSON → null', () => {
    localStorage.setItem('chat-messages:chat1', '{not valid json')
    expect(loadChatCache('chat1')).toBeNull()
  })

  it('не массив в JSON → null', () => {
    localStorage.setItem('chat-messages:chat1', '{"foo": "bar"}')
    expect(loadChatCache('chat1')).toBeNull()
  })

  it('правильный массив → возвращает', () => {
    localStorage.setItem('chat-messages:chat1', JSON.stringify([{ id: 1 }]))
    expect(loadChatCache('chat1')).toEqual([{ id: 1 }])
  })
})

describe('round-trip', () => {
  it('save → load возвращает то же что и записали', () => {
    const data = [{ id: 1, text: 'привет' }, { id: 2, text: 'мир' }]
    saveChatCache('mychat', data)
    expect(loadChatCache('mychat')).toEqual(data)
  })

  it('два чата изолированы', () => {
    saveChatCache('a', [{ id: 1 }])
    saveChatCache('b', [{ id: 2 }])
    expect(loadChatCache('a')).toEqual([{ id: 1 }])
    expect(loadChatCache('b')).toEqual([{ id: 2 }])
  })
})
