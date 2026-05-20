// v0.89.45: unit-тесты для агрегатора метрик IndexedDB кэша.
//
// Контракт:
// - 0 событий за окно → лог не пишется
// - >=1 событие → одна агрегированная строка `idb-cache-window` через WINDOW_MS
// - Разные op (loadMessages, selectForumTopic) сохраняются раздельно
// - Hit rate округляется до 2 знаков

import { describe, it, expect, beforeEach, vi } from 'vitest'

const logSpy = vi.fn()
vi.mock('../native/utils/scrollDiagnostics.js', () => ({
  logNativeScroll: (...args) => logSpy(...args),
}))

let recordIdbCache, _resetIdbCacheMetricsForTests
beforeEach(async () => {
  vi.resetModules()
  logSpy.mockClear()
  const mod = await import('../native/utils/idbCacheMetrics.js')
  recordIdbCache = mod.recordIdbCache
  _resetIdbCacheMetricsForTests = mod._resetIdbCacheMetricsForTests
  vi.useFakeTimers()
})

describe('idbCacheMetrics v0.89.45', () => {
  it('без событий — лог не пишется даже после окна', () => {
    vi.advanceTimersByTime(60_000)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('одно событие → одна агрегированная строка через 30с', () => {
    recordIdbCache('loadMessages', true)
    expect(logSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000)
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('idb-cache-window', expect.objectContaining({
      summary: expect.objectContaining({ loadMessages: expect.objectContaining({ h: 1, m: 0 }) }),
    }))
  })

  it('hits + misses агрегируются с правильным rate', () => {
    recordIdbCache('loadMessages', true)
    recordIdbCache('loadMessages', true)
    recordIdbCache('loadMessages', true)
    recordIdbCache('loadMessages', false)
    vi.advanceTimersByTime(30_000)
    const call = logSpy.mock.calls[0]
    expect(call[1].summary.loadMessages).toEqual({ h: 3, m: 1, rate: '0.75' })
  })

  it('разные op в одной строке', () => {
    recordIdbCache('loadMessages', true)
    recordIdbCache('selectForumTopic', false)
    recordIdbCache('selectForumTopic', true)
    vi.advanceTimersByTime(30_000)
    const summary = logSpy.mock.calls[0][1].summary
    expect(summary.loadMessages).toEqual({ h: 1, m: 0, rate: '1.00' })
    expect(summary.selectForumTopic).toEqual({ h: 1, m: 1, rate: '0.50' })
  })

  it('после flush — следующее событие открывает новое окно', () => {
    recordIdbCache('loadMessages', true)
    vi.advanceTimersByTime(30_000)
    expect(logSpy).toHaveBeenCalledTimes(1)
    recordIdbCache('loadMessages', false)
    vi.advanceTimersByTime(30_000)
    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(logSpy.mock.calls[1][1].summary.loadMessages).toEqual({ h: 0, m: 1, rate: '0.00' })
  })

  it('_resetIdbCacheMetricsForTests сбрасывает таймер и счётчики', () => {
    recordIdbCache('loadMessages', true)
    _resetIdbCacheMetricsForTests()
    vi.advanceTimersByTime(60_000)
    expect(logSpy).not.toHaveBeenCalled()
  })
})
