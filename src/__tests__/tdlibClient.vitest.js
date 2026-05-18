// v0.89.0 — Stage 4 / Этап 2.2: тесты TdlibClientManager.
//
// Мокаем clientFactory чтобы не запускать реальное TDLib соединение.
// Mock client = EventEmitter — мы вручную эмитим updateX events и проверяем
// как Manager реагирует (cache, наши events).

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import {
  TdlibClientManager, userDisplayName, chatDisplayName,
} from '../../main/native/backends/tdlibClient.js'

// Хелпер: mock-клиент эмулирует поведение реального tdl-клиента.
// Сам — EventEmitter; у него есть .close() как функция.
function makeMockClient() {
  const client = new EventEmitter()
  client.close = vi.fn(() => Promise.resolve())
  client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  return client
}

function makeManager() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  return { mgr, mockClient }
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

describe('userDisplayName', () => {
  it('first_name + last_name', () => {
    expect(userDisplayName({ first_name: 'Иван', last_name: 'Петров' })).toBe('Иван Петров')
  })

  it('только first_name', () => {
    expect(userDisplayName({ first_name: 'Иван' })).toBe('Иван')
  })

  it('fallback на @username если имя пустое', () => {
    expect(userDisplayName({
      first_name: '', last_name: '',
      usernames: { active_usernames: ['ivan_p'] },
    })).toBe('@ivan_p')
  })

  it('null / undefined → пустая строка', () => {
    expect(userDisplayName(null)).toBe('')
    expect(userDisplayName(undefined)).toBe('')
  })
})

describe('chatDisplayName', () => {
  it('title', () => {
    expect(chatDisplayName({ title: 'Мой чат' })).toBe('Мой чат')
  })

  it('null → пустая строка', () => {
    expect(chatDisplayName(null)).toBe('')
  })
})

// ──────────────────────────────────────────────────────────────────────
// CREATE / REMOVE ACCOUNT
// ──────────────────────────────────────────────────────────────────────

describe('TdlibClientManager — accounts', () => {
  it('createAccount добавляет запись и навешивает listeners', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_1', { apiId: 1 })
    expect(mgr.listAccounts()).toEqual(['tg_1'])
    expect(mgr.getClient('tg_1')).toBe(mockClient)
    // Проверяем что навешан хотя бы один listener на 'update' и 'error'
    expect(mockClient.listenerCount('update')).toBeGreaterThan(0)
    expect(mockClient.listenerCount('error')).toBeGreaterThan(0)
  })

  it('createAccount повторно — возвращает существующую запись', () => {
    const { mgr } = makeManager()
    const rec1 = mgr.createAccount('tg_1', {})
    const rec2 = mgr.createAccount('tg_1', {})
    expect(rec1).toBe(rec2)
  })

  it('createAccount без accountId — ошибка', () => {
    const { mgr } = makeManager()
    expect(() => mgr.createAccount('', {})).toThrow(/accountId required/)
  })

  it('createAccount без clientFactory — ошибка', () => {
    const mgr = new TdlibClientManager({})
    expect(() => mgr.createAccount('tg_1', {})).toThrow(/clientFactory not configured/)
  })

  it('removeAccount закрывает клиент и удаляет из listAccounts', async () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_1', {})
    const removeEvent = vi.fn()
    mgr.on('account:removed', removeEvent)
    await mgr.removeAccount('tg_1')
    expect(mockClient.close).toHaveBeenCalled()
    expect(mgr.listAccounts()).toEqual([])
    expect(removeEvent).toHaveBeenCalledWith({ accountId: 'tg_1' })
  })

  it('removeAccount несуществующего — false', async () => {
    const { mgr } = makeManager()
    const ok = await mgr.removeAccount('tg_nope')
    expect(ok).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────
// USER CACHE
// ──────────────────────────────────────────────────────────────────────

describe('user cache via updateUser', () => {
  it('updateUser сохраняется в userCache', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateUser',
      user: { id: 42, first_name: 'Алиса', last_name: 'Иванова' },
    })
    const cached = mgr.getUserCached('tg_a', 42)
    expect(cached?.first_name).toBe('Алиса')
  })

  it('повторный updateUser перезаписывает', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', { '@type': 'updateUser', user: { id: 1, first_name: 'Old' } })
    mockClient.emit('update', { '@type': 'updateUser', user: { id: 1, first_name: 'New' } })
    expect(mgr.getUserCached('tg_a', 1)?.first_name).toBe('New')
  })

  it('getUserCached для пустого id → null', () => {
    const { mgr } = makeManager()
    mgr.createAccount('tg_a', {})
    expect(mgr.getUserCached('tg_a', null)).toBe(null)
    expect(mgr.getUserCached('tg_a', undefined)).toBe(null)
  })
})

// ──────────────────────────────────────────────────────────────────────
// CHAT CACHE + PATCHING
// ──────────────────────────────────────────────────────────────────────

describe('chat cache via updateNewChat / patches', () => {
  it('updateNewChat сохраняется в chatCache', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: {
        id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1, is_channel: true },
        title: 'Канал', unread_count: 5,
      },
    })
    expect(mgr.getChatCached('tg_a', -1001)?.title).toBe('Канал')
  })

  it('updateChatTitle патчит cache', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'Old', unread_count: 0 },
    })
    mockClient.emit('update', { '@type': 'updateChatTitle', chat_id: -1, title: 'New' })
    expect(mgr.getChatCached('tg_a', -1)?.title).toBe('New')
  })

  it('updateChatReadInbox → unread обновляется + emit chat:unread-sync', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'X', unread_count: 5 },
    })
    const syncEvent = vi.fn()
    mgr.on('chat:unread-sync', syncEvent)
    mockClient.emit('update', {
      '@type': 'updateChatReadInbox',
      chat_id: -1, last_read_inbox_message_id: 100, unread_count: 2,
    })
    expect(mgr.getChatCached('tg_a', -1)?.unread_count).toBe(2)
    expect(syncEvent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'tg_a', chatId: 'tg_a:-1', unreadCount: 2,
    }))
  })

  it('updateChatTitle для незакешированного чата — игнорируется', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    expect(() => mockClient.emit('update', {
      '@type': 'updateChatTitle', chat_id: -999, title: 'Phantom',
    })).not.toThrow()
    expect(mgr.getChatCached('tg_a', -999)).toBe(null)
  })
})

// v0.89.25: тесты supergroup cache вынесены в tdlibClientSupergroup.vitest.js
// (этот файл превышал лимит 400 строк).

// ──────────────────────────────────────────────────────────────────────
// NEW MESSAGE — emit + cache lookup для senderName
// ──────────────────────────────────────────────────────────────────────

describe('updateNewMessage', () => {
  it('updateNewMessage эмитит message:new с замапленным NativeMessage', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    // Сначала кешируем sender
    mockClient.emit('update', { '@type': 'updateUser', user: { id: 42, first_name: 'Алиса' } })

    const msgEvent = vi.fn()
    mgr.on('message:new', msgEvent)

    mockClient.emit('update', {
      '@type': 'updateNewMessage',
      message: {
        '@type': 'message',
        id: 100, chat_id: -1,
        sender_id: { '@type': 'messageSenderUser', user_id: 42 },
        is_outgoing: false,
        date: 1715000000,
        media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'Привет', entities: [] } },
      },
    })

    expect(msgEvent).toHaveBeenCalledOnce()
    const payload = msgEvent.mock.calls[0][0]
    expect(payload.accountId).toBe('tg_a')
    expect(payload.chatId).toBe('tg_a:-1')
    expect(payload.message.id).toBe('100')
    expect(payload.message.text).toBe('Привет')
    // senderName должен подтянуться из userCache
    expect(payload.message.senderName).toBe('Алиса')
  })

  it('без кешированного user — senderName пустой', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const msgEvent = vi.fn()
    mgr.on('message:new', msgEvent)

    mockClient.emit('update', {
      '@type': 'updateNewMessage',
      message: {
        '@type': 'message', id: 1, chat_id: -1,
        sender_id: { '@type': 'messageSenderUser', user_id: 999 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: '', entities: [] } },
      },
    })
    expect(msgEvent.mock.calls[0][0].message.senderName).toBe('')
  })

  it('sender messageSenderChat — берём title из chatCache', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -999, type: { '@type': 'chatTypeSupergroup', supergroup_id: 5 }, title: 'Канал', unread_count: 0 },
    })

    const msgEvent = vi.fn()
    mgr.on('message:new', msgEvent)
    mockClient.emit('update', {
      '@type': 'updateNewMessage',
      message: {
        '@type': 'message', id: 7, chat_id: -999,
        sender_id: { '@type': 'messageSenderChat', chat_id: -999 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'Пост', entities: [] } },
      },
    })
    expect(msgEvent.mock.calls[0][0].message.senderName).toBe('Канал')
  })
})

// ──────────────────────────────────────────────────────────────────────
// AUTH / ERRORS / OTHER EVENTS
// ──────────────────────────────────────────────────────────────────────

describe('auth state + errors', () => {
  it('updateAuthorizationState → emit account:auth-state + сохраняет в getAuthState', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const authEvent = vi.fn()
    mgr.on('account:auth-state', authEvent)
    mockClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitPhoneNumber' },
    })
    expect(authEvent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'tg_a',
      state: 'authorizationStateWaitPhoneNumber',
    }))
    expect(mgr.getAuthState('tg_a')).toBe('authorizationStateWaitPhoneNumber')
  })

  it('client.error → emit account:error', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const errEvent = vi.fn()
    mgr.on('account:error', errEvent)
    const err = new Error('test error')
    mockClient.emit('error', err)
    expect(errEvent).toHaveBeenCalledWith({ accountId: 'tg_a', error: err })
  })

  it('updateDeleteMessages is_permanent → message:deleted', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const delEvent = vi.fn()
    mgr.on('message:deleted', delEvent)
    mockClient.emit('update', {
      '@type': 'updateDeleteMessages',
      chat_id: -1, message_ids: [100, 101], is_permanent: true,
    })
    expect(delEvent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'tg_a', chatId: 'tg_a:-1',
      messageIds: ['100', '101'],
    }))
  })

  it('updateDeleteMessages is_permanent=false → не эмитим', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const delEvent = vi.fn()
    mgr.on('message:deleted', delEvent)
    mockClient.emit('update', {
      '@type': 'updateDeleteMessages',
      chat_id: -1, message_ids: [1], is_permanent: false,
    })
    expect(delEvent).not.toHaveBeenCalled()
  })

  it('неизвестный @type → update:raw', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const rawEvent = vi.fn()
    mgr.on('update:raw', rawEvent)
    mockClient.emit('update', { '@type': 'updateFutureThing', some: 'data' })
    expect(rawEvent).toHaveBeenCalled()
  })

  it('updateFile → file:update event с { accountId, file }', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    const fileEvent = vi.fn()
    mgr.on('file:update', fileEvent)
    const file = { id: 100, local: { downloaded_size: 50000, is_downloading_completed: false } }
    mockClient.emit('update', { '@type': 'updateFile', file })
    expect(fileEvent).toHaveBeenCalledWith({ accountId: 'tg_a', file })
  })
})

// ──────────────────────────────────────────────────────────────────────
// getAccountChats — выдаёт список Chat[] из cache
// ──────────────────────────────────────────────────────────────────────

describe('getAccountChats', () => {
  it('возвращает список замапленных чатов из cache', () => {
    const { mgr, mockClient } = makeManager()
    mgr.createAccount('tg_a', {})
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: 1, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'A', unread_count: 0 },
    })
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 5, is_channel: true }, title: 'B', unread_count: 3 },
    })
    const chats = mgr.getAccountChats('tg_a')
    expect(chats).toHaveLength(2)
    expect(chats.find(c => c.id === 'tg_a:1')?.title).toBe('A')
    expect(chats.find(c => c.id === 'tg_a:-1001')?.type).toBe('channel')
  })

  it('пустой аккаунт → пустой массив', () => {
    const { mgr } = makeManager()
    mgr.createAccount('tg_a', {})
    expect(mgr.getAccountChats('tg_a')).toEqual([])
  })

  it('несуществующий аккаунт → пустой массив', () => {
    const { mgr } = makeManager()
    expect(mgr.getAccountChats('tg_nope')).toEqual([])
  })
})
