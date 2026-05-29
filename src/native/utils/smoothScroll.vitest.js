// v0.95.16: тесты smooth scroll util с easing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  smoothScrollTo,
  easeOutCubic,
  easeOutQuint,
  prefersReducedMotion,
} from './smoothScroll.js'

describe('easing functions', () => {
  it('easeOutCubic: 0→0, 0.5→0.875, 1→1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 3)  // 1 - (1-0.5)^3
    expect(easeOutCubic(1)).toBe(1)
  })

  it('easeOutCubic монотонно возрастает', () => {
    let prev = -1
    for (let t = 0; t <= 1; t += 0.1) {
      const v = easeOutCubic(t)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('easeOutQuint: более сильное замедление в конце чем cubic', () => {
    // В точке 0.5 quint должен быть БЛИЖЕ к 1 чем cubic (более агрессивное easing)
    expect(easeOutQuint(0.5)).toBeGreaterThan(easeOutCubic(0.5))
  })
})

describe('smoothScrollTo — главные сценарии', () => {
  let el
  let rafCallbacks
  let originalRAF
  let originalCancel
  let originalNow
  let nowTime

  beforeEach(() => {
    el = { scrollTop: 0, clientHeight: 600 }
    rafCallbacks = []
    originalRAF = globalThis.requestAnimationFrame
    originalCancel = globalThis.cancelAnimationFrame
    originalNow = performance.now
    nowTime = 0
    globalThis.requestAnimationFrame = (cb) => {
      const id = rafCallbacks.length
      rafCallbacks.push(cb)
      return id
    }
    globalThis.cancelAnimationFrame = (id) => {
      rafCallbacks[id] = null
    }
    performance.now = vi.fn(() => nowTime)
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF
    globalThis.cancelAnimationFrame = originalCancel
    performance.now = originalNow
  })

  function tick(ms) {
    nowTime += ms
    const cb = rafCallbacks[rafCallbacks.length - 1]
    if (cb) cb(nowTime)
  }

  it('distance < 1px → no-op (уже у target)', () => {
    el.scrollTop = 100
    const cancel = smoothScrollTo(el, 100.5)
    expect(typeof cancel).toBe('function')
    expect(rafCallbacks.length).toBe(0)  // RAF не вызывался
  })

  it('distance > 8 viewport → instant (нет смысла в долгой анимации)', () => {
    el.clientHeight = 600
    el.scrollTop = 0
    // 8 viewport = 4800px. Target=5000px → instant
    smoothScrollTo(el, 5000)
    expect(el.scrollTop).toBe(5000)
    expect(rafCallbacks.length).toBe(0)  // RAF не вызывался — instant
  })

  it('обычная дистанция → запускает RAF + анимирует с easing', () => {
    el.scrollTop = 0
    const onComplete = vi.fn()
    smoothScrollTo(el, 1000, { duration: 500, onComplete })

    expect(rafCallbacks.length).toBe(1)  // первый RAF поставлен

    // 50% времени → easeOutCubic(0.5) = 0.875 → scrollTop ≈ 875
    tick(250)
    expect(el.scrollTop).toBeCloseTo(875, 0)
    expect(onComplete).not.toHaveBeenCalled()

    // 100% времени → точно target
    tick(250)
    expect(el.scrollTop).toBe(1000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('cancel() прерывает анимацию', () => {
    el.scrollTop = 0
    const cancel = smoothScrollTo(el, 1000, { duration: 500 })
    tick(100)  // 20% → scrollTop увеличился
    const midScroll = el.scrollTop
    expect(midScroll).toBeGreaterThan(0)
    expect(midScroll).toBeLessThan(1000)

    cancel()
    tick(500)  // больше нет RAF callback'ов
    expect(el.scrollTop).toBe(midScroll)  // не изменился после cancel
  })

  it('custom easing — easeOutQuint', () => {
    el.scrollTop = 0
    smoothScrollTo(el, 1000, { duration: 500, easing: easeOutQuint })
    tick(250)  // 50% → easeOutQuint(0.5) ≈ 0.969 → scrollTop ≈ 969
    expect(el.scrollTop).toBeCloseTo(969, 0)
  })

  it('null el → no-op', () => {
    expect(() => smoothScrollTo(null, 100)).not.toThrow()
  })

  // v0.95.18: ДВУХФАЗНЫЙ режим — instant до (target - 1 viewport) + smooth последний viewport.
  // Эффект «приземления» виден всегда независимо от distance.
  describe('twoPhase mode (v0.95.18)', () => {
    it('distance > viewport + twoPhase → instant prelude + smooth последний viewport', () => {
      el.scrollTop = 0
      el.clientHeight = 600
      const onComplete = vi.fn()
      // distance = 5000 (большой), но twoPhase активен → instant до 4400, потом smooth 600px
      smoothScrollTo(el, 5000, { duration: 300, twoPhase: true, onComplete })

      // После prelude (instant) — scrollTop = target - clientHeight = 4400
      expect(el.scrollTop).toBe(4400)
      // smooth-фаза только начинается. RAF поставлен.
      expect(rafCallbacks.length).toBe(1)

      // 50% → easeOutCubic(0.5) = 0.875 → smooth от 4400 на расстояние 600 → 4400 + 525 = 4925
      tick(150)
      expect(el.scrollTop).toBeCloseTo(4925, 0)

      // 100% → точно target
      tick(150)
      expect(el.scrollTop).toBe(5000)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('distance <= viewport + twoPhase → обычный smoothScroll без prelude', () => {
      el.scrollTop = 0
      el.clientHeight = 600
      // distance = 400 (меньше viewport) → prelude не нужен
      smoothScrollTo(el, 400, { duration: 300, twoPhase: true })

      // RAF поставлен сразу (no instant prelude)
      expect(rafCallbacks.length).toBe(1)
      // scrollTop ещё не двинулся (анимация не запустилась)
      expect(el.scrollTop).toBe(0)

      tick(300)
      expect(el.scrollTop).toBe(400)
    })

    it('twoPhase ОЧЕНЬ большая дистанция (50 viewport) → не падает на edge case 8 viewport', () => {
      el.scrollTop = 0
      el.clientHeight = 600
      const onComplete = vi.fn()
      // distance = 30000 (50 viewport). БЕЗ twoPhase было бы instant.
      // С twoPhase → instant до 29400, потом smooth 600.
      smoothScrollTo(el, 30000, { duration: 300, twoPhase: true, onComplete })

      expect(el.scrollTop).toBe(29400)  // instant prelude
      tick(300)  // smooth phase
      expect(el.scrollTop).toBe(30000)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('twoPhase + scroll вверх (target меньше startTop) → prelude target + viewport', () => {
      el.scrollTop = 5000
      el.clientHeight = 600
      // distance = -4800 (вверх), |distance| > viewport → prelude до 600 (target+viewport)
      smoothScrollTo(el, 0, { duration: 300, twoPhase: true })

      expect(el.scrollTop).toBe(600)  // target + clientHeight
      tick(300)
      expect(el.scrollTop).toBe(0)
    })

    it('twoPhase + distance < 1 → onComplete сразу (no-op)', () => {
      el.scrollTop = 100
      const onComplete = vi.fn()
      smoothScrollTo(el, 100.5, { twoPhase: true, onComplete })
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(rafCallbacks.length).toBe(0)
    })
  })
})

describe('prefersReducedMotion', () => {
  it('возвращает false если window.matchMedia не доступен', () => {
    const original = globalThis.window
    globalThis.window = {}
    expect(prefersReducedMotion()).toBe(false)
    globalThis.window = original
  })

  it('возвращает true если matchMedia реакция matches=true', () => {
    const originalMatch = globalThis.window?.matchMedia
    if (globalThis.window) {
      globalThis.window.matchMedia = vi.fn(() => ({ matches: true }))
      expect(prefersReducedMotion()).toBe(true)
      globalThis.window.matchMedia = originalMatch
    }
  })
})
