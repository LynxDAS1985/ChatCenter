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
    expect(invokeMock).toHaveBeenCalledWith('tg:mark-read', { chatId: 'chat1', maxId: 3797 })
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
})

// v0.87.45: handler tg:grouped-unread — карточки (альбомы = 1) приходят параллельным batch.
describe('v0.87.45: tg:grouped-unread handler', () => {
  it('обновляет chat.groupedUnread по updates от сервера', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [
          { id: 'chat1', accountId: 'acc1', title: 'A', unreadCount: 9 },
          { id: 'chat2', accountId: 'acc1', title: 'B', unreadCount: 3 },
        ],
      })
    })
    act(() => {
      onHandlers['tg:grouped-unread']?.({
        accountId: 'acc1',
        updates: {
          chat1: { server: 9, grouped: 1 },  // альбом из 9 фото = 1 карточка
          chat2: { server: 3, grouped: 3 },  // 3 отдельных msgs = 3 карточки
        },
      })
    })
    const c1 = result.current.chats.find(c => c.id === 'chat1')
    const c2 = result.current.chats.find(c => c.id === 'chat2')
    expect(c1.groupedUnread).toBe(1)
    expect(c1.unreadCount).toBe(9)
    expect(c2.groupedUnread).toBe(3)
    expect(c2.unreadCount).toBe(3)
  })

  it('чаты без update остаются без groupedUnread (не затирает)', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [
          { id: 'chat1', accountId: 'acc1', title: 'A', unreadCount: 5 },
          { id: 'chat2', accountId: 'acc1', title: 'B', unreadCount: 0 },
        ],
      })
    })
    act(() => {
      onHandlers['tg:grouped-unread']?.({
        accountId: 'acc1',
        updates: { chat1: { server: 5, grouped: 2 } },
      })
    })
    const c1 = result.current.chats.find(c => c.id === 'chat1')
    const c2 = result.current.chats.find(c => c.id === 'chat2')
    expect(c1.groupedUnread).toBe(2)
    expect(c2.groupedUnread).toBeUndefined()  // нет апдейта — не затираем
  })

  it('recomputeGroupedUnread() вызывает IPC tg:recompute-grouped-unread', async () => {
    const { result } = renderHook(() => useNativeStore())
    await act(async () => { await result.current.recomputeGroupedUnread() })
    expect(invokeMock).toHaveBeenCalledWith('tg:recompute-grouped-unread', {})
  })

  it('повторный updates перезаписывает grouped — альбом расширился до 2 групп', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'A', unreadCount: 9 }],
      })
    })
    act(() => {
      onHandlers['tg:grouped-unread']?.({
        accountId: 'acc1',
        updates: { chat1: { server: 9, grouped: 1 } },
      })
    })
    expect(result.current.chats.find(c => c.id === 'chat1').groupedUnread).toBe(1)
    // Пришло ещё 6 одиночных сообщений — теперь 2 альбома = 2 группы?
    act(() => {
      onHandlers['tg:grouped-unread']?.({
        accountId: 'acc1',
        updates: { chat1: { server: 15, grouped: 7 } },
      })
    })
    const c1 = result.current.chats.find(c => c.id === 'chat1')
    expect(c1.groupedUnread).toBe(7)
    expect(c1.unreadCount).toBe(15)
  })
})

// v0.87.50: clamp groupedUnread по unreadCount в sync-handlers.
// Баг v0.87.49: сервер возвращал unread=0 после markRead, но chat.groupedUnread
// оставался от прошлого recompute (23). Бейдж показывал 23 вместо 0.
describe('v0.87.50: clamp groupedUnread в unread-sync handlers', () => {
  it('⭐ РЕГРЕССИЯ: tg:chat-unread-sync с unread=0 → groupedUnread тоже 0', () => {
    const { result } = renderHook(() => useNativeStore())
    // Подготовка: чат с grouped=23 (прошлый recompute)
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'Geely', unreadCount: 23 }],
      })
    })
    act(() => {
      onHandlers['tg:grouped-unread']?.({
        accountId: 'acc1',
        updates: { chat1: { server: 23, grouped: 23 } },
      })
    })
    expect(result.current.chats.find(c => c.id === 'chat1').groupedUnread).toBe(23)
    // Юзер долистал → сервер вернул unread=0
    act(() => {
      onHandlers['tg:chat-unread-sync']?.({ chatId: 'chat1', unreadCount: 0 })
    })
    const c = result.current.chats.find(c => c.id === 'chat1')
    expect(c.unreadCount).toBe(0)
    expect(c.groupedUnread).toBe(0)  // ← КЛЮЧЕВОЕ: до фикса было 23
  })

  it('tg:chat-unread-sync с unread=5 < grouped=9 → grouped clamp до 5', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 9 }],
      })
    })
    act(() => {
      onHandlers['tg:grouped-unread']?.({
        accountId: 'acc1',
        updates: { chat1: { server: 9, grouped: 9 } },
      })
    })
    act(() => {
      onHandlers['tg:chat-unread-sync']?.({ chatId: 'chat1', unreadCount: 5 })
    })
    const c = result.current.chats.find(c => c.id === 'chat1')
    expect(c.unreadCount).toBe(5)
    expect(c.groupedUnread).toBe(5)  // clamp: grouped не может быть больше unread
  })

  it('tg:chat-unread-sync с unread=10 > grouped=3 → grouped не трогаем', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 9 }],
      })
    })
    act(() => {
      onHandlers['tg:grouped-unread']?.({
        accountId: 'acc1',
        updates: { chat1: { server: 9, grouped: 3 } },  // альбом=1 карточка
      })
    })
    // Пришло ещё msgs — сервер говорит unread=10, но grouped (3) уже < 10
    act(() => {
      onHandlers['tg:chat-unread-sync']?.({ chatId: 'chat1', unreadCount: 10 })
    })
    const c = result.current.chats.find(c => c.id === 'chat1')
    expect(c.unreadCount).toBe(10)
    expect(c.groupedUnread).toBe(3)  // grouped НЕ увеличиваем (ждём следующий recompute)
  })

  it('tg:unread-bulk-sync clamp — несколько чатов за раз', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [
          { id: 'c1', accountId: 'acc1', title: 'A', unreadCount: 23 },
          { id: 'c2', accountId: 'acc1', title: 'B', unreadCount: 5 },
        ],
      })
    })
    act(() => {
      onHandlers['tg:grouped-unread']?.({
        accountId: 'acc1',
        updates: {
          c1: { server: 23, grouped: 23 },
          c2: { server: 5, grouped: 5 },
        },
      })
    })
    // Bulk sync от периодического rescan: оба стали 0
    act(() => {
      onHandlers['tg:unread-bulk-sync']?.({
        updates: [
          { id: 'c1', unreadCount: 0 },
          { id: 'c2', unreadCount: 0 },
        ],
      })
    })
    expect(result.current.chats.find(c => c.id === 'c1').groupedUnread).toBe(0)
    expect(result.current.chats.find(c => c.id === 'c2').groupedUnread).toBe(0)
  })

  it('если groupedUnread был undefined — sync его НЕ создаёт (оставляем undefined)', () => {
    const { result } = renderHook(() => useNativeStore())
    act(() => {
      onHandlers['tg:chats']?.({
        accountId: 'acc1',
        chats: [{ id: 'chat1', accountId: 'acc1', title: 'T', unreadCount: 5 }],
        // groupedUnread НЕ задан — ещё не было recompute
      })
    })
    act(() => {
      onHandlers['tg:chat-unread-sync']?.({ chatId: 'chat1', unreadCount: 3 })
    })
    const c = result.current.chats.find(c => c.id === 'chat1')
    expect(c.unreadCount).toBe(3)
    expect(c.groupedUnread).toBeUndefined()
  })
})
