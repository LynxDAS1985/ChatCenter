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
