import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getScrollMetrics, getUnreadAnchorDebug, logNativeScroll } from './scrollDiagnostics.js'

beforeEach(() => {
  globalThis.window.api = { send: vi.fn() }
})

describe('scrollDiagnostics', () => {
  it('собирает метрики scroll-контейнера', () => {
    const el = { scrollTop: 120, scrollHeight: 900, clientHeight: 300 }
    expect(getScrollMetrics(el)).toEqual({ hasEl: true, top: 120, height: 900, client: 300, bottomGap: 480 })
  })

  it('вычисляет debug-якорь первого непрочитанного по unreadCount', () => {
    const messages = [
      { id: '1', isOutgoing: false },
      { id: '2', isOutgoing: true },
      { id: '3', isOutgoing: false },
      { id: '4', isOutgoing: false },
    ]
    expect(getUnreadAnchorDebug(messages, 2)).toMatchObject({
      unread: 2,
      incoming: 3,
      anchorIndex: 1,
      anchorId: '3',
      firstIncomingId: '1',
      lastIncomingId: '4',
    })
  })

  it('пишет renderer-событие в общий chatcenter.log через app:log', () => {
    logNativeScroll('probe', { chatId: 'tg:1', top: 12.4 })
    expect(window.api.send).toHaveBeenCalledWith('app:log', {
      level: 'INFO',
      message: '[native-scroll] probe chatId=tg:1 top=12',
    })
  })
})
