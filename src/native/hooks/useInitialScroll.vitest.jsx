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
})
