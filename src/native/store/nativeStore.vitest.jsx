// v0.87.41: тест для nativeStore.markRead — НЕ должен вычитать локально.
// Подтверждает Telegram-style поведение: счётчик меняется только от server sync.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useNativeStore from './nativeStore.js'

let invokeMock, onHandlers

beforeEach(() => {
  invokeMock = vi.fn(() => Promise.resolve({ ok: true }))
  onHandlers = {}
  globalThis.window.api = {
    invoke: invokeMock,
    on: vi.fn((ch, cb) => { onHandlers[ch] = cb; return () => { delete onHandlers[ch] } }),
    send: vi.fn(),
  }
})

describe('v0.87.41: markRead Telegram-style (no local subtraction)', () => {
  it('markRead НЕ вычитает локально — ждёт server sync', async () => {
    const { result } = renderHook(() => useNativeStore())
    // Устанавливаем чат с unreadCount=36 через tg:chats event
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 36 }],
      })
    })
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(36)

    // Вызываем markRead — локально НЕ должен измениться unread
    await act(async () => {
      await result.current.markRead('chat1', 3797)
    })
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(36)

    // IPC ушёл на сервер
    expect(invokeMock).toHaveBeenCalledWith('tg:mark-read', {
      chatId: 'chat1',
      maxId: 3797,
      readInboxMaxId: undefined,
    })
  })

  it('unreadCount обновляется ТОЛЬКО из tg:chat-unread-sync (server)', async () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 36 }],
      })
    })
    // Сервер говорит реальное значение
    act(() => {
      onHandlers['tg:chat-unread-sync']?.({ chatId: 'chat1', unreadCount: 35 })
    })
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(35)
  })

  it('markRead принимает только 2 аргумента (chatId, maxId) — не 3', async () => {
    const { result } = renderHook(() => useNativeStore())
    // Сигнатура должна быть (chatId, maxId) — Telegram-style
    expect(result.current.markRead.length).toBe(2)
  })

  it('нет прыжка 36→25→35 — плавно 36 пока server не ответил', async () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 36 }],
      })
    })
    // Имитируем readByVisibility с batch=11
    await act(async () => { await result.current.markRead('chat1', 3797) })
    // Локально остаётся 36 (не 25!)
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(36)
    // Сервер отвечает 35
    act(() => {
      onHandlers['tg:chat-unread-sync']?.({ chatId: 'chat1', unreadCount: 35 })
    })
    // Плавный переход 36→35
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(35)
  })
  it('markRead passes readInboxMaxId to backend when it is known', async () => {
    const { result } = renderHook(() => useNativeStore())
    await act(async () => {
      await result.current.markRead('chat1', 3797, { readInboxMaxId: 3700 })
    })
    expect(invokeMock).toHaveBeenCalledWith('tg:mark-read', {
      chatId: 'chat1',
      maxId: 3797,
      readInboxMaxId: 3700,
    })
  })
})

describe('Telegram forum topics: unread counters come from Telegram refresh', () => {
  it('markTopicRead does not clear topic unread locally and uses refreshed Telegram topic count', async () => {
    vi.useFakeTimers()
    let topicsCall = 0
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-forum-topics') {
        topicsCall += 1
        return Promise.resolve({
          ok: true,
          isForum: true,
          topics: [{
            id: '10',
            topicId: '10',
            topMessageId: '10',
            title: 'OZON',
            unreadCount: topicsCall <= 2 ? 185 : 160,
          }],
        })
      }
      if (channel === 'tg:get-topic-messages') return Promise.resolve({ ok: true, messages: [] })
      if (channel === 'tg:mark-topic-read') return Promise.resolve({ ok: true })
      return Promise.resolve({ ok: true })
    })

    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Forum', unreadCount: 185, type: 'group' }],
      })
    })

    await act(async () => {
      await result.current.loadForumTopics('chat1')
    })
    const topic = result.current.forumTopics.chat1[0]
    expect(topic.unreadCount).toBe(185)

    await act(async () => {
      await result.current.selectForumTopic('chat1', topic)
    })
    await act(async () => {
      const readResult = await result.current.markTopicRead('chat1', topic, 12345)
      expect(readResult).toMatchObject({ ok: true, refreshed: true, retryScheduled: true, unreadCount: 185 })
    })

    expect(result.current.forumTopics.chat1[0].unreadCount).toBe(185)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })

    expect(result.current.forumTopics.chat1[0].unreadCount).toBe(160)
    expect(result.current.activeForumTopic.chat1.unreadCount).toBe(160)
    expect(invokeMock).toHaveBeenCalledWith('tg:mark-topic-read', {
      chatId: 'chat1',
      topicId: '10',
      topMessageId: '10',
      maxId: 12345,
    })
    expect(invokeMock).toHaveBeenCalledWith('tg:get-forum-topics', { chatId: 'chat1', limit: 50 })
    vi.useRealTimers()
  })

  it('markTopicRead refresh also updates active topic unread-window metadata', async () => {
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-forum-topics') {
        return Promise.resolve({
          ok: true,
          isForum: true,
          topics: [{
            id: '10',
            topicId: '10',
            topMessageId: '10',
            title: 'OZON',
            unreadCount: 160,
            readInboxMaxId: 2000,
          }],
        })
      }
      if (channel === 'tg:get-topic-messages') {
        return Promise.resolve({
          ok: true,
          messages: Array.from({ length: 84 }, (_, i) => ({
            id: String(2001 + i),
            isOutgoing: false,
            timestamp: Date.now() + i,
          })),
        })
      }
      if (channel === 'tg:mark-topic-read') return Promise.resolve({ ok: true })
      return Promise.resolve({ ok: true })
    })

    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Forum', unreadCount: 271, type: 'group' }],
      })
    })

    const staleTopic = {
      id: '10',
      topicId: '10',
      topMessageId: '10',
      title: 'OZON',
      unreadCount: 271,
      readInboxMaxId: 2000,
    }
    await act(async () => {
      await result.current.selectForumTopic('chat1', staleTopic)
    })
    expect(result.current.messageWindows['chat1:topic:10'].unreadCount).toBe(271)

    await act(async () => {
      await result.current.markTopicRead('chat1', staleTopic, 2084)
    })

    expect(result.current.forumTopics.chat1[0].unreadCount).toBe(160)
    expect(result.current.activeForumTopic.chat1.unreadCount).toBe(160)
    expect(result.current.messageWindows['chat1:topic:10'].unreadCount).toBe(160)
  })

  it('markTopicRead keeps current unread count if Telegram topic refresh fails', async () => {
    let topicsCall = 0
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-forum-topics') {
        topicsCall += 1
        if (topicsCall > 1) return Promise.resolve({ ok: false, error: 'NETWORK' })
        return Promise.resolve({
          ok: true,
          isForum: true,
          topics: [{
            id: '10',
            topicId: '10',
            topMessageId: '10',
            title: 'OZON',
            unreadCount: 185,
          }],
        })
      }
      if (channel === 'tg:get-topic-messages') return Promise.resolve({ ok: true, messages: [] })
      if (channel === 'tg:mark-topic-read') return Promise.resolve({ ok: true })
      return Promise.resolve({ ok: true })
    })

    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Forum', unreadCount: 185, type: 'group' }],
      })
    })

    await act(async () => {
      await result.current.loadForumTopics('chat1')
    })
    const topic = result.current.forumTopics.chat1[0]
    await act(async () => {
      await result.current.selectForumTopic('chat1', topic)
    })
    await act(async () => {
      const readResult = await result.current.markTopicRead('chat1', topic, 12345)
      expect(readResult).toMatchObject({ ok: true, refreshed: false, refreshError: 'NETWORK' })
    })

    expect(result.current.forumTopics.chat1[0].unreadCount).toBe(185)
    expect(result.current.activeForumTopic.chat1.unreadCount).toBe(185)
  })
})

describe('Telegram-like unread opening windows', () => {
  it('loadMessages requests a bounded window around readInboxMaxId when chat has unread', async () => {
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-messages') return Promise.resolve({
        ok: true,
        aroundId: 1000,
        messages: Array.from({ length: 90 }, (_, i) => ({
          id: String(1001 + i),
          isOutgoing: false,
          timestamp: Date.now() + i,
        })),
      })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 76, readInboxMaxId: 1000 }],
      })
    })

    await act(async () => {
      await result.current.loadMessages('chat1')
    })

    // v0.88.0: limit ограничен 100 (жёсткий лимит Telegram API),
    // addOffset = -0.9*limit = -90 для unread>30 (90% окна — непрочитанные).
    expect(invokeMock).toHaveBeenCalledWith('tg:get-messages', {
      chatId: 'chat1',
      limit: 100,
      aroundId: 1000,
      addOffset: -90,
    })
    expect(result.current.messageWindows.chat1).toMatchObject({
      unreadWindowRequested: true,
      unreadWindowComplete: true,
      loadedIncoming: 90,
      unreadCount: 76,
      readInboxMaxId: 1000,
    })
  })

  it('selectForumTopic requests a bounded topic window around topic readInboxMaxId', async () => {
    const topic = { id: '10', topicId: '10', topMessageId: '10', title: 'OZON', unreadCount: 458, readInboxMaxId: 2000 }
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-topic-messages') return Promise.resolve({
        ok: true,
        aroundId: 2000,
        messages: Array.from({ length: 120 }, (_, i) => ({
          id: String(2001 + i),
          isOutgoing: false,
          timestamp: Date.now() + i,
        })),
      })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Forum', unreadCount: 458, type: 'group' }],
      })
    })

    await act(async () => {
      await result.current.selectForumTopic('chat1', topic)
    })

    // v0.88.0: для тем форумов та же логика — limit=100, addOffset=-90 (unread>30).
    // v0.89.30 (ловушка #29): добавлены threadMessageId + isGeneral
    expect(invokeMock).toHaveBeenCalledWith('tg:get-topic-messages', {
      chatId: 'chat1',
      topicId: '10',
      topMessageId: '10',
      threadMessageId: null,
      isGeneral: false,
      limit: 100,
      aroundId: 2000,
      addOffset: -90,
    })
    expect(result.current.messageWindows['chat1:topic:10']).toMatchObject({
      unreadWindowRequested: true,
      unreadWindowComplete: false,
      loadedIncoming: 120,
      unreadCount: 458,
      readInboxMaxId: 2000,
    })
  })
})

// v0.87.51: регрессионные тесты нового поведения "UI = сырой unreadCount".
describe('v0.87.51: bulk-sync и chat-unread-sync обновляют только unreadCount', () => {
  it('chat-unread-sync обновляет unreadCount чата', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 10 }],
      })
    })
    act(() => {
      onHandlers['tg:chat-unread-sync']?.({ chatId: 'chat1', unreadCount: 7 })
    })
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(7)
  })

  it('bulk-sync обновляет несколько чатов', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [
          { id: 'c1', accountId: 'acc1', title: 'A', unreadCount: 15 },
          { id: 'c2', accountId: 'acc1', title: 'B', unreadCount: 8 },
        ],
      })
    })
    act(() => {
      onHandlers['tg:unread-bulk-sync']?.({
        updates: [
          { id: 'c1', unreadCount: 0 },
          { id: 'c2', unreadCount: 3 },
        ],
      })
    })
    expect(result.current.chats.find(c => c.id === 'c1').unreadCount).toBe(0)
    expect(result.current.chats.find(c => c.id === 'c2').unreadCount).toBe(3)
  })

  it('recomputeGroupedUnread action НЕ существует (удалён)', () => {
    const { result } = renderHook(() => useNativeStore())
    expect(result.current.recomputeGroupedUnread).toBeUndefined()
  })
})

// v0.89.31 (ловушка #30): loadOlder/loadNewer для топиков ОБЯЗАНЫ пересчитывать
// messageWindows[key].loadedIncoming, иначе плашка «N из M» замирает на N первой
// загрузки. Один тест покрывает оба пути (older вверх + newer вниз).
describe('v0.89.31: loadOlder/Newer обновляют messageWindows[key] для топика', () => {
  it('loadedIncoming растёт после подгрузки older и newer', async () => {
    const topic = { id: '10', topicId: '10', topMessageId: '10', threadMessageId: '500',
      title: 'OZON', unreadCount: 217, readInboxMaxId: 500 }
    const key = 'chat1:topic:10'
    let call = 0
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-forum-topics') return Promise.resolve({ ok: true, isForum: true, topics: [topic] })
      if (channel === 'tg:get-topic-messages') {
        call += 1
        const batch = call === 1
          ? Array.from({ length: 100 }, (_, i) => ({ id: String(600 + i), isOutgoing: false }))
          : Array.from({ length: 50 }, (_, i) => ({ id: String((call === 2 ? 550 : 700) + i), isOutgoing: false }))
        return Promise.resolve({ ok: true, messages: batch, hasMore: true })
      }
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => { onHandlers['tg:chats']?.({ accountId: 'a1',
      chats: [{ id: 'chat1', accountId: 'a1', title: 'F', unreadCount: 217, type: 'group' }] }) })
    await act(async () => { await result.current.loadForumTopics('chat1') })
    await act(async () => { await result.current.selectForumTopic('chat1', topic) })
    expect(result.current.messageWindows[key].loadedIncoming).toBe(100)
    await act(async () => { await result.current.loadOlderMessages('chat1', 600, 50) })
    expect(result.current.messageWindows[key].loadedIncoming).toBe(150)
    await act(async () => { await result.current.loadNewerMessages('chat1', 699, 50) })
    expect(result.current.messages[key].length).toBe(200)
    expect(result.current.messageWindows[key].loadedIncoming).toBe(200)
  })
})
