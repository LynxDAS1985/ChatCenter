// v1.1.9: тесты pure helpers вынесенных из tdlibBackend.js.

import { describe, it, expect } from 'vitest'
import {
  SEARCH_FILTER_MAP,
  mapSearchFilter,
  parseChatId,
  fetchChatsRaw,
} from './tdlibBackendHelpers.js'

describe('SEARCH_FILTER_MAP', () => {
  it('содержит все ожидаемые ключи', () => {
    const keys = ['photo', 'video', 'photo-video', 'document', 'audio', 'voice',
      'video-note', 'url', 'mention', 'pinned', 'unread-mention', 'empty']
    for (const k of keys) {
      expect(SEARCH_FILTER_MAP[k]).toBeTruthy()
    }
  })

  it('все значения начинаются с searchMessagesFilter', () => {
    for (const v of Object.values(SEARCH_FILTER_MAP)) {
      expect(v.startsWith('searchMessagesFilter')).toBe(true)
    }
  })
})

describe('mapSearchFilter', () => {
  it('null/undefined/empty → searchMessagesFilterEmpty', () => {
    expect(mapSearchFilter(null)).toEqual({ '@type': 'searchMessagesFilterEmpty' })
    expect(mapSearchFilter(undefined)).toEqual({ '@type': 'searchMessagesFilterEmpty' })
    expect(mapSearchFilter('')).toEqual({ '@type': 'searchMessagesFilterEmpty' })
    expect(mapSearchFilter('empty')).toEqual({ '@type': 'searchMessagesFilterEmpty' })
  })

  it('photo → searchMessagesFilterPhoto', () => {
    expect(mapSearchFilter('photo')).toEqual({ '@type': 'searchMessagesFilterPhoto' })
  })

  it('unread-mention → searchMessagesFilterUnreadMention', () => {
    expect(mapSearchFilter('unread-mention')).toEqual({ '@type': 'searchMessagesFilterUnreadMention' })
  })

  it('unknown filter → searchMessagesFilterEmpty (fallback)', () => {
    expect(mapSearchFilter('not-a-filter')).toEqual({ '@type': 'searchMessagesFilterEmpty' })
  })
})

describe('parseChatId', () => {
  it('правильный формат accountId:rawId', () => {
    expect(parseChatId('tg_123:456')).toEqual({ accountId: 'tg_123', rawId: 456 })
  })

  it('rawId конвертируется в число', () => {
    expect(parseChatId('a:42').rawId).toBe(42)
    expect(typeof parseChatId('a:42').rawId).toBe('number')
  })

  it('отрицательный rawId (channel) поддерживается', () => {
    expect(parseChatId('tg_x:-100123').rawId).toBe(-100123)
  })

  it('без двоеточия → { accountId: null, rawId: null }', () => {
    expect(parseChatId('foo')).toEqual({ accountId: null, rawId: null })
  })

  it('null/undefined/пусто → { null, null }', () => {
    expect(parseChatId(null)).toEqual({ accountId: null, rawId: null })
    expect(parseChatId(undefined)).toEqual({ accountId: null, rawId: null })
    expect(parseChatId('')).toEqual({ accountId: null, rawId: null })
  })

  it('двоеточие в id чата (формально невозможно но безопасно)', () => {
    // Только первое двоеточие — разделитель
    expect(parseChatId('a:b:c')).toEqual({ accountId: 'a', rawId: NaN })
  })
})

describe('fetchChatsRaw', () => {
  it('дедуплицирует параллельные вызовы и не двоит запросы', async () => {
    let invokeCount = 0
    const mockManager = {
      listAccounts: () => ['tg_1'],
      getClient: () => ({
        invoke: async () => {
          invokeCount++
          return { '@type': 'ok' }
        },
      }),
      getAccountChats: () => [{ id: 'chat_1', title: 'Test' }],
    }
    const safeInvoke = async (client, req) => {
      await client.invoke(req)
      return { ok: false } // сразу 404 / end-of-list для быстрого теста
    }
    const inFlight = new Map()

    const p1 = fetchChatsRaw(mockManager, safeInvoke, 'tg_1', inFlight)
    const p2 = fetchChatsRaw(mockManager, safeInvoke, 'tg_1', inFlight)

    expect(p1).toBe(p2) // возвращает тот же самый Promise
    const [res1, res2] = await Promise.all([p1, p2])
    expect(res1.ok).toBe(true)
    expect(res2.ok).toBe(true)
    expect(invokeCount).toBe(2) // по одному вызову для main и archive, без дублирования p2
    expect(inFlight.size).toBe(0) // очищено после завершения
  })

  it('обрабатывает сбой __all__ без unhandled rejection и возвращает кэш', async () => {
    const mockManager = {
      listAccounts: () => ['tg_1'],
      getClient: () => null,
      getAccountChats: () => [{ id: 'chat_cached', title: 'Cached' }],
    }
    const inFlight = new Map()
    inFlight.set('__all__', Promise.reject(new Error('TDLib error')))

    const res = await fetchChatsRaw(mockManager, async () => ({ ok: false }), 'tg_1', inFlight)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('TDLib error')
    expect(res.chats).toHaveLength(1)
  })

  it('симметрично дедуплицирует: __all__ не перезапускает уже активный aid', async () => {
    let aidCalls = 0
    const mockManager = {
      listAccounts: () => ['tg_1', 'tg_2'],
      getClient: (aid) => ({
        invoke: async () => {
          if (aid === 'tg_1') aidCalls++
          return { '@type': 'ok' }
        },
      }),
      getAccountChats: () => [],
    }
    const safeInvoke = async (client, req) => {
      await client.invoke(req)
      return { ok: false }
    }
    const inFlight = new Map()
    // Запускаем точечный запрос для tg_1
    const p1 = fetchChatsRaw(mockManager, safeInvoke, 'tg_1', inFlight)
    // Параллельно запускаем общий __all__
    const pAll = fetchChatsRaw(mockManager, safeInvoke, undefined, inFlight)

    await Promise.all([p1, pAll])
    // tg_1 должен быть вызван только в рамках p1 (2 раза: main + archive), а не повторно в pAll
    expect(aidCalls).toBe(2)
  })

  // v1.2.513: проверка отсутствия зависания ключей в inFlightMap при синхронном завершении
  it('v1.2.513: очищает inFlightMap при синхронном выходе (пустой список аккаунтов)', async () => {
    const mockManager = {
      listAccounts: () => [],
      getClient: () => null,
      getAccountChats: () => [],
    }
    const inFlight = new Map()
    const res = await fetchChatsRaw(mockManager, async () => ({ ok: false }), undefined, inFlight)
    expect(res.ok).toBe(true)
    expect(res.chats).toEqual([])
    expect(inFlight.size).toBe(0)
    expect(inFlight.has('__all__')).toBe(false)
  })

  // v1.2.513: проверка отсутствия зависания ключа аккаунта, вызванного во время __all__
  it('v1.2.513: очищает inFlightMap для aid при параллельном запуске с __all__', async () => {
    const mockManager = {
      listAccounts: () => ['tg_1'],
      getClient: () => ({ invoke: async () => ({ '@type': 'ok' }) }),
      getAccountChats: () => [{ id: 'c1' }],
    }
    const safeInvoke = async () => {
      await new Promise((r) => setTimeout(r, 20))
      return { ok: false }
    }
    const inFlight = new Map()
    const pAll = fetchChatsRaw(mockManager, safeInvoke, undefined, inFlight)
    const pAcc = fetchChatsRaw(mockManager, safeInvoke, 'tg_1', inFlight)
    await Promise.all([pAll, pAcc])

    expect(inFlight.size).toBe(0)
    expect(inFlight.has('tg_1')).toBe(false)
    expect(inFlight.has('__all__')).toBe(false)
  })
})
