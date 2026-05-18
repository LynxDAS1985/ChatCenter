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

  it('не ставит разделитель "Новые" на старое сообщение до readInboxMaxId', async () => {
    const chatId = 'tg_self:cursor'
    const messages = [
      { id: '79773', chatId, senderId: 's', text: 'old 1', timestamp: 1712000000000, isOutgoing: false },
      { id: '79784', chatId, senderId: 's', text: 'old 2', timestamp: 1712000001000, isOutgoing: false },
      { id: '79871', chatId, senderId: 's', text: 'last read', timestamp: 1712000002000, isOutgoing: false },
      { id: '79872', chatId, senderId: 's', text: 'new 1', timestamp: 1712000003000, isOutgoing: false },
      { id: '79873', chatId, senderId: 's', text: 'new 2', timestamp: 1712000004000, isOutgoing: false },
    ]
    const store = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'C', unreadCount: 138, readInboxMaxId: 79871, type: 'channel' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
      messageWindows: { [chatId]: { readInboxMaxId: 79871, unreadCount: 138 } },
    })
    const { container } = render(<InboxMode store={store} />)
    await new Promise(r => setTimeout(r, 50))
    const newMsg = Array.from(container.querySelectorAll('[data-msg-id]')).find(el => el.getAttribute('data-msg-id') === '79872')
    expect(newMsg).toBeTruthy()
    const divider = container.querySelector('.native-msg-unread-divider')
    expect(divider).toBeTruthy()
    expect(divider.compareDocumentPosition(newMsg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    cleanup()
  })

  it('не отправляет mark-read для сообщений старее readInboxMaxId', async () => {
    const chatId = 'tg_self:read-skip'
    let observerCallback = null
    globalThis.IntersectionObserver = class {
      constructor(cb) { observerCallback = cb }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    const messages = [
      { id: '10', chatId, senderId: 's', text: 'old', timestamp: 1712000000000, isOutgoing: false },
      { id: '11', chatId, senderId: 's', text: 'new', timestamp: 1712000001000, isOutgoing: false },
    ]
    const store = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'C', unreadCount: 1, readInboxMaxId: 10, type: 'channel' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
      messageWindows: { [chatId]: { readInboxMaxId: 10, unreadCount: 1 } },
    })
    render(<InboxMode store={store} />)
    observerCallback?.([{ isIntersecting: true, boundingClientRect: { bottom: 100 }, rootBounds: { top: 50 } }])
    observerCallback?.([{ isIntersecting: false, boundingClientRect: { bottom: 20 }, rootBounds: { top: 50 } }])
    await new Promise(r => setTimeout(r, 400))
    expect(store.markRead).not.toHaveBeenCalledWith(chatId, 10)
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

  // v0.87.52: smoke-тест — InboxMode рендерится после смены activeChatId без ошибки.
  // Регрессия newBelow=sticky покрыта в useNewBelowCounter.vitest.jsx.
  it('RF 0.87.52: rerender при смене activeChatId не падает', async () => {
    const chatA = 'tg_self:A', chatB = 'tg_self:B'
    const { rerender, unmount } = render(<InboxMode store={buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatA, accountId: 'tg_self', title: 'A', unreadCount: 0, type: 'channel' }],
      activeChatId: chatA,
      messages: { [chatA]: [{ id: '1', chatId: chatA, senderId: 's', text: '.', timestamp: 1, isOutgoing: false }] },
    })} />)
    expect(() => rerender(<InboxMode store={buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatB, accountId: 'tg_self', title: 'B', unreadCount: 0, type: 'channel' }],
      activeChatId: chatB,
      messages: { [chatB]: [{ id: '10', chatId: chatB, senderId: 's', text: '.', timestamp: 1, isOutgoing: false }] },
    })} />)).not.toThrow()
    unmount()
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

  // v0.89.33: snapshot readInboxMaxId — divider «Новые сообщения» не двигается
  // после markRead (как в Telegram Desktop / WhatsApp / Discord).
  it('v0.89.33: divider застывает на snapshot позиции при изменении readInboxMaxId', async () => {
    const chatId = 'tg_self:snapshot'
    const mkMsg = (id) => ({ id: String(id), chatId, senderId: 's', text: 'm' + id,
      timestamp: 1712000000000 + id * 1000, isOutgoing: false })
    const messages = [mkMsg(99), mkMsg(100), mkMsg(101), mkMsg(102), mkMsg(103)]
    // 1) Открыли чат: readInboxMaxId=99 → divider должен быть перед msg 100
    const store1 = buildStore({
      activeAccountId: 'tg_self',
      chats: [{ id: chatId, accountId: 'tg_self', title: 'C', unreadCount: 4, readInboxMaxId: 99, type: 'user' }],
      activeChatId: chatId,
      messages: { [chatId]: messages },
      messageWindows: { [chatId]: { readInboxMaxId: 99, unreadCount: 4 } },
    })
    const { container, rerender } = render(<InboxMode store={store1} />)
    await new Promise(r => setTimeout(r, 50))
    const msg100Before = container.querySelector('[data-msg-id="100"]')
    const dividerBefore = container.querySelector('.native-msg-unread-divider')
    expect(dividerBefore).toBeTruthy()
    expect(msg100Before).toBeTruthy()
    expect(dividerBefore.compareDocumentPosition(msg100Before) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // 2) Server sync: cursor двинулся 99 → 101, unread 4 → 2 (markRead)
    // С нашим snapshot — divider должен остаться перед msg 100, не прыгать на 102.
    const store2 = {
      ...store1,
      chats: [{ id: chatId, accountId: 'tg_self', title: 'C', unreadCount: 2, readInboxMaxId: 101, type: 'user' }],
      messageWindows: { [chatId]: { readInboxMaxId: 101, unreadCount: 2 } },
    }
    rerender(<InboxMode store={store2} />)
    await new Promise(r => setTimeout(r, 50))
    const msg100After = container.querySelector('[data-msg-id="100"]')
    const dividerAfter = container.querySelector('.native-msg-unread-divider')
    expect(dividerAfter).toBeTruthy()
    expect(msg100After).toBeTruthy()
    // ВАЖНО: divider всё ещё ПЕРЕД msg 100 — не прыгнул на 102.
    expect(dividerAfter.compareDocumentPosition(msg100After) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    cleanup()
  })
})
