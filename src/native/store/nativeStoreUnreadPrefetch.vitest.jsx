// v0.88.0..v0.88.2: интеграционные vitest-тесты для автодогрузки непрочитанных вниз
// (Telegram-style infinite scroll down). Вынесено из nativeStore.vitest.jsx — основной
// файл подходил к лимиту 400 строк (правило fileSizeLimits для тестов).
//
// Покрывает:
//  - store.loadNewerMessages: вызов IPC с afterId, маршрутизация на topic-IPC для тем,
//    throttle 300мс, отказ при отсутствии afterId;
//  - tg:messages listener с appendNewer: дедуп, отсутствие лишнего setState при пустом
//    либо «только-дубликат» массиве (фикс «дёрга» окна из v0.88.1);
//  - unreadWindowRequestParams: лимит окна = 100 (потолок Telegram API),
//    умный addOffset (-0.9*limit для unread>30, -limit/4 для маленьких unread).

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

// v0.88.0: автодогрузка новых сообщений вниз (Telegram-style infinite scroll down).
// MTProto messages.getHistory имеет лимит 100 за запрос — пачки идут по 100.
// Throttle 300мс per-key защищает от FLOOD_WAIT при быстром скролле.
describe('v0.88.0: loadNewerMessages — Telegram-style infinite scroll down', () => {
  it('loadNewerMessages вызывает tg:get-messages с afterId и лимитом 100', async () => {
    const { result } = renderHook(() => useNativeStore())
    invokeMock.mockClear()
    await act(async () => {
      await result.current.loadNewerMessages('chat1', 5000, 100)
    })
    expect(invokeMock).toHaveBeenCalledWith('tg:get-messages', {
      chatId: 'chat1',
      limit: 100,
      afterId: 5000,
    })
  })

  it('loadNewerMessages для активной форум-темы использует tg:get-topic-messages', async () => {
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-forum-topics') return Promise.resolve({
        ok: true, isForum: true,
        topics: [{ id: '10', topicId: '10', topMessageId: '10', title: 'T', unreadCount: 5 }],
      })
      if (channel === 'tg:get-topic-messages') return Promise.resolve({ ok: true, messages: [] })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Forum', unreadCount: 5, type: 'group' }],
      })
    })
    await act(async () => {
      await result.current.loadForumTopics('chat1')
    })
    const topic = result.current.forumTopics.chat1[0]
    await act(async () => {
      await result.current.selectForumTopic('chat1', topic)
    })
    invokeMock.mockClear()
    await act(async () => {
      await result.current.loadNewerMessages('chat1', 12345, 100)
    })
    expect(invokeMock).toHaveBeenCalledWith('tg:get-topic-messages', expect.objectContaining({
      chatId: 'chat1',
      topicId: '10',
      afterId: 12345,
      limit: 100,
    }))
  })

  it('loadNewerMessages блокирует повторный запрос в течение 300мс (throttle)', async () => {
    const { result } = renderHook(() => useNativeStore())
    invokeMock.mockClear()
    await act(async () => {
      await result.current.loadNewerMessages('chat1', 100, 100)
    })
    const r2 = await result.current.loadNewerMessages('chat1', 200, 100)
    expect(r2).toEqual({ ok: false, throttled: true })
    const newerCalls = invokeMock.mock.calls.filter(c => c[0] === 'tg:get-messages')
    expect(newerCalls.length).toBe(1)
  })

  it('loadNewerMessages возвращает ok:false без afterId', async () => {
    const { result } = renderHook(() => useNativeStore())
    const r = await result.current.loadNewerMessages('chat1', 0, 100)
    expect(r.ok).toBe(false)
  })

  it('tg:messages с appendNewer:true добавляет сообщения в конец с дедупом', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:messages']?.({
        chatId: 'chat1',
        messages: [{ id: '100' }, { id: '101' }],
        append: false,
      })
    })
    expect(result.current.messages.chat1.map(m => m.id)).toEqual(['100', '101'])
    act(() => {
      onHandlers['tg:messages']?.({
        chatId: 'chat1',
        messages: [{ id: '101' }, { id: '102' }, { id: '103' }],  // 101 дубль
        appendNewer: true,
      })
    })
    expect(result.current.messages.chat1.map(m => m.id)).toEqual(['100', '101', '102', '103'])
  })

  it('v0.88.1: appendNewer с пустым массивом НЕ создаёт новый массив (избегаем дёрга UI)', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:messages']?.({
        chatId: 'chat1',
        messages: [{ id: '100' }, { id: '101' }],
        append: false,
      })
    })
    const refBefore = result.current.messages.chat1
    act(() => {
      onHandlers['tg:messages']?.({
        chatId: 'chat1',
        messages: [],
        appendNewer: true,
      })
    })
    // КЛЮЧЕВОЕ: ссылка на массив должна остаться той же — иначе React сделает лишний рендер
    // и пользователь видит «дёрг» окна, как было в баге v0.88.0.
    expect(result.current.messages.chat1).toBe(refBefore)
    expect(result.current.messages.chat1.map(m => m.id)).toEqual(['100', '101'])
  })

  it('v0.88.1: appendNewer с только-дубликатами НЕ создаёт новый массив', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:messages']?.({
        chatId: 'chat1',
        messages: [{ id: '100' }, { id: '101' }],
        append: false,
      })
    })
    const refBefore = result.current.messages.chat1
    act(() => {
      onHandlers['tg:messages']?.({
        chatId: 'chat1',
        messages: [{ id: '100' }, { id: '101' }],  // только дубликаты
        appendNewer: true,
      })
    })
    expect(result.current.messages.chat1).toBe(refBefore)
  })
})

// v0.88.0: лимит окна unread = 100 (жёсткий потолок Telegram API),
// плюс умный addOffset для большого числа непрочитанных.
describe('v0.88.0: unreadWindowRequestParams — Telegram API ceiling 100', () => {
  it('загрузка чата с unread=2000 запрашивает limit=100 (не 500)', async () => {
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-messages') return Promise.resolve({ ok: true, messages: [] })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Big', unreadCount: 2000, readInboxMaxId: 5000 }],
      })
    })
    invokeMock.mockClear()
    await act(async () => {
      await result.current.loadMessages('chat1')
    })
    // limit=100 (потолок API), addOffset для unread>30 = -0.9*limit = -90
    expect(invokeMock).toHaveBeenCalledWith('tg:get-messages', expect.objectContaining({
      chatId: 'chat1',
      limit: 100,
      aroundId: 5000,
      addOffset: -90,
    }))
  })

  it('маленький unread (5) сохраняет контекст — addOffset = -limit/4', async () => {
    invokeMock.mockImplementation((channel) => {
      if (channel === 'tg:get-accounts') return Promise.resolve({ ok: true, accounts: [] })
      if (channel === 'tg:get-messages') return Promise.resolve({ ok: true, messages: [] })
      return Promise.resolve({ ok: true })
    })
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Small', unreadCount: 5, readInboxMaxId: 5000 }],
      })
    })
    invokeMock.mockClear()
    await act(async () => {
      await result.current.loadMessages('chat1', 50)
    })
    // unread=5 ≤ 30 → addOffset = -Math.floor(50/4) = -12, limit берётся базовый 50
    expect(invokeMock).toHaveBeenCalledWith('tg:get-messages', expect.objectContaining({
      chatId: 'chat1',
      limit: 50,
      aroundId: 5000,
      addOffset: -12,
    }))
  })
})
