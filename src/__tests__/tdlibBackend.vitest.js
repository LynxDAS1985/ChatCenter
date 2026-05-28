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

  // v0.95.15: ИТЕРАТИВНЫЙ fetch для jump-to-end. См. .memory-bank/jump-to-end-saga.md.
  // TDLib namerenno возвращает меньше чем limit (issue #740). Backend делает
  // несколько вызовов с обновляющимся from_message_id пока не наберём targetCount
  // ИЛИ не получим untilMessageId.
  describe('messages.getIterativeUntil (v0.95.15)', () => {
    function makeMsg(id, content = 'msg') {
      return {
        '@type': 'message', id: Number(id), chat_id: -1001,
        sender_id: { '@type': 'messageSenderUser', user_id: 42 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: content, entities: [] } },
      }
    }

    it('итерирует пока не наберёт targetCount', async () => {
      const { backend, mockClient } = makeBackend()
      // Iter 1: возвращает 30 messages (TDLib chose less than 100)
      mockClient.invoke.mockResolvedValueOnce({
        messages: Array.from({ length: 30 }, (_, i) => makeMsg(100 - i)),
      })
      // Iter 2: возвращает ещё 30 (older)
      mockClient.invoke.mockResolvedValueOnce({
        messages: Array.from({ length: 30 }, (_, i) => makeMsg(70 - i)),
      })
      // Iter 3: возвращает ещё 30 — теперь набрали 90
      mockClient.invoke.mockResolvedValueOnce({
        messages: Array.from({ length: 30 }, (_, i) => makeMsg(40 - i)),
      })
      // Iter 4: ещё 30 → 120 → достаточно
      mockClient.invoke.mockResolvedValueOnce({
        messages: Array.from({ length: 30 }, (_, i) => makeMsg(10 - i)),
      })

      const r = await backend.messages.getIterativeUntil({
        chatId: 'tg_main:-1001',
        targetCount: 100,
        maxIterations: 5,
      })
      expect(r.ok).toBe(true)
      expect(r.messages.length).toBeGreaterThanOrEqual(100)
      expect(r.iterations).toBeGreaterThan(1)  // multi-iteration работает
    })

    it('v0.95.17: НЕ останавливается на untilMessageId — продолжает до targetCount', async () => {
      // Регрессия v0.95.16: TDLib часто возвращает в iter 1 ТОЛЬКО X →
      // если break на untilMessageId, юзер видит 1 сообщение. Issue #740 quirk.
      // Официальный паттерн: итерировать пока remaining > 0 && !empty.
      const { backend, mockClient } = makeBackend()
      mockClient.invoke.mockResolvedValueOnce({ messages: [makeMsg(95)] })  // iter 1: только X
      mockClient.invoke.mockResolvedValueOnce({  // iter 2: older
        messages: Array.from({ length: 50 }, (_, i) => makeMsg(94 - i)),
      })
      mockClient.invoke.mockResolvedValueOnce({  // iter 3: ещё older
        messages: Array.from({ length: 50 }, (_, i) => makeMsg(44 - i)),
      })

      const r = await backend.messages.getIterativeUntil({
        chatId: 'tg_main:-1001',
        untilMessageId: '95',
        targetCount: 100,
        maxIterations: 5,
      })
      expect(r.ok).toBe(true)
      expect(r.iterations).toBeGreaterThan(1)  // НЕ break после iter 1
      expect(r.messages.length).toBeGreaterThanOrEqual(100)
      expect(r.messages.some(m => String(m.id) === '95')).toBe(true)  // X всё равно в результате
    })

    it('останавливается при пустом ответе (конец истории)', async () => {
      const { backend, mockClient } = makeBackend()
      mockClient.invoke.mockResolvedValueOnce({ messages: [makeMsg(50)] })
      mockClient.invoke.mockResolvedValueOnce({ messages: [] })  // empty → stop

      const r = await backend.messages.getIterativeUntil({
        chatId: 'tg_main:-1001',
        targetCount: 100,
      })
      expect(r.ok).toBe(true)
      expect(r.messages.length).toBe(1)
      expect(r.iterations).toBe(2)  // 1 iter с данными + 1 empty
    })

    it('защита от бесконечного цикла — maxIterations clamp [1, 10]', async () => {
      const { backend, mockClient } = makeBackend()
      // Всегда возвращает дубль одного и того же — TDLib stuck
      mockClient.invoke.mockResolvedValue({ messages: [makeMsg(50)] })

      const r = await backend.messages.getIterativeUntil({
        chatId: 'tg_main:-1001',
        targetCount: 100,
        maxIterations: 999,  // попытка переопределить clamp
      })
      expect(r.ok).toBe(true)
      // 1 первая iter с msg=50, потом vsё дубли → стоп. Меньше 10 итераций.
      expect(r.iterations).toBeLessThanOrEqual(10)
    })

    it('возвращает messages отсортированные по id ASC', async () => {
      const { backend, mockClient } = makeBackend()
      // TDLib возвращает в reverse-chrono (от нового к старому), наш getChatHistory
      // делает reverse → ASC. Iterative должен сохранить ASC после merge.
      mockClient.invoke.mockResolvedValueOnce({
        messages: [makeMsg(100), makeMsg(99), makeMsg(98)],
      })

      const r = await backend.messages.getIterativeUntil({
        chatId: 'tg_main:-1001',
        targetCount: 100,
        maxIterations: 1,
      })
      expect(r.ok).toBe(true)
      const ids = r.messages.map(m => Number(m.id))
      expect(ids).toEqual([...ids].sort((a, b) => a - b))
    })
  })

  // v0.95.16: ИТЕРАТИВНЫЙ fetch для форум-ТОПИКА. Зеркало getIterativeUntil
  // но через getMessageThreadHistory (для не-General) или getChatHistory (General).
  // TDLib spec: getMessageThreadHistory имеет ТОТ ЖЕ quirk: «number of returned messages
  // is chosen by TDLib and can be smaller than limit».
  describe('messages.getIterativeUntilTopic (v0.95.16)', () => {
    function makeMsg(id) {
      return {
        '@type': 'message', id: Number(id), chat_id: -1001,
        sender_id: { '@type': 'messageSenderUser', user_id: 42 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'topic msg', entities: [] } },
      }
    }

    it('не-General topic: использует getMessageThreadHistory', async () => {
      const { backend, mockClient } = makeBackend()
      mockClient.invoke.mockResolvedValueOnce({
        messages: Array.from({ length: 50 }, (_, i) => makeMsg(100 - i)),
      })
      mockClient.invoke.mockResolvedValueOnce({
        messages: Array.from({ length: 50 }, (_, i) => makeMsg(50 - i)),
      })

      const r = await backend.messages.getIterativeUntilTopic({
        chatId: 'tg_main:-1001',
        threadMessageId: '999',
        isGeneral: false,
        targetCount: 100,
        maxIterations: 5,
      })
      expect(r.ok).toBe(true)
      expect(r.messages.length).toBeGreaterThanOrEqual(100)
      // Первый invoke — getMessageThreadHistory (НЕ getChatHistory)
      expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
        '@type': 'getMessageThreadHistory',
        chat_id: -1001,
        message_id: 999,
      }))
    })

    it('General topic: использует getChatHistory (не getMessageThreadHistory)', async () => {
      const { backend, mockClient } = makeBackend()
      mockClient.invoke.mockResolvedValueOnce({ messages: [makeMsg(50)] })
      mockClient.invoke.mockResolvedValueOnce({ messages: [] })  // empty → stop

      const r = await backend.messages.getIterativeUntilTopic({
        chatId: 'tg_main:-1001',
        isGeneral: true,
        targetCount: 100,
      })
      expect(r.ok).toBe(true)
      // General → getChatHistory, не getMessageThreadHistory
      expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
        '@type': 'getChatHistory',
        chat_id: -1001,
      }))
    })

    it('не-General БЕЗ threadMessageId → error', async () => {
      const { backend } = makeBackend()
      const r = await backend.messages.getIterativeUntilTopic({
        chatId: 'tg_main:-1001',
        isGeneral: false,
        // threadMessageId отсутствует
        targetCount: 100,
      })
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/threadMessageId required/)
    })

    it('v0.95.17: НЕ останавливается на untilMessageId для топика — продолжает до targetCount', async () => {
      // Та же регрессия что в getIterativeUntil. Untilbase НЕ short-circuit.
      const { backend, mockClient } = makeBackend()
      mockClient.invoke.mockResolvedValueOnce({ messages: [makeMsg(95)] })  // iter 1: только X
      mockClient.invoke.mockResolvedValueOnce({
        messages: Array.from({ length: 50 }, (_, i) => makeMsg(94 - i)),
      })
      mockClient.invoke.mockResolvedValueOnce({
        messages: Array.from({ length: 50 }, (_, i) => makeMsg(44 - i)),
      })

      const r = await backend.messages.getIterativeUntilTopic({
        chatId: 'tg_main:-1001',
        threadMessageId: '1',
        isGeneral: false,
        untilMessageId: '95',
        targetCount: 100,
      })
      expect(r.ok).toBe(true)
      expect(r.iterations).toBeGreaterThan(1)
      expect(r.messages.length).toBeGreaterThanOrEqual(100)
      expect(r.messages.some(m => String(m.id) === '95')).toBe(true)
    })

    it('защита maxIterations clamp [1, 10] — дубли → stop рано', async () => {
      const { backend, mockClient } = makeBackend()
      mockClient.invoke.mockResolvedValue({ messages: [makeMsg(50)] })  // всегда дубль

      const r = await backend.messages.getIterativeUntilTopic({
        chatId: 'tg_main:-1001',
        threadMessageId: '1',
        isGeneral: false,
        targetCount: 100,
        maxIterations: 999,  // попытка обойти clamp
      })
      expect(r.ok).toBe(true)
      expect(r.iterations).toBeLessThanOrEqual(10)
    })
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

