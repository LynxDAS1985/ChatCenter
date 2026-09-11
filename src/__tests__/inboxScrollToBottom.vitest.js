// inboxScrollToBottom.vitest.js — v1.2.455
//
// Проверяет кнопку «↓ вниз» в переписке — код, который до выноса в
// shared/inboxScrollToBottom.js НЕ проверялся вообще (жил внутри экрана на 1121 строку).
//
// Внутри две совершенно разные ветки, и путать их нельзя:
//   1) «докрутить прямо сейчас» — свежие сообщения уже загружены;
//   2) «сначала догрузить, потом плавно приземлиться» — между показанным и последним
//      сообщением есть разрыв (пользователь листал далеко вверх / вернулся в чат).
// Главная ловушка: после ветки 2 обычный прыжок в конец выполняться НЕ должен
// (ранний выход) — иначе лента дёрнется дважды.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import createScrollToBottom from '../../shared/inboxScrollToBottom.js'

// Заглушка области сообщений: настоящий элемент нам не нужен, нужны только размеры
// и запись о том, что прокрутку позвали.
function makeEl({ scrollHeight = 5000, scrollTop = 0, clientHeight = 800 } = {}) {
  return {
    scrollHeight, scrollTop, clientHeight,
    scrollTo: vi.fn(),
  }
}

function makeCtx(over = {}) {
  const el = over.el || makeEl()
  const ctx = {
    msgsScrollRef: { current: el },
    activeViewKey: 'chat1',
    store: {
      activeChatId: 'chat1',
      chats: [{ id: 'chat1', lastMessageId: '1048576' }],
      loadingMessages: {},
      loadMessagesUntil: vi.fn(() => Promise.resolve({ iterations: 2, messages: [1, 2] })),
      loadTopicMessagesUntil: vi.fn(() => Promise.resolve({ iterations: 1, messages: [1] })),
    },
    activeMessages: [{ id: '1048576', isOutgoing: false }],
    activeUnread: 0,
    activeChat: { id: 'chat1' },
    activeTopic: null,
    scrollDiag: { logEvent: vi.fn() },
    scrollPosByChatRef: { current: new Map() },
    setAtBottom: vi.fn(),
    setNewBelow: vi.fn(),
    maxEverSentRef: { current: 0 },
    markReadCurrentView: vi.fn(),
    computeScrollBehavior: vi.fn(() => 'smooth'),
    computeJumpToEndGate: vi.fn(() => false),
    smoothScrollTo: vi.fn(),
    ...over,
  }
  ctx.msgsScrollRef = over.msgsScrollRef || { current: el }
  return ctx
}

// Ждём, пока отработают обещание загрузки и два кадра отрисовки.
const flush = () => new Promise(r => setTimeout(r, 0))

describe('кнопка «↓ вниз»: ветка «докрутить прямо сейчас»', () => {
  it('прокручивает область сообщений в самый низ', () => {
    const ctx = makeCtx()
    createScrollToBottom(ctx)()
    expect(ctx.msgsScrollRef.current.scrollTo).toHaveBeenCalledWith({ top: 5000, behavior: 'smooth' })
    expect(ctx.setAtBottom).toHaveBeenCalledWith(true)
    expect(ctx.setNewBelow).toHaveBeenCalledWith(0)
  })

  it('запоминает «мы в конце чата», чтобы при возврате не прыгало вверх', () => {
    const ctx = makeCtx()
    createScrollToBottom(ctx)()
    expect(ctx.scrollPosByChatRef.current.get('chat1')).toEqual({
      anchorMsgId: null, screenTop: 0, atBottom: true,
    })
  })

  it('помечает прочитанным, когда есть непрочитанные', () => {
    const ctx = makeCtx({ activeUnread: 3 })
    createScrollToBottom(ctx)()
    expect(ctx.markReadCurrentView).toHaveBeenCalledWith('chat1', 1048576, { source: 'button-scroll' })
    expect(ctx.maxEverSentRef.current).toBe(1048576)
  })

  it('НЕ помечает прочитанным, когда непрочитанных нет (иначе лишняя работа на сервер)', () => {
    const ctx = makeCtx({ activeUnread: 0 })
    createScrollToBottom(ctx)()
    expect(ctx.markReadCurrentView).not.toHaveBeenCalled()
  })

  it('не помечает повторно то, что уже пометили раньше', () => {
    const ctx = makeCtx({ activeUnread: 3, maxEverSentRef: { current: 1048576 } })
    createScrollToBottom(ctx)()
    expect(ctx.markReadCurrentView).not.toHaveBeenCalled()
  })

  it('пишет в журнал, какую ветку выбрал', () => {
    const ctx = makeCtx()
    createScrollToBottom(ctx)()
    const call = ctx.scrollDiag.logEvent.mock.calls.find(c => c[0] === 'button-scroll-bottom')
    expect(call).toBeTruthy()
    expect(call[1].branch).toBe('direct-scroll')
  })
})

describe('кнопка «↓ вниз»: ветка «сначала догрузить»', () => {
  let rafSpy
  beforeEach(() => {
    // Кадры отрисовки выполняем сразу — иначе тест ждал бы настоящей отрисовки.
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((fn) => { fn(); return 1 })
  })
  afterEach(() => rafSpy.mockRestore())

  it('просит догрузить сообщения до последнего и плавно приземляется', async () => {
    const ctx = makeCtx({ computeJumpToEndGate: vi.fn(() => true) })
    createScrollToBottom(ctx)()
    await flush()
    expect(ctx.store.loadMessagesUntil).toHaveBeenCalledWith('chat1', '1048576', 100)
    expect(ctx.smoothScrollTo).toHaveBeenCalled()
    const opts = ctx.smoothScrollTo.mock.calls[0][2]
    expect(opts.twoPhase).toBe(true)
  })

  it('🔴 ЛОВУШКА: обычный прыжок в конец после догрузки НЕ выполняется (ранний выход)', async () => {
    const ctx = makeCtx({ computeJumpToEndGate: vi.fn(() => true) })
    createScrollToBottom(ctx)()
    await flush()
    expect(ctx.msgsScrollRef.current.scrollTo).not.toHaveBeenCalled()
  })

  it('после приземления отмечает «мы в конце» и помечает прочитанным', async () => {
    const ctx = makeCtx({ computeJumpToEndGate: vi.fn(() => true), activeUnread: 5 })
    createScrollToBottom(ctx)()
    await flush()
    const opts = ctx.smoothScrollTo.mock.calls[0][2]
    opts.onComplete()
    expect(ctx.setAtBottom).toHaveBeenCalledWith(true)
    expect(ctx.setNewBelow).toHaveBeenCalledWith(0)
    expect(ctx.markReadCurrentView).toHaveBeenCalledWith('chat1', 1048576, { source: 'button-scroll' })
    expect(ctx.scrollPosByChatRef.current.get('chat1').atBottom).toBe(true)
  })

  it('в теме форума догружает именно тему, а не весь чат', async () => {
    const ctx = makeCtx({
      computeJumpToEndGate: vi.fn(() => true),
      activeChat: { id: 'chat1', isForum: true },
      activeTopic: { lastMessageId: '2097152' },
    })
    createScrollToBottom(ctx)()
    await flush()
    expect(ctx.store.loadTopicMessagesUntil).toHaveBeenCalledWith('chat1', ctx.activeTopic, '2097152', 100)
    expect(ctx.store.loadMessagesUntil).not.toHaveBeenCalled()
  })

  it('сбой догрузки не ломает приложение и попадает в журнал', async () => {
    const ctx = makeCtx({
      computeJumpToEndGate: vi.fn(() => true),
      store: {
        activeChatId: 'chat1',
        chats: [{ id: 'chat1', lastMessageId: '1048576' }],
        loadingMessages: {},
        loadMessagesUntil: vi.fn(() => Promise.reject(new Error('нет сети'))),
        loadTopicMessagesUntil: vi.fn(),
      },
    })
    expect(() => createScrollToBottom(ctx)()).not.toThrow()
    await flush()
    const call = ctx.scrollDiag.logEvent.mock.calls.find(c => c[0] === 'button-scroll-jump-to-end-error')
    expect(call).toBeTruthy()
    expect(call[1].error).toContain('нет сети')
    expect(ctx.smoothScrollTo).not.toHaveBeenCalled()
  })

  it('если область сообщений исчезла за время догрузки — тихо выходим, без падения', async () => {
    const ctx = makeCtx({ computeJumpToEndGate: vi.fn(() => true) })
    ctx.store.loadMessagesUntil = vi.fn(() => {
      ctx.msgsScrollRef.current = null
      return Promise.resolve({ iterations: 1, messages: [] })
    })
    createScrollToBottom(ctx)()
    await flush()
    expect(ctx.smoothScrollTo).not.toHaveBeenCalled()
  })
})

describe('кнопка «↓ вниз»: крайние случаи', () => {
  it('нет области сообщений (чат ещё не отрисован) — ничего не делаем и не падаем', () => {
    const ctx = makeCtx({ msgsScrollRef: { current: null } })
    expect(() => createScrollToBottom(ctx)()).not.toThrow()
    expect(ctx.setAtBottom).not.toHaveBeenCalled()
  })

  it('пустая переписка — прокрутка есть, пометки прочитанного нет', () => {
    const ctx = makeCtx({ activeMessages: [], activeUnread: 0 })
    createScrollToBottom(ctx)()
    expect(ctx.msgsScrollRef.current.scrollTo).toHaveBeenCalled()
    expect(ctx.markReadCurrentView).not.toHaveBeenCalled()
  })

  it('чат неизвестен серверу (нет lastMessageId) — работает обычная ветка', () => {
    const ctx = makeCtx({ computeJumpToEndGate: vi.fn(() => false) })
    ctx.store.chats = []
    createScrollToBottom(ctx)()
    expect(ctx.msgsScrollRef.current.scrollTo).toHaveBeenCalled()
    const call = ctx.scrollDiag.logEvent.mock.calls.find(c => c[0] === 'button-scroll-bottom')
    expect(call[1].chatLastMessageId).toBe(null)
    expect(call[1].gapMessages).toBe(null)
  })

  it('решение о ветке принимает computeJumpToEndGate — ему передают разрыв и признак загрузки', () => {
    const ctx = makeCtx()
    ctx.store.loadingMessages = { chat1: true }
    ctx.activeMessages = [{ id: '1', isOutgoing: false }]
    createScrollToBottom(ctx)()
    expect(ctx.computeJumpToEndGate).toHaveBeenCalledWith({
      lastMessageId: '1048576',
      gapMessages: 1,
      loading: true,
    })
  })
})
