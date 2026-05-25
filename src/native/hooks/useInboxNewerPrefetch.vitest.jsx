// v0.91.12: регрессионный тест для dedup signal в useInboxNewerPrefetch.
// Корень бага (chatcenter.log 12:02:22): backend возвращал hasMore=true + 100 msg,
// но все они были дублями (уже в activeMessages). Старый код ставил reachedEnd
// только при hasMore=false ИЛИ messages.length=0 → noMoreNewer не выставлялся →
// при каждом wheel-tick запускался новый load-newer-trigger с тем же afterId.
// Результат: 4-10 IPC-запросов за секунду, дёрганья scrollHeight, лишние setState.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useInboxNewerPrefetch from './useInboxNewerPrefetch.js'

describe('v0.91.12: dedup signal в useInboxNewerPrefetch', () => {
  let store, scrollDiag, loadingNewerRef, setLoadingNewer

  beforeEach(() => {
    loadingNewerRef = { current: false }
    setLoadingNewer = vi.fn()
    scrollDiag = { logEvent: vi.fn() }
  })

  it('после load-newer с only-duplicates, noMoreNewerRef ставится в true', async () => {
    const existing = [
      { id: '100', isOutgoing: false },
      { id: '200', isOutgoing: false },
    ]
    store = {
      activeChatId: 'chat1',
      loadNewerMessages: vi.fn().mockResolvedValue({
        ok: true,
        hasMore: true,
        messages: [{ id: '100' }, { id: '200' }], // все дубли
      }),
    }
    const { result } = renderHook(() => useInboxNewerPrefetch({
      store, scrollKey: 'chat1', activeMessages: existing, scrollDiag,
    }))
    // fromBottomPx = scrollHeight - scrollTop - clientHeight = 500 (< 1500 threshold, >= 0)
    const el = { scrollTop: 500, scrollHeight: 1500, clientHeight: 500 }
    await act(async () => {
      result.current.maybeTrigger({
        el, viewKey: 'chat1',
        initialScrollDoneKey: 'chat1',
        loadingNewerRef, setLoadingNewer,
      })
      await new Promise(r => setTimeout(r, 0))
    })
    expect(result.current.noMoreNewerRef.current.get('chat1')).toBe(true)
    expect(scrollDiag.logEvent).toHaveBeenCalledWith('load-newer-result',
      expect.objectContaining({ reachedEnd: true, newCount: 0 }))
  })

  it('после load-newer с новыми сообщениями, noMoreNewerRef НЕ ставится', async () => {
    const existing = [
      { id: '100', isOutgoing: false },
    ]
    store = {
      activeChatId: 'chat1',
      loadNewerMessages: vi.fn().mockResolvedValue({
        ok: true,
        hasMore: true,
        messages: [{ id: '100' }, { id: '200' }, { id: '300' }], // 2 новых
      }),
    }
    const { result } = renderHook(() => useInboxNewerPrefetch({
      store, scrollKey: 'chat1', activeMessages: existing, scrollDiag,
    }))
    // fromBottomPx = scrollHeight - scrollTop - clientHeight = 500 (< 1500 threshold, >= 0)
    const el = { scrollTop: 500, scrollHeight: 1500, clientHeight: 500 }
    await act(async () => {
      result.current.maybeTrigger({
        el, viewKey: 'chat1',
        initialScrollDoneKey: 'chat1',
        loadingNewerRef, setLoadingNewer,
      })
      await new Promise(r => setTimeout(r, 0))
    })
    expect(result.current.noMoreNewerRef.current.get('chat1')).toBeFalsy()
    expect(scrollDiag.logEvent).toHaveBeenCalledWith('load-newer-result',
      expect.objectContaining({ reachedEnd: false, newCount: 2 }))
  })

  it('после load-newer с hasMore=false, reachedEnd=true (поведение до v0.91.12 сохранено)', async () => {
    store = {
      activeChatId: 'chat1',
      loadNewerMessages: vi.fn().mockResolvedValue({
        ok: true,
        hasMore: false,
        messages: [{ id: '500' }],
      }),
    }
    const { result } = renderHook(() => useInboxNewerPrefetch({
      store, scrollKey: 'chat1', activeMessages: [{ id: '100' }], scrollDiag,
    }))
    // fromBottomPx = scrollHeight - scrollTop - clientHeight = 500 (< 1500 threshold, >= 0)
    const el = { scrollTop: 500, scrollHeight: 1500, clientHeight: 500 }
    await act(async () => {
      result.current.maybeTrigger({
        el, viewKey: 'chat1',
        initialScrollDoneKey: 'chat1',
        loadingNewerRef, setLoadingNewer,
      })
      await new Promise(r => setTimeout(r, 0))
    })
    expect(result.current.noMoreNewerRef.current.get('chat1')).toBe(true)
  })

  it('после load-newer с result.ok=false, reachedEnd=false (не блокируем повторы при ошибке)', async () => {
    store = {
      activeChatId: 'chat1',
      loadNewerMessages: vi.fn().mockResolvedValue({
        ok: false,
        error: 'network',
      }),
    }
    const { result } = renderHook(() => useInboxNewerPrefetch({
      store, scrollKey: 'chat1', activeMessages: [{ id: '100' }], scrollDiag,
    }))
    // fromBottomPx = scrollHeight - scrollTop - clientHeight = 500 (< 1500 threshold, >= 0)
    const el = { scrollTop: 500, scrollHeight: 1500, clientHeight: 500 }
    await act(async () => {
      result.current.maybeTrigger({
        el, viewKey: 'chat1',
        initialScrollDoneKey: 'chat1',
        loadingNewerRef, setLoadingNewer,
      })
      await new Promise(r => setTimeout(r, 0))
    })
    expect(result.current.noMoreNewerRef.current.get('chat1')).toBeFalsy()
  })
})
