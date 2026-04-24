// v0.87.48: тесты для useInitialScroll — контракт doneRef для InboxMode.
// InboxMode использует doneRef чтобы блокировать авто-load-older до завершения
// initial-scroll. Если хук не вернёт doneRef — regression: auto load-older
// снова вступит в гонку с initial-scroll (см. Ловушка 103).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useInitialScroll } from './useInitialScroll.js'

beforeEach(() => {
  globalThis.window.api = { invoke: vi.fn(), on: vi.fn(() => () => {}), send: vi.fn() }
})

describe('useInitialScroll — контракт doneRef (v0.87.48)', () => {
  it('возвращает объект с полем doneRef (ref-объект)', () => {
    const { result } = renderHook(() => {
      const scrollRef = useRef({ scrollTop: 0, scrollHeight: 0, querySelector: () => null })
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: null, messagesCount: 0, scrollRef,
        firstUnreadIdRef, activeUnread: 0, loading: false,
      })
    })
    expect(result.current).toBeDefined()
    expect(result.current.doneRef).toBeDefined()
    expect(result.current.doneRef).toHaveProperty('current')
  })

  it('doneRef.current=null при отсутствии активного чата', () => {
    const { result } = renderHook(() => {
      const scrollRef = useRef({ scrollTop: 0, scrollHeight: 0, querySelector: () => null })
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: null, messagesCount: 0, scrollRef,
        firstUnreadIdRef, activeUnread: 0, loading: false,
      })
    })
    expect(result.current.doneRef.current).toBe(null)
  })

  it('doneRef.current=null пока loading=true (ждём свежие)', () => {
    const { result } = renderHook(() => {
      const scrollRef = useRef({ scrollTop: 0, scrollHeight: 1000, querySelector: () => null })
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: 'chat1', messagesCount: 50, scrollRef,
        firstUnreadIdRef, activeUnread: 5, loading: true,
      })
    })
    expect(result.current.doneRef.current).toBe(null)
  })

  it('doneRef.current=null при messagesCount=0 (пустой чат ещё не пришёл)', () => {
    const { result } = renderHook(() => {
      const scrollRef = useRef({ scrollTop: 0, scrollHeight: 0, querySelector: () => null })
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: 'chat1', messagesCount: 0, scrollRef,
        firstUnreadIdRef, activeUnread: 0, loading: false,
      })
    })
    expect(result.current.doneRef.current).toBe(null)
  })

  it('doneRef.current=activeChatId после завершения initial-scroll', async () => {
    const scrollEl = {
      scrollTop: 0,
      scrollHeight: 2000,
      clientHeight: 500,
      querySelector: () => null,
    }
    const { result } = renderHook(() => {
      const scrollRef = useRef(scrollEl)
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: 'chat-xyz', messagesCount: 50, scrollRef,
        firstUnreadIdRef, activeUnread: 0, loading: false,
      })
    })
    // useInitialScroll планирует scroll через setTimeout(150)
    await new Promise(r => setTimeout(r, 250))
    expect(result.current.doneRef.current).toBe('chat-xyz')
  })

  // v0.87.66: onDone callback вызывается после initial-scroll для снятия overlay в InboxMode
  it('⭐ v0.87.66: onDone callback вызван с chatId после завершения initial-scroll', async () => {
    const scrollEl = {
      scrollTop: 0, scrollHeight: 2000, clientHeight: 500,
      querySelector: () => null,
    }
    const onDone = vi.fn()
    renderHook(() => {
      const scrollRef = useRef(scrollEl)
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: 'chat-xyz', messagesCount: 50, scrollRef,
        firstUnreadIdRef, activeUnread: 0, loading: false,
        onDone,
      })
    })
    await new Promise(r => setTimeout(r, 250))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('chat-xyz')
  })

  it('v0.87.66: onDone НЕ вызывается пока loading=true', async () => {
    const scrollEl = {
      scrollTop: 0, scrollHeight: 2000, clientHeight: 500,
      querySelector: () => null,
    }
    const onDone = vi.fn()
    renderHook(() => {
      const scrollRef = useRef(scrollEl)
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: 'chat-xyz', messagesCount: 50, scrollRef,
        firstUnreadIdRef, activeUnread: 0, loading: true,  // ← ждём свежих
        onDone,
      })
    })
    await new Promise(r => setTimeout(r, 250))
    expect(onDone).not.toHaveBeenCalled()
  })

  // v0.87.70: восстанавливаем сохранённый scrollTop при возврате к виденному чату
  // (как Telegram Desktop). Регрессия: раньше scrollTop оставался от предыдущего чата —
  // один div на всё приложение, позиция не per-chat.
  it('⭐ v0.87.70: возврат к виденному чату — восстанавливаем savedScrollTop', async () => {
    const scrollEl = {
      scrollTop: 0, scrollHeight: 2000, clientHeight: 500,
      querySelector: () => null,
    }
    const savedPositions = { 'chat-A': 1234, 'chat-B': 500 }
    const onDone = vi.fn()
    const { rerender } = renderHook(({ chatId }) => {
      const scrollRef = useRef(scrollEl)
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: chatId, messagesCount: 50, scrollRef,
        firstUnreadIdRef, activeUnread: 0, loading: false,
        onDone,
        getSavedScrollTop: (id) => savedPositions[id] ?? null,
      })
    }, { initialProps: { chatId: 'chat-A' } })

    // Первое открытие A — initial-scroll (в низ), не restore
    await new Promise(r => setTimeout(r, 250))
    expect(scrollEl.scrollTop).toBe(scrollEl.scrollHeight)  // scrolled to bottom

    // Переключение B → A (возврат к виденному)
    rerender({ chatId: 'chat-B' })
    await new Promise(r => setTimeout(r, 250))
    // Теперь B в seen
    rerender({ chatId: 'chat-A' })
    await new Promise(r => setTimeout(r, 50))
    // Восстановили сохранённую позицию для A
    expect(scrollEl.scrollTop).toBe(1234)
  })

  it('v0.87.70: savedScrollTop ИГНОРИРУЕТСЯ если есть firstUnread (новые msg важнее)', async () => {
    const scrollEl = {
      scrollTop: 0, scrollHeight: 2000, clientHeight: 500,
      querySelector: (sel) => sel.includes('data-msg-id="msg-99"')
        ? { scrollIntoView: vi.fn(), classList: { add: vi.fn(), remove: vi.fn() } }
        : null,
    }
    const onDone = vi.fn()
    const firstUnreadIdRefInner = { current: null }
    const { rerender } = renderHook(({ chatId, unreadId }) => {
      const scrollRef = useRef(scrollEl)
      const firstUnreadIdRef = useRef(unreadId)
      firstUnreadIdRefInner.current = firstUnreadIdRef
      return useInitialScroll({
        activeChatId: chatId, messagesCount: 50, scrollRef,
        firstUnreadIdRef, activeUnread: unreadId ? 1 : 0, loading: false,
        onDone,
        getSavedScrollTop: () => 777,  // есть сохранённая позиция
      })
    }, { initialProps: { chatId: 'chat-X', unreadId: null } })

    // Первое открытие — без unread, идёт в низ
    await new Promise(r => setTimeout(r, 250))

    // Возврат с firstUnread = новые пришли → НЕ savedScrollTop (77), а firstUnread
    firstUnreadIdRefInner.current.current = 'msg-99'
    rerender({ chatId: 'chat-Y', unreadId: 'msg-99' })
    await new Promise(r => setTimeout(r, 250))
    rerender({ chatId: 'chat-X', unreadId: 'msg-99' })
    await new Promise(r => setTimeout(r, 50))
    // scrollIntoView был вызван на el с msg-99, а не scrollTop=777
    expect(scrollEl.scrollTop).not.toBe(777)
  })

  // v0.87.68: Set-based guard — initial-scroll НЕ перезапускается для уже виденного чата.
  // Регрессия: раньше doneRef хранил только последний chatId → при возврате A→B→A
  // initial-scroll запускался заново → моргание контента.
  it('⭐ v0.87.68: A→B→A — initial-scroll НЕ запускается повторно для A', async () => {
    const scrollEl = {
      scrollTop: 100, scrollHeight: 2000, clientHeight: 500,
      querySelector: () => null,
    }
    const onDone = vi.fn()
    const { rerender } = renderHook(({ chatId }) => {
      const scrollRef = useRef(scrollEl)
      const firstUnreadIdRef = useRef(null)
      return useInitialScroll({
        activeChatId: chatId, messagesCount: 50, scrollRef,
        firstUnreadIdRef, activeUnread: 0, loading: false,
        onDone,
      })
    }, { initialProps: { chatId: 'chat-A' } })

    await new Promise(r => setTimeout(r, 250))
    expect(onDone).toHaveBeenCalledWith('chat-A')
    expect(onDone).toHaveBeenCalledTimes(1)

    // Переключение A → B → ожидаем что для B выполнится initial-scroll
    rerender({ chatId: 'chat-B' })
    await new Promise(r => setTimeout(r, 250))
    expect(onDone).toHaveBeenCalledWith('chat-B')
    expect(onDone).toHaveBeenCalledTimes(2)

    // Возврат к A — initial-scroll НЕ должен запускаться заново (моргание фикс)
    rerender({ chatId: 'chat-A' })
    await new Promise(r => setTimeout(r, 250))
    // onDone вызывается СРАЗУ для A (без setTimeout 150мс) — подтверждает что
    // мы ушли через ранний-return ветку "уже в Set"
    expect(onDone).toHaveBeenCalledTimes(3)
    expect(onDone).toHaveBeenLastCalledWith('chat-A')
  })
})
