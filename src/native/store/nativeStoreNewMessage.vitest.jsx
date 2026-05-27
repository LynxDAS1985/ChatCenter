// v0.95.0: тесты «список всегда непрерывный» — tg:new-message не вклеивает свежее
// сообщение, если оно далеко за концом загруженного окна (разрыв). Иначе массив рвётся
// → каскад markRead / застрявший счётчик непрочитанных (см. mistakes/native-scroll-unread.md).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { attachTelegramIpcListeners } from './nativeStoreIpc.js'

const STEP = 1048576 // TDLib message_id = server_id << 20

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
  const setState = (u) => { state = typeof u === 'function' ? u(state) : u }
  const stateRef = { get current() { return state } }
  attachTelegramIpcListeners({ setState, stateRef })
  return {
    fire: (ch, payload) => handlers[ch] && handlers[ch](payload),
    get: () => state,
  }
}

describe('tg:new-message — список всегда непрерывный (v0.95.0)', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('соседнее сообщение (у низа) — вклеивается', () => {
    const base = 111860000000
    const { fire, get } = setup({
      messages: { c1: [{ id: String(base), isOutgoing: false, text: 'old' }] },
      chats: [{ id: 'c1', unreadCount: 5 }],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: { id: String(base + STEP), isOutgoing: false, timestamp: 2, text: 'next' } })
    expect(get().messages.c1.map(m => m.id)).toEqual([String(base), String(base + STEP)])
    expect(get().chats[0].unreadCount).toBe(6)
  })

  it('далёкое сообщение (разрыв > ~200 сообщений) — НЕ вклеивается, но бейдж/превью обновляются', () => {
    const base = 111860000000
    const farId = base + 1100 * STEP // ~1100 сообщений вперёд — разрыв
    const { fire, get } = setup({
      messages: { c1: [{ id: String(base), isOutgoing: false, text: 'old' }] },
      chats: [{ id: 'c1', unreadCount: 1000, lastMessage: 'old' }],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: { id: String(farId), isOutgoing: false, timestamp: 3, text: 'far' } })
    // массив не тронут (разрыв не создаётся)
    expect(get().messages.c1.map(m => m.id)).toEqual([String(base)])
    // но превью и бейдж непрочитанных обновлены
    expect(get().chats[0].lastMessage).toBe('far')
    expect(get().chats[0].unreadCount).toBe(1001)
  })

  it('пустой чат — первое сообщение засевает массив', () => {
    const { fire, get } = setup({
      messages: {},
      chats: [{ id: 'c1', unreadCount: 0 }],
      activeChatId: null,
    })
    fire('tg:new-message', { chatId: 'c1', message: { id: '500', isOutgoing: false, timestamp: 1, text: 'first' } })
    expect(get().messages.c1.map(m => m.id)).toEqual(['500'])
  })

  it('дубликат — обновляется на месте, не дублируется', () => {
    const base = 111860000000
    const { fire, get } = setup({
      messages: { c1: [{ id: String(base), isOutgoing: false, text: 'old' }] },
      chats: [{ id: 'c1', unreadCount: 0 }],
      activeChatId: 'c1',
    })
    fire('tg:new-message', { chatId: 'c1', message: { id: String(base), isOutgoing: false, timestamp: 1, text: 'updated' } })
    expect(get().messages.c1.length).toBe(1)
    expect(get().messages.c1[0].text).toBe('updated')
  })
})
