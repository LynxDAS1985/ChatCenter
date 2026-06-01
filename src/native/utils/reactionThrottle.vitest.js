// v0.95.31: тесты reactionThrottle (leading-edge throttle).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createReactionThrottler } from './reactionThrottle.js'

describe('reactionThrottle (v0.95.31)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 1, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('первый вызов идёт мгновенно (leading-edge)', () => {
    const throttle = createReactionThrottler(200)
    const fn = vi.fn()
    expect(throttle('a:1:👍', fn)).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('второй вызов в течение 200мс игнорируется', () => {
    const throttle = createReactionThrottler(200)
    const fn = vi.fn()
    throttle('a:1:👍', fn)
    vi.advanceTimersByTime(100)
    expect(throttle('a:1:👍', fn)).toBe(false)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('после 200мс новый вызов проходит', () => {
    const throttle = createReactionThrottler(200)
    const fn = vi.fn()
    throttle('a:1:👍', fn)
    vi.advanceTimersByTime(250)
    expect(throttle('a:1:👍', fn)).toBe(true)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('РАЗНЫЕ key (разный emoji) — НЕ блокируют друг друга', () => {
    const throttle = createReactionThrottler(200)
    const fn = vi.fn()
    throttle('a:1:👍', fn)
    throttle('a:1:❤️', fn)
    throttle('a:1:🔥', fn)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('РАЗНЫЕ key (разный msgId) — НЕ блокируют друг друга', () => {
    const throttle = createReactionThrottler(200)
    const fn = vi.fn()
    throttle('a:1:👍', fn)
    throttle('a:2:👍', fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('5 спам-кликов одной реакции за 100мс → только 1 вызов', () => {
    const throttle = createReactionThrottler(200)
    const fn = vi.fn()
    for (let i = 0; i < 5; i++) {
      throttle('a:1:👍', fn)
      vi.advanceTimersByTime(20)
    }
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('невалидные аргументы (null/undefined) → false', () => {
    const throttle = createReactionThrottler(200)
    expect(throttle(null, () => {})).toBe(false)
    expect(throttle('', () => {})).toBe(false)
    expect(throttle('key', null)).toBe(false)
    expect(throttle('key', 'not-a-fn')).toBe(false)
  })

  it('исключение в fn не ломает throttler (поглощается)', () => {
    const throttle = createReactionThrottler(200)
    const fn = vi.fn(() => { throw new Error('boom') })
    expect(() => throttle('a:1:👍', fn)).not.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
