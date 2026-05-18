// v0.89.0 — Stage 4 / Этап 2.6: тесты tdlibBackend (полная интеграция).

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'

function makeMockClient(invokeImpl) {
  const client = new EventEmitter()
  client.invoke = vi.fn(invokeImpl || (() => Promise.resolve({ '@type': 'ok' })))
  client.close = vi.fn(() => Promise.resolve())
  return client
}

function makeBackend() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_main', {})
  // v0.89.3: tdlibParameters больше не передаётся в createTdlibBackend (теперь
  // живёт в clientParams через makeClientParams). См. tdlibStartup.js.
  const backend = createTdlibBackend({
    manager: mgr,
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
  })
  return { mgr, mockClient, backend }
}

// ──────────────────────────────────────────────────────────────────────
// FACTORY + BASIC
// ──────────────────────────────────────────────────────────────────────

describe('createTdlibBackend', () => {
  it('требует manager', () => {
    expect(() => createTdlibBackend({})).toThrow(/TdlibClientManager required/)
  })

  it('возвращает backend с name=tdlib и всеми группами методов', () => {
    const { backend } = makeBackend()
    expect(backend.name).toBe('tdlib')
    expect(backend.auth).toBeDefined()
    expect(backend.chats).toBeDefined()
    expect(backend.messages).toBeDefined()
    expect(backend.media).toBeDefined()
    expect(backend.forum).toBeDefined()
  })

  it('экспортирует _manager для внешнего доступа к events', () => {
    const { backend, mgr } = makeBackend()
    expect(backend._manager).toBe(mgr)
  })
})

// ──────────────────────────────────────────────────────────────────────
// chats — getChats из cache (без сетевого запроса в тесте)
// ──────────────────────────────────────────────────────────────────────

describe('backend.chats', () => {
  it('getCachedChats возвращает чаты из manager cache', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: 100, type: { '@type': 'chatTypePrivate', user_id: 100 }, title: 'Чат', unread_count: 3 },
    })
    const r = await backend.chats.getCachedChats('tg_main')
    expect(r.ok).toBe(true)
    expect(r.chats).toHaveLength(1)
    expect(r.chats[0].title).toBe('Чат')
    expect(r.chats[0].id).toBe('tg_main:100')
  })

  it('rescanUnread возвращает accountStats', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: 1, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'A', unread_count: 5 },
    })
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: 2, type: { '@type': 'chatTypePrivate', user_id: 2 }, title: 'B', unread_count: 10 },
    })
    const r = await backend.chats.rescanUnread()
    expect(r.ok).toBe(true)
    expect(r.accountStats).toEqual([
      expect.objectContaining({ accountId: 'tg_main', chats: 2, unreadTotal: 15 }),
    ])
  })

  it('healthCheck делает getOption и возвращает accountStats массив', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'optionValueString', value: '1.8.30' })
    const r = await backend.chats.healthCheck()
    expect(r.ok).toBe(true)
    // v0.89.0 / Этап 3.8: UI ожидает accountStats[] с { accountId, ms, ok }
    expect(Array.isArray(r.accountStats)).toBe(true)
    expect(r.accountStats[0]).toEqual(expect.objectContaining({
      accountId: 'tg_main', ok: true,
    }))
    expect(r.accountStats[0].ms).toBeGreaterThanOrEqual(0)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getOption', name: 'version',
    }))
  })

  it('getChats(accountId) вызывает loadChats', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'ok' })
    await backend.chats.getChats('tg_main')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'loadChats',
    }))
  })
})

// ──────────────────────────────────────────────────────────────────────
// messages — get, send, edit, delete, markRead, getPinned
// ──────────────────────────────────────────────────────────────────────

describe('backend.messages', () => {
  it('get парсит chatId и вызывает getChatHistory', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({
      messages: [{
        '@type': 'message', id: 5, chat_id: -1001,
        sender_id: { '@type': 'messageSenderUser', user_id: 42 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'привет', entities: [] } },
      }],
    })
    const r = await backend.messages.get({ chatId: 'tg_main:-1001', limit: 10 })
    expect(r.ok).toBe(true)
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0].text).toBe('привет')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getChatHistory', chat_id: -1001, limit: 10,
    }))
  })

  it('get использует userCache для senderName', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', { '@type': 'updateUser', user: { id: 42, first_name: 'Иван' } })
    mockClient.invoke.mockResolvedValueOnce({
      messages: [{
        '@type': 'message', id: 1, chat_id: -1001,
        sender_id: { '@type': 'messageSenderUser', user_id: 42 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'x', entities: [] } },
      }],
    })
    const r = await backend.messages.get({ chatId: 'tg_main:-1001', limit: 1 })
    expect(r.messages[0].senderName).toBe('Иван')
  })

  it('send корректно парсит chatId и вызывает sendMessage', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'message', id: 999, chat_id: -1001,
      sender_id: { '@type': 'messageSenderUser', user_id: 1 },
      is_outgoing: true, date: 1715000000, media_album_id: '0',
      content: { '@type': 'messageText', text: { text: 'hi', entities: [] } },
    })
    const r = await backend.messages.send('tg_main:-1001', 'hi', null)
    expect(r.ok).toBe(true)
    expect(r.messageId).toBe('999')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'sendMessage', chat_id: -1001,
    }))
  })

  it('некорректный chatId → invalid chatId', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.send('no-colon', 'text')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid chatId')
  })

  it('chatId с несуществующим accountId → account not found', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.send('tg_nope:-1', 'text')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('account not found')
  })

  it('markRead вызывает viewMessages с одним maxId', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.messages.markRead('tg_main:-1001', 100)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'viewMessages', chat_id: -1001, message_ids: [100],
    }))
  })

  it('deleteMessage — оборачивает в массив', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.messages.deleteMessage('tg_main:-1001', 50, true)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'deleteMessages', message_ids: [50], revoke: true,
    }))
  })

  it('editMessage', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.messages.editMessage('tg_main:-1001', 50, 'new')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'editMessageText', chat_id: -1001, message_id: 50,
    }))
  })

  // Этап 3.13: sendFile + forwardMessage — тесты вынесены в tdlibBackendSendFwd.vitest.js
  //  (лимит файла 400 строк).

  it('getPinned работает', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'message', id: 100, chat_id: -1001,
      sender_id: { '@type': 'messageSenderUser', user_id: 1 },
      is_outgoing: false, date: 1715000000, media_album_id: '0',
      content: { '@type': 'messageText', text: { text: 'pinned', entities: [] } },
    })
    const r = await backend.messages.getPinned('tg_main:-1001')
    expect(r.ok).toBe(true)
    expect(r.message.text).toBe('pinned')
  })
})

// ──────────────────────────────────────────────────────────────────────
// auth — flow с временным accountId
// ──────────────────────────────────────────────────────────────────────

