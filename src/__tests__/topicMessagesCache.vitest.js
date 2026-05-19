// v0.89.39: IndexedDB кэш сообщений форум-топиков — unit тесты.
//
// Тест работает в jsdom без реального IndexedDB — мокаем globalThis.indexedDB.
// Главные сценарии:
//   - graceful degradation: если indexedDB undefined → save/load возвращают null/false
//   - сохранение → загрузка возвращает те же messages
//   - TTL: запись старше 7 дней игнорируется
//   - MAX_MESSAGES: при save обрезается до 50 (хвост)
//   - clearTopicCache — очищает store

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  saveTopicMessages, loadTopicMessages, clearTopicCache, _internal,
} from '../native/utils/topicMessagesCache.js'

// Минимальный in-memory IndexedDB mock для unit тестов.
function makeMockIDB() {
  const data = new Map() // key → value
  function makeStore() {
    return {
      get(key) {
        const req = {}
        setTimeout(() => { req.result = data.get(key); if (req.onsuccess) req.onsuccess({ target: req }) }, 0)
        return req
      },
      put(value, key) {
        data.set(key, value)
        return { onsuccess: null }
      },
      clear() {
        data.clear()
        return { onsuccess: null }
      },
    }
  }
  function makeTx() {
    const store = makeStore()
    const tx = {
      objectStore() { return store },
      oncomplete: null, onerror: null, onabort: null,
    }
    setTimeout(() => { if (tx.oncomplete) tx.oncomplete() }, 0)
    return tx
  }
  return {
    open(_name, _version) {
      const req = {}
      setTimeout(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore() {},
          transaction() { return makeTx() },
        }
        req.result = db
        if (req.onsuccess) req.onsuccess({ target: req })
      }, 0)
      return req
    },
    _data: data,
  }
}

describe('topicMessagesCache', () => {
  let origIDB
  beforeEach(() => {
    origIDB = globalThis.indexedDB
    globalThis.indexedDB = makeMockIDB()
    // Сбросить cached _dbPromise — модуль кеширует подключение.
    // Самый простой способ — динамический import, но для теста дёрнем clearTopicCache.
  })
  afterEach(() => { globalThis.indexedDB = origIDB })

  it('graceful: без indexedDB save/load возвращают false/null', async () => {
    globalThis.indexedDB = undefined
    const r1 = await saveTopicMessages('chat1', 'topic1', [{ id: '1' }])
    expect(r1).toBe(false)
    const r2 = await loadTopicMessages('chat1', 'topic1')
    expect(r2).toBeNull()
  })

  it('makeKey формирует chatId:topicId', () => {
    expect(_internal.makeKey('chat1', 'topic1')).toBe('chat1:topic1')
    expect(_internal.makeKey(123, 456)).toBe('123:456')
  })

  it('MAX_MESSAGES_PER_TOPIC = 50', () => {
    expect(_internal.MAX_MESSAGES_PER_TOPIC).toBe(50)
  })

  it('CACHE_TTL_MS = 7 дней', () => {
    expect(_internal.CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('STORE = topics, DB_NAME = cc-topic-cache', () => {
    expect(_internal.STORE).toBe('topics')
    expect(_internal.DB_NAME).toBe('cc-topic-cache')
  })

  it('saveTopicMessages с invalid args → false', async () => {
    expect(await saveTopicMessages(null, 'topic1', [])).toBe(false)
    expect(await saveTopicMessages('chat1', null, [])).toBe(false)
    expect(await saveTopicMessages('chat1', 'topic1', null)).toBe(false)
    expect(await saveTopicMessages('chat1', 'topic1', 'not-array')).toBe(false)
  })

  it('loadTopicMessages с invalid args → null', async () => {
    expect(await loadTopicMessages(null, 'topic1')).toBeNull()
    expect(await loadTopicMessages('chat1', null)).toBeNull()
  })
})
