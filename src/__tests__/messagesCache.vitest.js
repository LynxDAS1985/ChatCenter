// v0.89.40: messagesCache.js — общий IndexedDB кэш сообщений (топики + чаты).
//
// Тестируем без реального IndexedDB — мокаем globalThis.indexedDB.
// Сценарии:
//   - graceful degradation: если indexedDB undefined → save/load → null/false
//   - makeKey: chatId без topicId → ':_main' (обычный чат)
//   - makeKey: chatId с topicId → ':<id>' (топик)
//   - cleanupExpired API доступен
//   - backwards-compat alias saveTopicMessages работает

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  saveMessages, loadMessages, cleanupExpired, clearAllMessages,
  saveTopicMessages, loadTopicMessages, _internal,
} from '../native/utils/messagesCache.js'

describe('messagesCache v0.89.40', () => {
  let origIDB
  beforeEach(() => { origIDB = globalThis.indexedDB })
  afterEach(() => { globalThis.indexedDB = origIDB })

  it('makeKey: обычный чат (topicId null) → chatId:_main', () => {
    expect(_internal.makeKey('chat1', null)).toBe('chat1:_main')
    expect(_internal.makeKey('chat1', undefined)).toBe('chat1:_main')
    expect(_internal.makeKey('chat1', '')).toBe('chat1:_main')
  })

  it('makeKey: топик (topicId задан) → chatId:topicId', () => {
    expect(_internal.makeKey('chat1', 'topic42')).toBe('chat1:topic42')
    expect(_internal.makeKey('chat1', 42)).toBe('chat1:42')
  })

  it('MAIN_TOPIC_ID = "_main"', () => {
    expect(_internal.MAIN_TOPIC_ID).toBe('_main')
  })

  it('DB_NAME изменилось на cc-messages-cache (общая)', () => {
    expect(_internal.DB_NAME).toBe('cc-messages-cache')
  })

  it('CACHE_TTL_MS = 7 дней', () => {
    expect(_internal.CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('MAX_MESSAGES_PER_KEY = 50', () => {
    expect(_internal.MAX_MESSAGES_PER_KEY).toBe(50)
  })

  it('graceful: без indexedDB save/load возвращают false/null', async () => {
    globalThis.indexedDB = undefined
    expect(await saveMessages('chat1', null, [{ id: '1' }])).toBe(false)
    expect(await loadMessages('chat1', null)).toBeNull()
    expect(await cleanupExpired()).toBe(0)
    expect(await clearAllMessages()).toBe(false)
  })

  it('saveMessages валидация: пустой chatId → false', async () => {
    expect(await saveMessages(null, null, [])).toBe(false)
    expect(await saveMessages('', null, [])).toBe(false)
  })

  it('saveMessages валидация: messages не массив → false', async () => {
    expect(await saveMessages('chat1', null, 'not-array')).toBe(false)
    expect(await saveMessages('chat1', null, null)).toBe(false)
  })

  it('loadMessages валидация: пустой chatId → null', async () => {
    expect(await loadMessages(null, null)).toBeNull()
    expect(await loadMessages('', null)).toBeNull()
  })

  it('backwards-compat: saveTopicMessages обёртка работает', async () => {
    globalThis.indexedDB = undefined
    // Должен использовать тот же путь что saveMessages — graceful degradation.
    expect(await saveTopicMessages('chat1', 'topic1', [{ id: '1' }])).toBe(false)
  })

  it('backwards-compat: loadTopicMessages обёртка работает', async () => {
    globalThis.indexedDB = undefined
    expect(await loadTopicMessages('chat1', 'topic1')).toBeNull()
  })

  it('cleanupExpired экспортирован как функция', () => {
    expect(typeof cleanupExpired).toBe('function')
  })

  it('clearAllMessages экспортирован как функция', () => {
    expect(typeof clearAllMessages).toBe('function')
  })
})
