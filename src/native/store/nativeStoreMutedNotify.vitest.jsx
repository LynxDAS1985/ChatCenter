// v1.2.12: фикс muted-уведомлений в native Telegram.
// Юзер заглушил чат (🔕 в Telegram), `chat.isMuted=true` в state, но раньше
// handler `tg:new-message` всё равно звал `app:custom-notify`. Тест защищает
// от регрессии: при isMuted=true ribbon НЕ показывается, при false — да.
// Счётчик unread / state — не зависят от isMuted (поведение Telegram Desktop).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { attachTelegramIpcListeners } from './nativeStoreIpc.js'

function setup(initial) {
  const handlers = {}
  let state = initial
  const invokeMock = vi.fn(() => Promise.resolve({ ok: true }))
  const sendMock = vi.fn()
  globalThis.window = {
    api: {
      on: (ch, fn) => { handlers[ch] = fn; return () => {} },
      invoke: invokeMock,
      send: sendMock,
    },
  }
  const setState = (u) => { state = typeof u === 'function' ? u(state) : u }
  const stateRef = { get current() { return state } }
  attachTelegramIpcListeners({ setState, stateRef })
  return {
    fire: (ch, payload) => handlers[ch] && handlers[ch](payload),
    get: () => state,
    invokeMock,
    sendMock,
  }
}

function newMsg(extra = {}) {
  return {
    id: '500',
    isOutgoing: false,
    timestamp: 1000,
    text: 'hello',
    senderName: 'Alice',
    ...extra,
  }
}

describe('tg:new-message — muted чат (v1.2.12 регрессия)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('isMuted=true → app:custom-notify НЕ вызывается', () => {
    const { fire, invokeMock } = setup({
      messages: {},
      chats: [{ id: 'c1', title: 'Двач', unreadCount: 0, isMuted: true }],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: newMsg() })
    const notifyCalls = invokeMock.mock.calls.filter(c => c[0] === 'app:custom-notify')
    expect(notifyCalls).toHaveLength(0)
  })

  it('isMuted=false → app:custom-notify вызывается', () => {
    const { fire, invokeMock } = setup({
      messages: {},
      chats: [{ id: 'c1', title: 'Двач', unreadCount: 0, isMuted: false }],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: newMsg() })
    const notifyCalls = invokeMock.mock.calls.filter(c => c[0] === 'app:custom-notify')
    expect(notifyCalls).toHaveLength(1)
    expect(notifyCalls[0][1].title).toBe('Двач')
  })

  it('isMuted=true → unreadCount всё равно растёт (поведение Telegram Desktop)', () => {
    const { fire, get } = setup({
      messages: {},
      chats: [{ id: 'c1', title: 'Двач', unreadCount: 10, isMuted: true }],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: newMsg() })
    expect(get().chats[0].unreadCount).toBe(11)
  })

  it('isMuted=undefined (старый кэш без поля) → ribbon показывается (безопасный fallback)', () => {
    const { fire, invokeMock } = setup({
      messages: {},
      chats: [{ id: 'c1', title: 'Двач', unreadCount: 0 }], // isMuted нет
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: newMsg() })
    const notifyCalls = invokeMock.mock.calls.filter(c => c[0] === 'app:custom-notify')
    expect(notifyCalls).toHaveLength(1)
  })

  it('chat=undefined (race) → ribbon показывается (безопасный fallback)', () => {
    const { fire, invokeMock } = setup({
      messages: {},
      chats: [],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'unknown', message: newMsg() })
    const notifyCalls = invokeMock.mock.calls.filter(c => c[0] === 'app:custom-notify')
    expect(notifyCalls).toHaveLength(1)
  })

  it('isMuted=true → в app:log записан skip muted (для прозрачности)', () => {
    const { fire, sendMock } = setup({
      messages: {},
      chats: [{ id: 'c1', title: 'Двач', unreadCount: 0, isMuted: true }],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: newMsg() })
    const logCalls = sendMock.mock.calls.filter(
      c => c[0] === 'app:log' && c[1]?.message?.includes('skip muted')
    )
    expect(logCalls).toHaveLength(1)
  })

  it('isMuted=true + активный чат → ribbon не вызывается (двойной фильтр)', () => {
    const { fire, invokeMock } = setup({
      messages: {},
      chats: [{ id: 'c1', title: 'Двач', unreadCount: 0, isMuted: true }],
      activeChatId: 'c1',
    })
    fire('tg:new-message', { chatId: 'c1', message: newMsg() })
    const notifyCalls = invokeMock.mock.calls.filter(c => c[0] === 'app:custom-notify')
    expect(notifyCalls).toHaveLength(0)
  })
})
