// v1.1.9: тесты pure helpers вынесенных из nativeStore.js.

import { describe, it, expect } from 'vitest'
import {
  NATIVE_SLOW_MS,
  TOPIC_READ_REFRESH_DELAYS_MS,
  UNREAD_WINDOW_MAX_MESSAGES,
  UNREAD_WINDOW_EXTRA_MESSAGES,
  NEWER_PAGE_SIZE,
  NEWER_PAGE_MIN_INTERVAL_MS,
  DEFAULT_STATE,
  topicMessageKey,
  topicIdentity,
  countIncoming,
  buildUnreadWindowMeta,
  unreadWindowRequestParams,
  nativeAccountLabel,
  nativeAccountDetails,
  updateNativeHealthForAccounts,
  accountIdsForRequest,
  healthErrorText,
  accountStatById,
  pickNotifTitle,
} from './nativeStoreHelpers.js'

describe('константы', () => {
  it('NATIVE_SLOW_MS = 10 сек', () => {
    expect(NATIVE_SLOW_MS).toBe(10000)
  })

  it('TOPIC_READ_REFRESH_DELAYS_MS — массив из 4 задержек', () => {
    expect(Array.isArray(TOPIC_READ_REFRESH_DELAYS_MS)).toBe(true)
    expect(TOPIC_READ_REFRESH_DELAYS_MS).toHaveLength(4)
    expect(TOPIC_READ_REFRESH_DELAYS_MS[0]).toBe(0)
  })

  it('UNREAD_WINDOW_MAX_MESSAGES = 100 (Telegram MTProto лимит)', () => {
    expect(UNREAD_WINDOW_MAX_MESSAGES).toBe(100)
  })

  it('UNREAD_WINDOW_EXTRA_MESSAGES = 30', () => {
    expect(UNREAD_WINDOW_EXTRA_MESSAGES).toBe(30)
  })

  it('NEWER_PAGE_SIZE = 100', () => {
    expect(NEWER_PAGE_SIZE).toBe(100)
  })

  it('NEWER_PAGE_MIN_INTERVAL_MS = 300 (защита от FLOOD_WAIT)', () => {
    expect(NEWER_PAGE_MIN_INTERVAL_MS).toBe(300)
  })
})

describe('DEFAULT_STATE', () => {
  it('минимальные обязательные поля', () => {
    expect(DEFAULT_STATE.mode).toBe('inbox')
    expect(DEFAULT_STATE.chatFilter).toBe('all')
    expect(Array.isArray(DEFAULT_STATE.accounts)).toBe(true)
    expect(Array.isArray(DEFAULT_STATE.chats)).toBe(true)
    expect(DEFAULT_STATE.messages).toEqual({})
    expect(DEFAULT_STATE.forumTopics).toEqual({})
    expect(DEFAULT_STATE.nativeConnectionHealth).toEqual({})
  })
})

describe('topicMessageKey', () => {
  it('без topic → возвращает chatId', () => {
    expect(topicMessageKey('chat1', null)).toBe('chat1')
    expect(topicMessageKey('chat1', undefined)).toBe('chat1')
    expect(topicMessageKey('chat1', {})).toBe('chat1')
  })

  it('topicId из topic.topicId', () => {
    expect(topicMessageKey('chat1', { topicId: 42 })).toBe('chat1:topic:42')
  })

  it('topicId из topic.id если нет topicId', () => {
    expect(topicMessageKey('chat1', { id: 7 })).toBe('chat1:topic:7')
  })

  it('topicId из topic.topMessageId если ничего другого', () => {
    expect(topicMessageKey('chat1', { topMessageId: 12 })).toBe('chat1:topic:12')
  })
})

describe('topicIdentity', () => {
  it('null/undefined → пустая строка', () => {
    expect(topicIdentity(null)).toBe('')
    expect(topicIdentity(undefined)).toBe('')
    expect(topicIdentity({})).toBe('')
  })

  it('конвертация в строку', () => {
    expect(topicIdentity({ topicId: 42 })).toBe('42')
    expect(topicIdentity({ id: 'general' })).toBe('general')
  })
})

describe('countIncoming', () => {
  it('пустой / не-массив → 0', () => {
    expect(countIncoming(null)).toBe(0)
    expect(countIncoming(undefined)).toBe(0)
    expect(countIncoming([])).toBe(0)
    expect(countIncoming('not array')).toBe(0)
  })

  it('считает только isOutgoing=false', () => {
    const msgs = [
      { isOutgoing: true },
      { isOutgoing: false },
      { isOutgoing: false },
      {},  // считается incoming (isOutgoing != true)
    ]
    expect(countIncoming(msgs)).toBe(3)
  })
})

describe('buildUnreadWindowMeta', () => {
  it('пустые messages + unread=0 → complete', () => {
    const r = buildUnreadWindowMeta({ messages: [], unreadCount: 0, requested: false })
    expect(r.unreadWindowComplete).toBe(true)
    expect(r.loadedIncoming).toBe(0)
    expect(r.unreadCount).toBe(0)
  })

  it('loadedIncoming >= unread → complete', () => {
    const r = buildUnreadWindowMeta({
      messages: [{ isOutgoing: false }, { isOutgoing: false }, { isOutgoing: false }],
      unreadCount: 2,
      readInboxMaxId: 100,
      requested: true,
      aroundId: 100,
    })
    expect(r.unreadWindowComplete).toBe(true)
    expect(r.loadedIncoming).toBe(3)
  })

  it('loadedIncoming < unread + requested → НЕ complete', () => {
    const r = buildUnreadWindowMeta({
      messages: [{ isOutgoing: false }],
      unreadCount: 5,
      requested: true,
    })
    expect(r.unreadWindowComplete).toBe(false)
    expect(r.unreadWindowRequested).toBe(true)
  })

  it('updatedAt всегда выставляется', () => {
    const r = buildUnreadWindowMeta({ messages: [], unreadCount: 0 })
    expect(typeof r.updatedAt).toBe('number')
    expect(r.updatedAt).toBeGreaterThan(0)
  })
})

describe('unreadWindowRequestParams', () => {
  it('нет непрочитанных → latest window + requested=false', () => {
    const r = unreadWindowRequestParams(0, 100, 50)
    expect(r.requested).toBe(false)
    expect(r.aroundId).toBe(0)
  })

  it('нет cursor (readInboxMaxId=0) → НЕ запрашиваем', () => {
    const r = unreadWindowRequestParams(10, 0)
    expect(r.requested).toBe(false)
  })

  it('много непрочитанных (>30) → большой addOffset (~90%)', () => {
    const r = unreadWindowRequestParams(50, 1000, 50)
    expect(r.requested).toBe(true)
    expect(r.limit).toBeLessThanOrEqual(UNREAD_WINDOW_MAX_MESSAGES)
    expect(r.addOffset).toBeLessThan(-r.limit * 0.7)
  })

  it('мало непрочитанных (<30) → маленький addOffset (~25%)', () => {
    const r = unreadWindowRequestParams(5, 1000, 50)
    expect(r.requested).toBe(true)
    expect(r.addOffset).toBeGreaterThan(-r.limit * 0.5)
  })

  it('limit не превышает UNREAD_WINDOW_MAX_MESSAGES', () => {
    const r = unreadWindowRequestParams(500, 1000, 50)
    expect(r.limit).toBeLessThanOrEqual(UNREAD_WINDOW_MAX_MESSAGES)
  })
})

describe('nativeAccountLabel', () => {
  it('обычный аккаунт', () => {
    expect(nativeAccountLabel({ messenger: 'telegram', name: 'Иван' }))
      .toBe('telegram · Иван')
  })

  it('fallback на id если имени нет', () => {
    expect(nativeAccountLabel({ messenger: 'whatsapp', id: 'wa_+79' }))
      .toBe('whatsapp · wa_+79')
  })

  it('fallback на telegram + аккаунт', () => {
    expect(nativeAccountLabel({})).toBe('telegram · аккаунт')
    expect(nativeAccountLabel(null)).toBe('telegram · аккаунт')
  })
})

describe('nativeAccountDetails', () => {
  it('считает чаты и непрочитанные', () => {
    const account = { id: 'tg_1' }
    const chats = [
      { accountId: 'tg_1', unreadCount: 5 },
      { accountId: 'tg_1', unreadCount: 3 },
      { accountId: 'tg_2', unreadCount: 100 },  // другой аккаунт
    ]
    expect(nativeAccountDetails(account, chats, 'тест'))
      .toBe('тест; чаты: 2; непрочитано: 8')
  })

  it('нет чатов → 0/0', () => {
    expect(nativeAccountDetails({ id: 'tg_x' }, [], 'pref'))
      .toBe('pref; чаты: 0; непрочитано: 0')
  })
})

describe('updateNativeHealthForAccounts', () => {
  it('пустой список accountIds → возвращает state без изменений', () => {
    const state = { accounts: [{ id: 'a' }], nativeConnectionHealth: { a: { ok: true } } }
    const r = updateNativeHealthForAccounts(state, [], () => ({ ok: false }))
    expect(r).toBe(state)
  })

  it('обновляет только указанные accountId', () => {
    const state = {
      accounts: [{ id: 'a' }, { id: 'b' }],
      nativeConnectionHealth: { a: { ok: true }, b: { ok: true } },
    }
    const r = updateNativeHealthForAccounts(state, ['a'], (acc) => ({ ok: false, id: acc.id }))
    expect(r.nativeConnectionHealth.a).toEqual({ ok: false, id: 'a' })
    expect(r.nativeConnectionHealth.b).toEqual({ ok: true })
  })

  it('возвращает новый объект (immutable)', () => {
    const state = { accounts: [{ id: 'a' }], nativeConnectionHealth: { a: {} } }
    const r = updateNativeHealthForAccounts(state, ['a'], () => ({}))
    expect(r).not.toBe(state)
    expect(r.nativeConnectionHealth).not.toBe(state.nativeConnectionHealth)
  })
})

describe('accountIdsForRequest', () => {
  it('передан accountId → массив из одного', () => {
    const state = { accounts: [{ id: 'a' }, { id: 'b' }] }
    expect(accountIdsForRequest(state, 'a')).toEqual(['a'])
  })

  it('не передан → все аккаунты', () => {
    const state = { accounts: [{ id: 'a' }, { id: 'b' }] }
    expect(accountIdsForRequest(state, null)).toEqual(['a', 'b'])
    expect(accountIdsForRequest(state, undefined)).toEqual(['a', 'b'])
  })

  it('пустой state → []', () => {
    expect(accountIdsForRequest({ accounts: [] }, null)).toEqual([])
  })
})

describe('healthErrorText', () => {
  it('result.error приоритет', () => {
    expect(healthErrorText({ error: 'E1', message: 'M' })).toBe('E1')
  })

  it('result.message если нет error', () => {
    expect(healthErrorText({ message: 'M' })).toBe('M')
  })

  it('fallback при пустом', () => {
    expect(healthErrorText(null)).toBe('Ошибка Telegram API')
    expect(healthErrorText(null, 'кастом')).toBe('кастом')
  })
})

describe('accountStatById', () => {
  it('находит по accountId', () => {
    const r = {
      accountStats: [
        { accountId: 'a', ms: 100 },
        { accountId: 'b', ms: 200 },
      ],
    }
    expect(accountStatById(r, 'b')).toEqual({ accountId: 'b', ms: 200 })
  })

  it('не найдено → null', () => {
    expect(accountStatById({ accountStats: [] }, 'x')).toBeNull()
    expect(accountStatById({}, 'x')).toBeNull()
    expect(accountStatById(null, 'x')).toBeNull()
  })
})

describe('pickNotifTitle — имя в карточке уведомления (v1.2.130)', () => {
  it('группа: показывает АВТОРА сообщения, а не название группы', () => {
    expect(pickNotifTitle({ senderName: 'Иван' }, { title: 'OZONовая Дыра' })).toBe('Иван')
  })
  it('автор неизвестен (пусто) → название чата', () => {
    expect(pickNotifTitle({ senderName: '' }, { title: 'OZONовая Дыра' })).toBe('OZONовая Дыра')
  })
  it('чат ещё не загружен (гонка) и автора нет → запасное Telegram', () => {
    expect(pickNotifTitle({}, undefined)).toBe('Telegram')
  })
  it('чат не загружен, но автор есть → автор (а не Telegram)', () => {
    expect(pickNotifTitle({ senderName: 'Пётр' }, undefined)).toBe('Пётр')
  })
})
