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
    timestamp: Date.now(), // v1.2.312: живое сообщение = свежая дата (старое считается offline-бэклогом и всплывашкой не показывается)
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
    // v1.2.132: заголовок карточки = имя АВТОРА сообщения (в группе — не название чата).
    // newMsg() даёт senderName:'Alice'. Это ПРЯМАЯ проверка живого кода title (nativeStoreIpc emit).
    expect(notifyCalls[0][1].title).toBe('Alice')
  })

  it('senderName пуст → заголовок = название чата (fallback новой логики)', () => {
    const { fire, invokeMock } = setup({
      messages: {},
      chats: [{ id: 'c1', title: 'Двач', unreadCount: 0, isMuted: false }],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: newMsg({ senderName: '' }) })
    const notifyCalls = invokeMock.mock.calls.filter(c => c[0] === 'app:custom-notify')
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

  it('старое сообщение (offline-бэклог до старта) → ribbon НЕ вызывается, но счётчик растёт + лог skip backlog (v1.2.312)', () => {
    const { fire, invokeMock, sendMock, get } = setup({
      messages: {},
      chats: [{ id: 'c1', title: 'Двач', unreadCount: 0, isMuted: false }],
      activeChatId: null,
    })
    // дата отправки на минуту раньше старта модуля (NOTIFY_ARM_TS) → offline-бэклог
    fire('tg:new-message', { chatId: 'c1', message: newMsg({ timestamp: Date.now() - 60000 }) })
    const notifyCalls = invokeMock.mock.calls.filter(c => c[0] === 'app:custom-notify')
    expect(notifyCalls).toHaveLength(0) // всплывашки нет — старьё при старте не заваливает
    const backlogLog = sendMock.mock.calls.filter(c => c[0] === 'app:log' && c[1]?.message?.includes('skip backlog'))
    expect(backlogLog).toHaveLength(1) // но факт зафиксирован в журнале (детектор завала)
    expect(get().chats[0].unreadCount).toBe(1) // счётчик непрочитанного растёт даже для бэклога
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
