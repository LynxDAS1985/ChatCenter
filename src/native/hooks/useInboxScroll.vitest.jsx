// v0.95.2: гистерезис «у низа» (Schmitt trigger) — фикс мигания кнопки ↓.
// Раньше один порог <80 → колебание bottomGap 60-100 давало тоггл atBottom → кнопка мигала.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// v1.2.187: моки для теста троттлинга — считаем вызовы computeScrollAnchor.
vi.mock('../utils/scrollPositionsCache.js', () => ({
  computeScrollAnchor: vi.fn(() => ({ anchorMsgId: 'm1', screenTop: 0 })),
  saveScrollPositions: vi.fn(),
}))
vi.mock('./useInboxNewerPrefetch.js', () => ({ default: () => ({ maybeTrigger: vi.fn() }) }))

import useInboxScroll, { computeNearBottom } from './useInboxScroll.js'
import { computeScrollAnchor } from '../utils/scrollPositionsCache.js'

describe('computeNearBottom — гистерезис против дребезга', () => {
  it('prev=null (первый замер) — единый порог 80', () => {
    expect(computeNearBottom(50, null)).toBe(true)
    expect(computeNearBottom(80, null)).toBe(false)
    expect(computeNearBottom(100, null)).toBe(false)
  })

  it('prev=true (в atBottom) — выходим только при bottomGap > 120', () => {
    expect(computeNearBottom(50, true)).toBe(true)    // глубоко внизу
    expect(computeNearBottom(100, true)).toBe(true)   // в полосе 40-120 — НЕ выходим (фикс мигания)
    expect(computeNearBottom(119, true)).toBe(true)
    expect(computeNearBottom(120, true)).toBe(false)  // только тут выходим
    expect(computeNearBottom(200, true)).toBe(false)
  })

  it('prev=false (не у низа) — входим в atBottom только при bottomGap < 40', () => {
    expect(computeNearBottom(200, false)).toBe(false) // далеко от низа
    expect(computeNearBottom(80, false)).toBe(false)  // в полосе 40-120 — НЕ входим
    expect(computeNearBottom(40, false)).toBe(false)
    expect(computeNearBottom(39, false)).toBe(true)   // только тут входим
    expect(computeNearBottom(0, false)).toBe(true)
  })

  it('реальный сценарий дребезга 60-100 — НЕ переключаемся', () => {
    // После входа в atBottom (был <40) bottomGap колеблется 60-100 от мелких ремаунтов.
    // С гистерезисом — остаёмся в atBottom (мигания нет). Старый код переключал каждый раз.
    let prev = true
    for (const gap of [64, 105, 48, 92, 55, 110, 70, 85]) {
      const next = computeNearBottom(gap, prev)
      expect(next).toBe(true)  // все < 120 → остаёмся в atBottom
      prev = next
    }
  })
})

// v1.2.187: тест-ловушка — якорь НЕ вычисляется на каждый кадр прокрутки (throttle 250мс).
describe('handleScroll — троттлинг сохранения якоря (v1.2.187)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); computeScrollAnchor.mockClear() })
  afterEach(() => { vi.useRealTimers() })

  const makeProps = () => ({
    store: { activeChatId: 'c1' }, scrollKey: 'c1', activeMessages: [], activeUnread: 0, chatReady: true,
    msgsScrollRef: { current: null }, scrollPosByChatRef: { current: new Map() },
    initialScrollDoneRef: { current: 'other' },  // != viewKey → ветка load-older пропускается
    loadingOlderRef: { current: false }, loadingNewerRef: { current: false }, setLoadingNewer: vi.fn(),
    scrollDiag: { logEvent: vi.fn(), observeScroll: vi.fn() },
    setAtBottom: vi.fn(), setPhysicallyAtBottom: vi.fn(), setNewBelow: vi.fn(),
    isRestoringRef: { current: false }, prependAnchorRef: { current: null },
  })
  const evt = () => ({ target: { scrollHeight: 2000, scrollTop: 1000, clientHeight: 500, querySelectorAll: () => [], querySelector: () => null, getBoundingClientRect: () => ({ top: 0 }) } })

  it('5 событий скролла подряд → якорь считается 1 раз; после 250мс — ещё раз', () => {
    const { result } = renderHook(() => useInboxScroll(makeProps()))
    for (let i = 0; i < 5; i++) result.current.handleScroll(evt())  // всё в t=1000
    expect(computeScrollAnchor).toHaveBeenCalledTimes(1)  // без throttle было бы 5
    vi.setSystemTime(1300)  // прошло 300мс > 250
    result.current.handleScroll(evt())
    expect(computeScrollAnchor).toHaveBeenCalledTimes(2)
  })
})
