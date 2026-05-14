import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import useReadByVisibility from './useReadByVisibility.js'

function useHarness(props) {
  const maxEverSentRef = useRef(props.initialMaxEverSent || 0)
  const hook = useReadByVisibility({ ...props, maxEverSentRef })
  return { ...hook, maxEverSentRef }
}

describe('useReadByVisibility read cursor guard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resets stale local maxEverSentRef to Telegram readInboxMaxId', async () => {
    const markRead = vi.fn()
    const scrollDiag = { logEvent: vi.fn() }
    const { result } = renderHook((props) => useHarness(props), {
      initialProps: {
        activeChatId: 'chat1',
        activeUnread: 452,
        readInboxMaxId: 17227,
        markRead,
        scrollDiag,
        initialMaxEverSent: 17699,
      },
    })

    expect(result.current.maxEverSentRef.current).toBe(17227)

    act(() => {
      result.current.readByVisibility({ id: '17228', isOutgoing: false })
      result.current.readByVisibility({ id: '17229', isOutgoing: false })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(markRead).toHaveBeenCalledWith('chat1', 17229, { source: 'visibility', count: 2 })
    expect(scrollDiag.logEvent).toHaveBeenCalledWith('read-guard-reset', {
      chatId: 'chat1',
      readInboxMaxId: 17227,
    })
  })

  it('does not send mark-read for messages before Telegram readInboxMaxId', async () => {
    const markRead = vi.fn()
    const scrollDiag = { logEvent: vi.fn() }
    const { result } = renderHook(() => useHarness({
      activeChatId: 'chat1',
      activeUnread: 10,
      readInboxMaxId: 100,
      markRead,
      scrollDiag,
    }))

    act(() => {
      result.current.readByVisibility({ id: '99', isOutgoing: false })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(markRead).not.toHaveBeenCalled()
    expect(scrollDiag.logEvent).toHaveBeenCalledWith('read-skip-before-cursor', {
      msgId: 99,
      readInboxMaxId: 100,
    })
  })
})
