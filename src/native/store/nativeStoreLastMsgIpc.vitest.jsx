// v1.2.133: путь tg:chat-last-message (вынесен в nativeStoreLastMsgIpc.js, TODO-14).
// Главное — фикс залипания имени автора (ADR-022): при смене последнего сообщения
// (напр. удалении) имя автора в превью должно пересчитаться, а не остаться старым.
// Тестируем через ПУБЛИЧНЫЙ attachTelegramIpcListeners (внешний контракт не менялся).

import { describe, it, expect, vi } from 'vitest'
import { attachTelegramIpcListeners } from './nativeStoreIpc.js'

function setup(initial) {
  const handlers = {}
  let state = initial
  globalThis.window = {
    api: {
      on: (ch, fn) => { handlers[ch] = fn; return () => {} },
      invoke: vi.fn(() => Promise.resolve({ ok: true })),
      send: vi.fn(),
    },
  }
  // flushPendingLastMsg использует requestAnimationFrame — делаем синхронным для теста.
  globalThis.requestAnimationFrame = (cb) => { cb(); return 0 }
  const setState = (u) => { state = typeof u === 'function' ? u(state) : u }
  const stateRef = { get current() { return state } }
  attachTelegramIpcListeners({ setState, stateRef })
  return {
    fire: (ch, payload) => handlers[ch] && handlers[ch](payload),
    get: () => state,
  }
}

const groupChat = (over = {}) => ({
  id: 'a:c1', accountId: 'a', type: 'group', title: 'Двач',
  lastMessage: 'старое', lastMessageTs: 1000, lastMessageSenderName: '', ...over,
})

describe('tg:chat-last-message — превью + имя автора', () => {
  it('группа + входящее → текст и имя обновляются', () => {
    const { fire, get } = setup({ chats: [groupChat()], messages: {} })
    fire('tg:chat-last-message', { chatId: 'a:c1', lastMessage: 'привет', lastMessageTs: 2000, senderName: 'Мария', isOutgoing: false })
    const c = get().chats[0]
    expect(c.lastMessage).toBe('привет')
    expect(c.lastMessageSenderName).toBe('Мария')
  })

  it('ФИКС ЗАЛИПАНИЯ: имя автора меняется при смене последнего сообщения', () => {
    // Было последнее от Марии; последнее сменилось на сообщение Петра (напр. Мария удалила своё).
    const { fire, get } = setup({ chats: [groupChat({ lastMessageSenderName: 'Мария' })], messages: {} })
    fire('tg:chat-last-message', { chatId: 'a:c1', lastMessage: 'как дела', lastMessageTs: 2000, senderName: 'Пётр', isOutgoing: false })
    const c = get().chats[0]
    expect(c.lastMessage).toBe('как дела')
    expect(c.lastMessageSenderName).toBe('Пётр')          // не осталось «Мария»
    expect(c.lastMessageSenderName).not.toBe('Мария')
  })

  it('группа + исходящее → «Вы»', () => {
    const { fire, get } = setup({ chats: [groupChat()], messages: {} })
    fire('tg:chat-last-message', { chatId: 'a:c1', lastMessage: 'ок', lastMessageTs: 2000, senderName: 'Я', isOutgoing: true })
    expect(get().chats[0].lastMessageSenderName).toBe('Вы')
  })

  it('канал → без имени (даже если senderName пришёл)', () => {
    const { fire, get } = setup({ chats: [groupChat({ type: 'channel' })], messages: {} })
    fire('tg:chat-last-message', { chatId: 'a:c1', lastMessage: 'пост', lastMessageTs: 2000, senderName: 'Канал', isOutgoing: false })
    expect(get().chats[0].lastMessageSenderName).toBe('')
  })

  it('pending: событие пришло ДО чата в state → имя применяется на tg:chats', () => {
    const { fire, get } = setup({ chats: [], messages: {} })
    // Чата ещё нет — уходит в pending-очередь.
    fire('tg:chat-last-message', { chatId: 'a:c1', lastMessage: 'привет', lastMessageTs: 2000, senderName: 'Мария', isOutgoing: false })
    // Чат появляется — pending применяется.
    fire('tg:chats', { accountId: 'a', append: true, chats: [groupChat({ lastMessage: 'заглушка', lastMessageTs: 1000 })] })
    const c = get().chats.find(x => x.id === 'a:c1')
    expect(c.lastMessage).toBe('привет')
    expect(c.lastMessageSenderName).toBe('Мария')
  })
})
