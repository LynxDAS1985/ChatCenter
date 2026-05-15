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
  it('вызывает getMessageThreadHistory с правильными параметрами', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ messages: [] })
    await backend.messages.getTopic({ chatId: 'tg_main:-1001', topicId: 5, limit: 50 })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getMessageThreadHistory',
      chat_id: -1001, message_id: 5, limit: 50,
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
    const r = await backend.messages.getTopic({ chatId: 'tg_main:-1001', topicId: 5, limit: 50 })
    expect(r.ok).toBe(true)
    expect(r.messages).toHaveLength(2)
    expect(r.messages[0].text).toBe('old')
    expect(r.messages[1].text).toBe('new')
  })

  it('topicId отсутствует → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.getTopic({ chatId: 'tg_main:-1001' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no topicId')
  })

  it('invoke падает → ok: false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce(new Error('TOPIC_NOT_FOUND'))
    const r = await backend.messages.getTopic({ chatId: 'tg_main:-1001', topicId: 99 })
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

  it('forum чат с topics → правильно мапятся поля', async () => {
    const { backend, mockClient } = makeBackend()
    // Кешируем forum chat
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: {
        id: -1001,
        type: { '@type': 'chatTypeSupergroup', supergroup_id: 1, is_channel: false, is_forum: true },
        title: 'Forum',
        unread_count: 0,
      },
    })
    mockClient.invoke.mockResolvedValueOnce({
      topics: [
        { info: { message_thread_id: 5, name: 'Topic A' }, unread_count: 3 },
        {
          info: { message_thread_id: 7, name: 'Topic B', is_closed: false, icon: { color: 7322096, custom_emoji_id: 12345 } },
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
    }))
    expect(r.topics[1]).toEqual(expect.objectContaining({
      id: '7', title: 'Topic B', isPinned: true,
      iconColor: 7322096, iconCustomEmojiId: '12345', readInboxMaxId: 42,
    }))
  })

  it('параметры invoke содержат правильный chat_id и limit', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: {
        id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1, is_forum: true },
        title: 'X', unread_count: 0,
      },
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
        id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1, is_forum: true },
        title: 'X', unread_count: 0,
      },
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
        id: -1001, type: { '@type': 'chatTypeSupergroup', supergroup_id: 1, is_forum: true },
        title: 'X', unread_count: 0,
      },
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
