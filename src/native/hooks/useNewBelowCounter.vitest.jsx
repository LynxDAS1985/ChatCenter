// v0.91.3: тесты event-based useNewBelowCounter.
//
// Старая логика (v0.87.42, до v0.91.2) реагировала на массив `messages`. Тесты
// проверяли защиту от ложных срабатываний на prepend / chat-switch. После
// переписывания на event-based подход — те сценарии не применимы (хук не видит
// массив, а только server-push events `tg:new-message`).
//
// Новые тесты проверяют 4 фильтра:
//   1. Только для активного чата (chatId === activeChatId)
//   2. Только incoming (isOutgoing=false)
//   3. Не при atBottom=true
//   4. Подписка пересоздаётся при смене activeChatId, очищается при unmount
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNewBelowCounter } from './useNewBelowCounter.js'

// Mock window.api.on — захватываем последний установленный handler.
let lastHandler = null
let unsubMock = vi.fn()

beforeEach(() => {
  lastHandler = null
  unsubMock = vi.fn()
  globalThis.window.api = {
    on: vi.fn((event, handler) => {
      if (event === 'tg:new-message') lastHandler = handler
      return unsubMock
    }),
  }
})

// Симулирует эмит события tg:new-message
function emitNewMessage(chatId, message) {
  lastHandler?.({ chatId, message })
}

describe('useNewBelowCounter — event-based (v0.91.3)', () => {
  it('подписывается на tg:new-message при mount с activeChatId', () => {
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: false, onAdded: vi.fn(),
    }))
    expect(window.api.on).toHaveBeenCalledWith('tg:new-message', expect.any(Function))
  })

  it('НЕ подписывается если activeChatId пустой', () => {
    renderHook(() => useNewBelowCounter({
      activeChatId: null, atBottom: false, onAdded: vi.fn(),
    }))
    expect(window.api.on).not.toHaveBeenCalled()
  })

  it('event для АКТИВНОГО чата + incoming + не at-bottom → onAdded({ added: 1 })', () => {
    const onAdded = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: false, onAdded,
    }))
    emitNewMessage('chat-A', { id: '101', isOutgoing: false })
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ added: 1, messageId: '101', fromEvent: true }))
  })

  it('event для ДРУГОГО чата → НЕ считается + onSkip({ reason: "other-chat" })', () => {
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: false, onAdded, onSkip,
    }))
    emitNewMessage('chat-B', { id: '5001', isOutgoing: false })
    expect(onAdded).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ reason: 'other-chat' }))
  })

  // v0.95.36: skip только когда outgoing + isSending=true (свой sendMessage, локальный echo).
  // Outgoing без isSending (с другого устройства) идёт дальше для auto-scroll.
  it('v0.95.36: outgoing + isSending=true (свой ПК) → onSkip({ reason: "outgoing-pending" })', () => {
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: false, onAdded, onSkip,
    }))
    emitNewMessage('chat-A', { id: '102', isOutgoing: true, isSending: true })
    expect(onAdded).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ reason: 'outgoing-pending' }))
  })

  it('v0.95.36: outgoing БЕЗ isSending (другое устройство) + atBottom=false → onAdded (counter)', () => {
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: false, onAdded, onSkip,
    }))
    emitNewMessage('chat-A', { id: '300', isOutgoing: true, isSending: false })
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ added: 1, messageId: '300' }))
  })

  it('v0.95.36: outgoing БЕЗ isSending (другое устройство) + atBottom=true → onAutoScroll', () => {
    const onAdded = vi.fn()
    const onAutoScroll = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: true, onAdded, onSkip, onAutoScroll,
    }))
    emitNewMessage('chat-A', { id: '301', isOutgoing: true, isSending: false })
    expect(onAutoScroll).toHaveBeenCalledTimes(1)
    // v0.95.37: payload расширен полями isOutgoing/isSending для диагностики
    expect(onAutoScroll).toHaveBeenCalledWith({
      messageId: '301', isOutgoing: true, isSending: false,
    })
    expect(onAdded).not.toHaveBeenCalled()
  })

  // v0.95.37: тест updateMessageSendSucceeded — переход sending_state pending → null
  // НЕ должен повторно дёргать onAutoScroll. Сохранённый seenOutgoingIdsRef защищает.
  it('v0.95.37: outgoing+isSending=true (свой echo) → потом тот же id+isSending=false → skip (НЕ auto-scroll)', () => {
    const onAutoScroll = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: true, onAdded: vi.fn(), onSkip, onAutoScroll,
    }))
    // Событие 1: provisional с pending — skip как outgoing-pending
    emitNewMessage('chat-A', { id: '700', isOutgoing: true, isSending: true })
    expect(onAutoScroll).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ reason: 'outgoing-pending' }))
    onSkip.mockClear()
    // Событие 2: тот же id, но sending_state=null (имитируем повторный emit после
    // updateMessageSendSucceeded). Должен быть skip как already-seen, НЕ onAutoScroll.
    emitNewMessage('chat-A', { id: '700', isOutgoing: true, isSending: false })
    expect(onAutoScroll).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ reason: 'outgoing-already-seen' }))
  })

  it('v0.95.37: разные outgoing id — не блокируют друг друга (память per-id)', () => {
    const onAutoScroll = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: true, onAdded: vi.fn(), onAutoScroll,
    }))
    // Отправили 3 разных сообщения с других устройств подряд — каждое auto-scroll
    emitNewMessage('chat-A', { id: '801', isOutgoing: true, isSending: false })
    emitNewMessage('chat-A', { id: '802', isOutgoing: true, isSending: false })
    emitNewMessage('chat-A', { id: '803', isOutgoing: true, isSending: false })
    expect(onAutoScroll).toHaveBeenCalledTimes(3)
  })

  it('atBottom=true + НЕТ onAutoScroll → fallback onSkip({ reason: "at-bottom" })', () => {
    // v0.95.28: backward compatibility — если onAutoScroll не передан,
    // продолжаем работать как раньше (skip с at-bottom).
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: true, onAdded, onSkip,
    }))
    emitNewMessage('chat-A', { id: '103', isOutgoing: false })
    expect(onAdded).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ reason: 'at-bottom' }))
  })

  // v0.95.28: НОВОЕ — Telegram-style auto-scroll callback при atBottom + incoming
  // v0.95.37: payload расширен полями isOutgoing/isSending для диагностики.
  it('v0.95.28/37: atBottom=true + incoming → onAutoScroll с полями диагностики', () => {
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    const onAutoScroll = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: true, onAdded, onSkip, onAutoScroll,
    }))
    emitNewMessage('chat-A', { id: '500', isOutgoing: false })
    expect(onAdded).not.toHaveBeenCalled()
    expect(onAutoScroll).toHaveBeenCalledTimes(1)
    // v0.95.37: payload теперь содержит isOutgoing/isSending для логирования
    // fromOtherDevice (см. InboxMode.onAutoScroll scrollDiag).
    expect(onAutoScroll).toHaveBeenCalledWith({
      messageId: '500', isOutgoing: false, isSending: false,
    })
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('v0.95.28/36: atBottom=true + OUTGOING+isSending (свой ПК) → ни onAutoScroll', () => {
    // Outgoing с этой машины (isSending=true) проверяется ДО atBottom — не должно
    // срабатывать auto-scroll (handleReplySend сам делает send-scroll-done).
    const onAutoScroll = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: true, onAdded: vi.fn(), onSkip, onAutoScroll,
    }))
    emitNewMessage('chat-A', { id: '501', isOutgoing: true, isSending: true })
    expect(onAutoScroll).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ reason: 'outgoing-pending' }))
  })

  it('v0.95.28: atBottom=true + ДРУГОЙ ЧАТ → ни onAutoScroll, ни onAdded (skip other-chat)', () => {
    // other-chat фильтр срабатывает ДО atBottom — нет auto-scroll
    const onAutoScroll = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: true, onAdded: vi.fn(), onSkip, onAutoScroll,
    }))
    emitNewMessage('chat-B', { id: '502', isOutgoing: false })
    expect(onAutoScroll).not.toHaveBeenCalled()
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ reason: 'other-chat' }))
  })

  it('v0.95.28: atBottom=false + incoming → onAdded (как раньше), onAutoScroll НЕ зовётся', () => {
    // Когда юзер НЕ у низа — счётчик растёт, auto-scroll не нужен.
    const onAdded = vi.fn()
    const onAutoScroll = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: false, onAdded, onAutoScroll,
    }))
    emitNewMessage('chat-A', { id: '503', isOutgoing: false })
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(onAutoScroll).not.toHaveBeenCalled()
  })

  it('⭐ atBottom меняется в realtime через ref — НЕ пересоздаёт подписку', () => {
    const onAdded = vi.fn()
    const { rerender } = renderHook(({ atBottom }) => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom, onAdded,
    }), { initialProps: { atBottom: false } })

    // Подписка установлена 1 раз
    expect(window.api.on).toHaveBeenCalledTimes(1)

    // Меняем atBottom — подписка НЕ должна пересоздаваться (стандартный паттерн через ref)
    rerender({ atBottom: true })
    expect(window.api.on).toHaveBeenCalledTimes(1)
    rerender({ atBottom: false })
    expect(window.api.on).toHaveBeenCalledTimes(1)

    // Но atBottomRef.current отражает свежее значение → фильтр работает
    rerender({ atBottom: true })
    emitNewMessage('chat-A', { id: '200', isOutgoing: false })
    expect(onAdded).not.toHaveBeenCalled()

    rerender({ atBottom: false })
    emitNewMessage('chat-A', { id: '201', isOutgoing: false })
    expect(onAdded).toHaveBeenCalledTimes(1)
  })

  it('смена activeChatId → unsubscribe старой подписки + новая подписка', () => {
    const { rerender } = renderHook(({ chatId }) => useNewBelowCounter({
      activeChatId: chatId, atBottom: false, onAdded: vi.fn(),
    }), { initialProps: { chatId: 'chat-A' } })

    expect(window.api.on).toHaveBeenCalledTimes(1)
    expect(unsubMock).not.toHaveBeenCalled()

    rerender({ chatId: 'chat-B' })
    expect(unsubMock).toHaveBeenCalledTimes(1)            // unsub старой
    expect(window.api.on).toHaveBeenCalledTimes(2)         // подписка на новый чат
  })

  it('unmount → unsubscribe', () => {
    const { unmount } = renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: false, onAdded: vi.fn(),
    }))
    expect(unsubMock).not.toHaveBeenCalled()
    unmount()
    expect(unsubMock).toHaveBeenCalledTimes(1)
  })

  // v0.91.3 regression — ключевая защита от старого бага.
  // Сценарий из лога 14:54-14:55: юзер скроллит → load-older / load-newer prefetch
  // → state.messages меняется → но НИ ОДНОГО tg:new-message события (это batch responses).
  // Старый код насчитывал 200 в newBelow. Новый — ноль, так как нет events.
  it('⭐ v0.91.3 РЕГРЕССИЯ: batch load (load-older, prefetch) не эмитит tg:new-message → newBelow=0', () => {
    const onAdded = vi.fn()
    const onSkip = vi.fn()
    renderHook(() => useNewBelowCounter({
      activeChatId: 'chat-A', atBottom: false, onAdded, onSkip,
    }))
    // Никаких событий tg:new-message не эмитили (batch idёт через tg:messages, не сюда)
    expect(onAdded).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
  })
})
