// v0.89.0 — Stage 4 / Этап 3.10: тесты forum topics через TDLib backend.
//
// Вынесено из tdlibBackend.vitest.js (тот достиг лимита 400 строк).
// Покрывает: messages.getTopic (getMessageThreadHistory), markTopicRead (viewMessages),
// forum.getTopics (getForumTopics).

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'

function makeMockClient(invokeImpl) {
  const c = new EventEmitter()
  c.invoke = vi.fn(invokeImpl || (() => Promise.resolve({ '@type': 'ok' })))
  c.close = vi.fn(() => Promise.resolve())
  return c
}

function makeBackend() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_main', {})
  const backend = createTdlibBackend({
    manager: mgr,
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
  })
  return { mgr, mockClient, backend }
}

describe('messages.getTopic (TDLib getMessageThreadHistory)', () => {
  // v0.89.30 (ловушка #29): обычная тема использует threadMessageId (int53)
  // — реальный message_thread_id для getMessageThreadHistory.
  it('обычная тема: вызывает getMessageThreadHistory с threadMessageId', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ messages: [] })
    await backend.messages.getTopic({
      chatId: 'tg_main:-1001',
      threadMessageId: '12345',  // real int53 message_thread_id
      limit: 50,
    })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getMessageThreadHistory',
      chat_id: -1001, message_id: 12345, limit: 50,
    }))
  })

  it('возвращает messages reversed (UI ждёт от старых к новым)', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({
      messages: [
        { '@type': 'message', id: 3, chat_id: -1, sender_id: { '@type': 'messageSenderUser', user_id: 1 }, is_outgoing: false, date: 100, media_album_id: '0', content: { '@type': 'messageText', text: { text: 'new', entities: [] } } },
        { '@type': 'message', id: 1, chat_id: -1, sender_id: { '@type': 'messageSenderUser', user_id: 1 }, is_outgoing: false, date: 50, media_album_id: '0', content: { '@type': 'messageText', text: { text: 'old', entities: [] } } },
      ],
    })
    const r = await backend.messages.getTopic({ chatId: 'tg_main:-1001', threadMessageId: '5', limit: 50 })
    expect(r.ok).toBe(true)
    expect(r.messages).toHaveLength(2)
    expect(r.messages[0].text).toBe('old')
    expect(r.messages[1].text).toBe('new')
  })

  // v0.89.30: ловушка #29 — General topic использует getChatHistory, НЕ getMessageThreadHistory
  it('General topic: вызывает getChatHistory (не getMessageThreadHistory)', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ messages: [] })
    await backend.messages.getTopic({
      chatId: 'tg_main:-1001',
      isGeneral: true,
      limit: 50,
    })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getChatHistory',
      chat_id: -1001, limit: 50,
    }))
  })

  it('threadMessageId отсутствует и не general → ok:true, messages:[] (пустая тема)', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.getTopic({ chatId: 'tg_main:-1001' })
    expect(r.ok).toBe(true)
    expect(r.messages).toEqual([])
    expect(r.hasMore).toBe(false)
  })

  it('fallback на topicId если threadMessageId не передан', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ messages: [] })
    // backwards-compat: старый API передавал topicId как идентификатор для invoke
    await backend.messages.getTopic({ chatId: 'tg_main:-1001', topicId: 555, limit: 50 })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getMessageThreadHistory',
      chat_id: -1001, message_id: 555,
    }))
  })

  it('invoke падает → ok: false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce(new Error('TOPIC_NOT_FOUND'))
    const r = await backend.messages.getTopic({ chatId: 'tg_main:-1001', threadMessageId: '99' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('TOPIC_NOT_FOUND')
  })
})

describe('messages.markTopicRead', () => {
  it('вызывает viewMessages с force_read', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.messages.markTopicRead('tg_main:-1001', 5, 100)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'viewMessages',
      chat_id: -1001, message_ids: [100], force_read: true,
    }))
  })

  // v0.89.31 (ловушка #30): по TDLib spec для форум-топика viewMessages
  // должен передавать source=messageSourceForumTopicHistory, иначе TDLib
  // угадывает по состоянию чата → forumTopic.unread_count не обновляется.
  it('передаёт source=messageSourceForumTopicHistory (TDLib spec)', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.messages.markTopicRead('tg_main:-1001', 5, 100)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'viewMessages',
      source: { '@type': 'messageSourceForumTopicHistory' },
    }))
  })

  it('invalid chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.markTopicRead('no-colon', 1, 100)
    expect(r.ok).toBe(false)
  })
})

describe('forum.getTopics (TDLib getForumTopics)', () => {
  it('не-forum чат → пустой массив + isForum: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.forum.getTopics('tg_main:-1', 10)
    expect(r.ok).toBe(true)
    expect(r.isForum).toBe(false)
    expect(r.topics).toEqual([])
  })

  // v0.89.25 (ловушка #24): Регрессия — если кто-то поставит is_forum в
  // chatTypeSupergroup без обновления supergroup в cache, isForum=false
  // (потому что TDLib не использует это поле в type, оно из supergroup).
  it('РЕГРЕССИЯ: type.is_forum=true БЕЗ updateSupergroup → isForum=false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: {
        id: -1001,
        // is_forum в type — НЕ должен влиять (TDLib его так не шлёт)
        type: { '@type': 'chatTypeSupergroup', supergroup_id: 1, is_forum: true },
        title: 'Forum-like impostor',
        unread_count: 0,
      },
    })
    // НЕ эмитим updateSupergroup → supergroup НЕ в cache
    const r = await backend.forum.getTopics('tg_main:-1001', 10)
    expect(r.ok).toBe(true)
    expect(r.isForum).toBe(false)
    expect(r.topics).toEqual([])
  })

  it('forum чат с topics → правильно мапятся поля', async () => {
    const { backend, mockClient } = makeBackend()
    // v0.89.25 (ловушка #24): is_forum в supergroup, не в chatTypeSupergroup.
    // Кешируем chat + supergroup отдельно (как делает TDLib).
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: {
        id: -1001,
        type: { '@type': 'chatTypeSupergroup', supergroup_id: 1, is_channel: false },
        title: 'Forum',
        unread_count: 0,
      },
    })
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 1, is_channel: false, is_forum: true },
    })
    mockClient.invoke.mockResolvedValueOnce({
      // v0.89.30 (ловушка #29): TDLib 1.8+ использует forum_topic_id вместо
      // message_thread_id в info. threadMessageId берётся из last_message.
      topics: [
        {
          info: { forum_topic_id: 5, name: 'Topic A', is_general: false },
          last_message: { id: 5000, message_thread_id: 5000 },
          unread_count: 3,
        },
        {
          info: { forum_topic_id: 7, name: 'Topic B', is_closed: false, is_general: false, icon: { color: 7322096, custom_emoji_id: 12345 } },
          last_message: { id: 7777, message_thread_id: 7777 },
          unread_count: 0,
          is_pinned: true,
          last_read_inbox_message_id: 42,
        },
      ],
    })
    const r = await backend.forum.getTopics('tg_main:-1001', 50)
    expect(r.ok).toBe(true)
    expect(r.isForum).toBe(true)
    expect(r.topics).toHaveLength(2)
    expect(r.topics[0]).toEqual(expect.objectContaining({
      id: '5', topicId: '5', topMessageId: '5', title: 'Topic A', unreadCount: 3,
      threadMessageId: '5000', isGeneral: false,  // v0.89.30
    }))
    expect(r.topics[1]).toEqual(expect.objectContaining({
      id: '7', title: 'Topic B', isPinned: true,
      iconColor: 7322096, iconCustomEmojiId: '12345', readInboxMaxId: 42,
      threadMessageId: '7777', isGeneral: false,  // v0.89.30
    }))
  })

  // v0.89.30 (ловушка #29): General topic — особый случай, is_general:true
  it('General topic → isGeneral=true, нет threadMessageId если last_message пуст', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1 }, title: 'F', unread_count: 0 },
    })
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 1, is_forum: true },
    })
    mockClient.invoke.mockResolvedValueOnce({
      topics: [{ info: { forum_topic_id: 1, name: 'General', is_general: true }, unread_count: 5 }],
    })
    const r = await backend.forum.getTopics('tg_main:-1001', 10)
    expect(r.topics[0].isGeneral).toBe(true)
    expect(r.topics[0].threadMessageId).toBe(null)
  })

  // v0.89.30: backwards-compat — старый mock с message_thread_id всё ещё работает
  it('BACKWARDS-COMPAT: TDLib 1.7 message_thread_id всё ещё парсится', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1 }, title: 'F', unread_count: 0 },
    })
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 1, is_forum: true },
    })
    mockClient.invoke.mockResolvedValueOnce({
      topics: [{ info: { message_thread_id: 99, name: 'Legacy' }, unread_count: 0 }],
    })
    const r = await backend.forum.getTopics('tg_main:-1001', 10)
    expect(r.topics[0].id).toBe('99')  // fallback на message_thread_id
  })

  it('параметры invoke содержат правильный chat_id и limit', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: {
        id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1 },
        title: 'X', unread_count: 0,
      },
    })
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 1, is_forum: true },
    })
    mockClient.invoke.mockResolvedValueOnce({ topics: [] })
    await backend.forum.getTopics('tg_main:-1001', 25)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getForumTopics',
      chat_id: -1001, query: '', limit: 25,
    }))
  })

  it('limit >100 ограничивается до 100', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: {
        id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1 },
        title: 'X', unread_count: 0,
      },
    })
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 1, is_forum: true },
    })
    mockClient.invoke.mockResolvedValueOnce({ topics: [] })
    await backend.forum.getTopics('tg_main:-1001', 500)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
  })

  it('invoke падает → ok: false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: {
        id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1 },
        title: 'X', unread_count: 0,
      },
    })
    mockClient.emit('update', {
      '@type': 'updateSupergroup',
      supergroup: { '@type': 'supergroup', id: 1, is_forum: true },
    })
    mockClient.invoke.mockRejectedValueOnce(new Error('FORUM_DISABLED'))
    const r = await backend.forum.getTopics('tg_main:-1001', 50)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('FORUM_DISABLED')
  })

  it('invalid chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.forum.getTopics('no-colon', 10)
    expect(r.ok).toBe(false)
    expect(r.isForum).toBe(false)
  })
})
