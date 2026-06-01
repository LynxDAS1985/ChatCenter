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

  // ────────────────────────────────────────────────────────────────────────────
  // v0.95.26 РЕГРЕСС: tg:new-message НЕ должен обнулять unreadCount локально
  //
  // Корень бага (15 апреля 2026 → 1 июня 2026, 47 дней не ловили):
  //   nativeStoreIpc.js:396 раньше было:
  //     unreadCount: s.activeChatId === chatId ? 0 : (c.unreadCount||0) + (isOutgoing?0:1)
  //
  // Это нарушало правило v0.87.41 «уменьшение unreadCount ТОЛЬКО через
  // tg:chat-unread-sync (server)». Когда юзер открыт чат с 48 непрочитанных,
  // прокручен ВВЕРХ (не дочитал), и приходило новое сообщение — badge мгновенно
  // становился 0 (вместо 49). Server позже sync'ал с реальным числом, но
  // визуальный прыжок 48→0→48 был заметен юзеру.
  //
  // Эталоны: Telegram Web K (++dialog.unread_count всегда), Telegram Desktop
  // (atBottom guard перед readInbox). Decrement локально — антипаттерн.
  //
  // ВАЖНО: тесты с invokeMock зависят от того что invokeMock возвращает {ok:false}
  // для большинства каналов — поэтому начальный loadCachedChats и пр. не работают.
  // Но tg:chats event handler работает напрямую — используем его для setup.
  // ────────────────────────────────────────────────────────────────────────────

  it('v0.95.26: tg:new-message для АКТИВНОГО чата +1 (НЕ обнуляет до 0)', async () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 48 }],
      })
      result.current.setActiveChat('chat1')
    })
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(48)
    // Приходит новое сообщение для активного чата — counter должен стать 49,
    // а НЕ обнулиться до 0 (старый баг)
    act(() => {
      onHandlers['tg:new-message']?.({
        chatId: 'chat1',
        message: {
          id: '999', text: 'new msg', isOutgoing: false, timestamp: Date.now(),
        },
      })
    })
    const chat = result.current.chats.find(c => c.id === 'chat1')
    expect(chat.unreadCount).toBe(49)  // ← КЛЮЧЕВОЙ assert (раньше было 0)
  })

  it('v0.95.26: tg:new-message для НЕактивного чата +1 (как было)', async () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [
          { id: 'chat1', accountId: 'acc1', title: 'A', unreadCount: 10 },
          { id: 'chat2', accountId: 'acc1', title: 'B', unreadCount: 20 },
        ],
      })
      result.current.setActiveChat('chat1')  // активный — chat1
    })
    // Новое сообщение приходит в chat2 (НЕ активный)
    act(() => {
      onHandlers['tg:new-message']?.({
        chatId: 'chat2',
        message: { id: '999', text: 'new', isOutgoing: false, timestamp: Date.now() },
      })
    })
    expect(result.current.chats.find(c => c.id === 'chat2').unreadCount).toBe(21)
  })

  it('v0.95.26: outgoing сообщение НЕ меняет unreadCount (даже в активном чате)', async () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 48 }],
      })
      result.current.setActiveChat('chat1')
    })
    act(() => {
      onHandlers['tg:new-message']?.({
        chatId: 'chat1',
        message: { id: '999', text: 'мой ответ', isOutgoing: true, timestamp: Date.now() },
      })
    })
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(48)
  })

  it('v0.95.26: server sync tg:chat-unread-sync ОБНУЛЯЕТ когда нужно (decrement через server)', async () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 48 }],
      })
      result.current.setActiveChat('chat1')
    })
    // Пришло новое сообщение — counter 48 → 49 (НЕ 0)
    act(() => {
      onHandlers['tg:new-message']?.({
        chatId: 'chat1',
        message: { id: '999', text: 'new', isOutgoing: false, timestamp: Date.now() },
      })
    })
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(49)
    // useForceReadAtBottom отправил markRead → server → tg:chat-unread-sync с 0
    act(() => {
      onHandlers['tg:chat-unread-sync']?.({ chatId: 'chat1', unreadCount: 0 })
    })
    // Только теперь counter становится 0 — через правильный путь
    expect(result.current.chats.find(c => c.id === 'chat1').unreadCount).toBe(0)
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

  it('v0.95.14: jump-to-end — aroundId=lastMessageId + addOffset=-50 (context-window)', async () => {
    // Сага v0.95.12→14 (см. .memory-bank/jump-to-end-saga.md):
    // - v0.95.12: aroundId=lastMessageId, offset=0 → TDLib грузил СТРОГО СТАРШЕ X (баг spec)
    // - v0.95.13: aroundId=0 → TDLib подменял на last_read_inbox_message_id (issue #740)
    // - v0.95.14: aroundId=lastMessageId + addOffset=-50 → context-window (как tdesktop)
    // По TDLib spec: «negative offset → additionally newer messages».
    // from=X, offset=-50, limit=100 → 50 newer + X + 49 older = X включён.
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-messages') return Promise.resolve({ ok: true, messages: [] })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{
          id: 'chat1', accountId: 'acc1', title: 'T',
          unreadCount: 724, readInboxMaxId: 1000, lastMessageId: '9999',
        }],
      })
    })

    await act(async () => {
      // aroundId=lastMessageId явно + addOffset=-50 → context-window вокруг X.
      await result.current.loadMessages('chat1', 100, {
        aroundId: '9999', addOffset: -50, force: true,
      })
    })

    // КОНТРАКТ: aroundId=9999 (явно, не 0 — TDLib не подменит), addOffset=-50 (context-window).
    expect(invokeMock).toHaveBeenCalledWith('tg:get-messages', {
      chatId: 'chat1',
      limit: 100,
      aroundId: 9999,
      addOffset: -50,
    })
  })

  it('v0.95.16: loadTopicMessagesUntil → IPC tg:get-topic-messages-iterate (jump-to-end для форум-топиков)', async () => {
    // Зеркало loadMessagesUntil для топиков. См. .memory-bank/jump-to-end-saga.md.
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-topic-messages-iterate') return Promise.resolve({
        ok: true, iterations: 2, messages: [],
      })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Forum', isForum: true, unreadCount: 0 }],
      })
    })

    const topic = {
      id: '5', topicId: '5', topMessageId: '5',
      threadMessageId: '123',
      title: 'Bugs',
      isGeneral: false,
      unreadCount: 1000,
      readInboxMaxId: 100,
      lastMessageId: '9999',
    }

    await act(async () => {
      await result.current.loadTopicMessagesUntil('chat1', topic, '9999', 100)
    })

    // КОНТРАКТ: tg:get-topic-messages-iterate с правильными параметрами
    expect(invokeMock).toHaveBeenCalledWith('tg:get-topic-messages-iterate', {
      chatId: 'chat1',
      topicId: '5',
      threadMessageId: '123',
      isGeneral: false,
      untilMessageId: '9999',
      targetCount: 100,
      maxIterations: 5,
    })
  })

  it('v0.95.15: loadMessagesUntil → IPC tg:get-messages-iterate с untilMessageId+targetCount', async () => {
    // TDLib не гарантирует limit в одном invoke (issue #740). Iterative fetch.
    // См. .memory-bank/jump-to-end-saga.md — почему НЕ работают одиночные invokes.
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-messages-iterate') return Promise.resolve({
        ok: true, iterations: 2, messages: [],
      })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 1000, lastMessageId: '9999' }],
      })
    })

    await act(async () => {
      await result.current.loadMessagesUntil('chat1', '9999', 100)
    })

    // КОНТРАКТ: вызов tg:get-messages-iterate с untilMessageId, targetCount, maxIterations
    expect(invokeMock).toHaveBeenCalledWith('tg:get-messages-iterate', {
      chatId: 'chat1',
      untilMessageId: '9999',
      targetCount: 100,
      maxIterations: 5,
    })
  })

  it('v0.95.14: backward compat — aroundId=0 без addOffset → addOffset=0 (старое поведение v0.95.13)', async () => {
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-messages') return Promise.resolve({ ok: true, messages: [] })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{
          id: 'chat1', accountId: 'acc1', title: 'T',
          unreadCount: 0, readInboxMaxId: 0,
        }],
      })
    })

    await act(async () => {
      await result.current.loadMessages('chat1', 100, { aroundId: 0, force: true })
    })

    // Без addOffset → 0 (старое поведение). Override работает (aroundId=0, не readInboxMaxId).
    expect(invokeMock).toHaveBeenCalledWith('tg:get-messages', {
      chatId: 'chat1',
      limit: 100,
      aroundId: 0,
      addOffset: 0,
    })
  })

  it('v0.95.12: loadMessages БЕЗ options.aroundId — старое поведение (unread окно)', async () => {
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-messages') return Promise.resolve({ ok: true, messages: [] })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{
          id: 'chat1', accountId: 'acc1', title: 'T',
          unreadCount: 76, readInboxMaxId: 1000, lastMessageId: '9999',
        }],
      })
    })

    await act(async () => {
      await result.current.loadMessages('chat1')  // без options
    })

    // Без options: aroundId = readInboxMaxId (старое поведение), addOffset=-90 (unread-окно)
    expect(invokeMock).toHaveBeenCalledWith('tg:get-messages', {
      chatId: 'chat1',
      limit: 100,
      aroundId: 1000,
      addOffset: -90,
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

// v0.89.37 (Решение 2): race protection при быстром переключении топиков.
// Когда юзер кликает A → B быстро, оба invoke в полёте. Если ответ A пришёл
// ПОСЛЕ того как активный стал B — старый ответ должен быть проигнорирован.
describe('v0.89.37: selectForumTopic race protection (Discord-style)', () => {
  it('второй selectForumTopic для того же chatId игнорирует ответ первого', async () => {
    const topicA = { id: '100', topicId: '100', topMessageId: '100', threadMessageId: '500',
      title: 'OZON', unreadCount: 0, readInboxMaxId: 500 }
    const topicB = { id: '200', topicId: '200', topMessageId: '200', threadMessageId: '900',
      title: 'B2B', unreadCount: 0, readInboxMaxId: 900 }
    const keyA = 'chat1:topic:100'
    const keyB = 'chat1:topic:200'
    // Контроль над resolve invoke: первый держим в полёте, второй резолвим сразу.
    let resolveA = null
    invokeMock.mockImplementation((channel, params) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-forum-topics') return Promise.resolve({ ok: true, isForum: true, topics: [topicA, topicB] })
      if (channel === 'tg:get-topic-messages') {
        if (params.topicId === '100') {
          return new Promise((res) => { resolveA = () => res({ ok: true,
            messages: [{ id: '1A', isOutgoing: false }, { id: '2A', isOutgoing: false }] }) })
        }
        return Promise.resolve({ ok: true, messages: [{ id: '1B', isOutgoing: false }] })
      }
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => { onHandlers['tg:chats']?.({ accountId: 'a1',
      chats: [{ id: 'chat1', accountId: 'a1', title: 'F', unreadCount: 0, type: 'group' }] }) })
    await act(async () => { await result.current.loadForumTopics('chat1') })

    // Кликаем A — invoke A в полёте
    let promiseA
    await act(async () => { promiseA = result.current.selectForumTopic('chat1', topicA) })
    // Кликаем B — invoke B сразу резолвится с 1 сообщением
    await act(async () => { await result.current.selectForumTopic('chat1', topicB) })
    expect(result.current.messages[keyB]?.length).toBe(1)

    // Теперь резолвим ответ A (уже устаревший)
    await act(async () => { resolveA(); await promiseA })

    // ВАЖНО: messages[keyA] НЕ должен быть обновлён (race protection отбросил stale)
    expect(result.current.messages[keyA]).toBeUndefined()
    // messages[keyB] не затёрты
    expect(result.current.messages[keyB]?.length).toBe(1)
  })
})
