// v0.87.30: Smoke-тест рендера InboxMode — ловит TDZ/ReferenceError, ошибки порядка hooks,
// сломанные импорты компонентов. Рендерит с разными состояниями store.
// Если есть runtime-ошибка (типа "Cannot access 'X' before initialization") — тест упадёт.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import InboxMode from './InboxMode.jsx'

// Mock window.api (IPC) — happy-dom не даёт Electron preload
beforeEach(() => {
  globalThis.window.api = {
    invoke: vi.fn(() => Promise.resolve({ ok: true })),
    on: vi.fn(() => () => {}),
    send: vi.fn(),
  }
  // IntersectionObserver / ResizeObserver нет в happy-dom
  globalThis.IntersectionObserver = class {
    observe() {}; disconnect() {}; unobserve() {}
  }
  globalThis.ResizeObserver = class {
    observe() {}; disconnect() {}; unobserve() {}
  }
})

function buildStore(overrides = {}) {
  return {
    mode: 'inbox',
    accounts: [],
    activeAccountId: null,
    chats: [],
    activeChatId: null,
    messages: {},
    typing: {},
    loginFlow: null,
    loadChats: vi.fn(), loadCachedChats: vi.fn(), loadMessages: vi.fn(),
    loadOlderMessages: vi.fn(), sendMessage: vi.fn(), sendFile: vi.fn(),
    deleteMessage: vi.fn(), editMessage: vi.fn(), forwardMessage: vi.fn(),
    pinMessage: vi.fn(), getPinnedMessage: vi.fn(() => Promise.resolve({ ok: false })),
    refreshAvatar: vi.fn(), rescanUnread: vi.fn(), setTyping: vi.fn(),
    markRead: vi.fn(), downloadMedia: vi.fn(() => Promise.resolve({ ok: false })),
    setActiveChat: vi.fn(), setActiveAccount: vi.fn(), setMode: vi.fn(),
    ...overrides,
  }
}

describe('InboxMode render smoke', () => {
  it('рендерится без активного чата (пустое состояние)', () => {
    const store = buildStore()
    expect(() => render(<InboxMode store={store} />)).not.toThrow()
    cleanup()
  })

  it('рендерится со списком чатов (194 чата)', () => {
    const chats = Array.from({ length: 194 }, (_, i) => ({
      id: `tg_self:${i}`, accountId: 'tg_self', title: `Чат ${i}`,
      lastMessage: 'hello', lastMessageTs: Date.now() - i * 1000,
      unreadCount: i % 5, type: 'user',
    }))
    const store = buildStore({ activeAccountId: 'tg_self', chats })
    expect(() => render(<InboxMode store={store} />)).not.toThrow()
    cleanup()
  })

  it('рендерится с активным чатом и сообщениями', () => {
    const chatId = 'tg_self:1'
    const messages = [
      { id: '1', chatId, senderId: '1', text: 'Первое', timestamp: Date.now() - 60000, isOutgoing: false },
      { id: '2', chatId, senderId: 'me', text: 'Ответ', timestamp: Date.now() - 30000, isOutgoing: true },
      { id: '3', chatId, senderId: '1', text: 'Ещё', timestamp: Date.now(), isOutgoing: false },
    ]
    const store = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'Test', unreadCount: 0, type: 'user' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
    })
    expect(() => render(<InboxMode store={store} />)).not.toThrow()
    cleanup()
  })

  it('рендерится с непрочитанными + first-unread divider', () => {
    const chatId = 'tg_self:1'
    const messages = [
      { id: '1', chatId, senderId: '1', text: 'Старое', timestamp: Date.now() - 120000, isOutgoing: false },
      { id: '2', chatId, senderId: '1', text: 'Непрочитано 1', timestamp: Date.now() - 60000, isOutgoing: false },
      { id: '3', chatId, senderId: '1', text: 'Непрочитано 2', timestamp: Date.now(), isOutgoing: false },
    ]
    const store = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'Test', unreadCount: 2, type: 'user' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
    })
    expect(() => render(<InboxMode store={store} />)).not.toThrow()
    cleanup()
  })

  it('рендерится с медиа-альбомом (3 фото grouped)', () => {
    const chatId = 'tg_self:2'
    const messages = [
      {
        id: '10', chatId, senderId: '2', text: '', timestamp: Date.now() - 1000,
        isOutgoing: false, mediaType: 'photo', groupedId: 'g1',
        mediaWidth: 800, mediaHeight: 600,
      },
      {
        id: '11', chatId, senderId: '2', text: '', timestamp: Date.now() - 900,
        isOutgoing: false, mediaType: 'photo', groupedId: 'g1',
        mediaWidth: 800, mediaHeight: 600,
      },
      {
        id: '12', chatId, senderId: '2', text: 'Подпись', timestamp: Date.now() - 800,
        isOutgoing: false, mediaType: 'photo', groupedId: 'g1',
        mediaWidth: 800, mediaHeight: 600,
      },
    ]
    const store = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'Канал', unreadCount: 0, type: 'channel' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
    })
    expect(() => render(<InboxMode store={store} />)).not.toThrow()
    cleanup()
  })

  it('RF 0.87.35: кнопка ↓ показывается если unreadCount > 0 даже при atBottom', async () => {
    const chatId = 'tg_self:9'
    const messages = Array.from({ length: 5 }, (_, i) => ({
      id: String(i + 1), chatId, senderId: 's', text: 'msg' + i,
      timestamp: 1712000000000 + i * 1000, isOutgoing: false,
    }))
    const store = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'C', unreadCount: 5, type: 'user' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
    })
    const { container } = render(<InboxMode store={store} />)
    // Кнопка scroll-bottom должна рендериться (есть unread=5)
    await new Promise(r => setTimeout(r, 50))
    const btn = container.querySelector('.native-scroll-bottom-btn')
    expect(btn).toBeTruthy()
    // Бейдж с числом 5
    expect(container.textContent).toContain('5')
    cleanup()
  })

  // v0.87.48: регрессия — авто-load-older НЕ должен стрелять сразу при рендере
  // (до того как initial-scroll завершится). Иначе гонка с browser scroll anchoring
  // перемещала юзера в середину чата при открытии. Ловушка 103.
  it('RF 0.87.48: loadOlderMessages НЕ вызывается при открытии чата (до initial-scroll)', async () => {
    const chatId = 'tg_self:race'
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: String(100 + i), chatId, senderId: 's', text: 'msg' + i,
      timestamp: 1712000000000 + i * 1000, isOutgoing: false,
    }))
    const store = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'C', unreadCount: 3, type: 'channel' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
    })
    const { container } = render(<InboxMode store={store} />)
    // Симулируем scroll event scrollTop=0 (как происходит при chat-open ДО initial-scroll)
    const scrollEl = container.querySelector('[style*="overflowY: auto"]') || container.querySelector('div')
    if (scrollEl) {
      Object.defineProperty(scrollEl, 'scrollTop', { value: 0, configurable: true })
      Object.defineProperty(scrollEl, 'scrollHeight', { value: 10000, configurable: true })
      Object.defineProperty(scrollEl, 'clientHeight', { value: 570, configurable: true })
      scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }))
    }
    await new Promise(r => setTimeout(r, 50))
    // loadOlderMessages НЕ должен был быть вызван — initial-scroll ещё не done
    expect(store.loadOlderMessages).not.toHaveBeenCalled()
    cleanup()
  })

  it('рендерится со ссылкой (link preview)', () => {
    const chatId = 'tg_self:3'
    const messages = [{
      id: '20', chatId, senderId: '3', text: 'https://example.com',
      timestamp: Date.now(), isOutgoing: false, mediaType: 'link',
      webPage: { url: 'https://example.com', title: 'Example', description: 'Desc', siteName: 'example.com' },
    }]
    const store = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'Friend', unreadCount: 0, type: 'user' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
    })
    expect(() => render(<InboxMode store={store} />)).not.toThrow()
    cleanup()
  })
})
