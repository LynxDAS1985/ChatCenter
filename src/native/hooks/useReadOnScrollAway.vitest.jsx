// v0.87.47: тесты для Варианта 2 — два IntersectionObserver (center + away).
// Логика Seen: msg пересекает центральную полосу viewport (rootMargin -49%/-49%).
// Логика Read: msg ушёл выше viewport (rect.bottom < rootBounds.top) + был seen.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useReadOnScrollAway } from './useReadOnScrollAway.js'

// Мок IntersectionObserver с возможностью триггерить events вручную
let observerInstances = []
class MockIntersectionObserver {
  constructor(cb, opts) {
    this.cb = cb
    this.opts = opts
    this.observed = null
    observerInstances.push(this)
  }
  observe(el) { this.observed = el }
  disconnect() {}
  trigger(entry) { this.cb([entry]) }
}

beforeEach(() => {
  observerInstances = []
  globalThis.IntersectionObserver = MockIntersectionObserver
})

function setup() {
  const onRead = vi.fn()
  const onSeen = vi.fn()
  renderHook(() => {
    const elementRef = useRef({ tagName: 'DIV' })
    useReadOnScrollAway({ elementRef, onRead, onSeen, enabled: true })
  })
  // observerInstances[0] = seen observer (с rootMargin)
  // observerInstances[1] = read observer (без rootMargin)
  return {
    onRead, onSeen,
    obs: { seen: observerInstances[0], read: observerInstances[1] },
  }
}

describe('useReadOnScrollAway — Вариант 2 (center + away)', () => {
  it('создаёт ДВА observer (seen + read)', () => {
    setup()
    expect(observerInstances.length).toBe(2)
  })

  it('seen observer имеет rootMargin -49%/-49% (полоса в центре viewport)', () => {
    const { obs } = setup()
    expect(obs.seen.opts.rootMargin).toBe('-49% 0px -49% 0px')
    expect(obs.seen.opts.threshold).toBe(0)
  })

  it('read observer БЕЗ rootMargin (обычный viewport)', () => {
    const { obs } = setup()
    expect(obs.read.opts.rootMargin).toBeUndefined()
    expect(obs.read.opts.threshold).toBe(0)
  })

  it('msg пересёк центральную полосу → SEEN', () => {
    const { onSeen, obs } = setup()
    obs.seen.trigger({ isIntersecting: true })
    expect(onSeen).toHaveBeenCalledTimes(1)
  })

  it('msg в viewport но НЕ в центре → НЕ seen', () => {
    const { onSeen, obs } = setup()
    // seen-observer с rootMargin -49%/-49% видит msg только когда он в центре.
    // Если msg выше или ниже центра → isIntersecting=false для этого observer.
    obs.seen.trigger({ isIntersecting: false })
    expect(onSeen).not.toHaveBeenCalled()
  })

  it('был seen + ушёл выше viewport → READ', () => {
    const { onRead, obs } = setup()
    obs.seen.trigger({ isIntersecting: true })
    obs.read.trigger({
      isIntersecting: false,
      boundingClientRect: { bottom: -50 },
      rootBounds: { top: 0 },
    })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('НЕ seen + ушёл выше viewport → НЕ read (промелькнул мимо центра)', () => {
    const { onRead, obs } = setup()
    // seen observer ни разу не фаернулся — msg не проходил через центр
    obs.read.trigger({
      isIntersecting: false,
      boundingClientRect: { bottom: -50 },
      rootBounds: { top: 0 },
    })
    expect(onRead).not.toHaveBeenCalled()
  })

  it('seen + msg ушёл ВНИЗ (bottom > rootTop) → НЕ read', () => {
    const { onRead, obs } = setup()
    obs.seen.trigger({ isIntersecting: true })
    // Msg ушёл ниже viewport (scroll назад) — bottom остался положительным
    obs.read.trigger({
      isIntersecting: false,
      boundingClientRect: { bottom: 800 },
      rootBounds: { top: 0 },
    })
    expect(onRead).not.toHaveBeenCalled()
  })

  it('onRead вызывается ТОЛЬКО ОДИН РАЗ', () => {
    const { onRead, obs } = setup()
    obs.seen.trigger({ isIntersecting: true })
    obs.read.trigger({ isIntersecting: false, boundingClientRect: { bottom: -50 }, rootBounds: { top: 0 } })
    obs.read.trigger({ isIntersecting: false, boundingClientRect: { bottom: -100 }, rootBounds: { top: 0 } })
    obs.read.trigger({ isIntersecting: false, boundingClientRect: { bottom: -150 }, rootBounds: { top: 0 } })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('onSeen вызывается ТОЛЬКО ОДИН РАЗ', () => {
    const { onSeen, obs } = setup()
    obs.seen.trigger({ isIntersecting: true })
    obs.seen.trigger({ isIntersecting: true })
    obs.seen.trigger({ isIntersecting: true })
    expect(onSeen).toHaveBeenCalledTimes(1)
  })

  it('v0.87.47 РЕГРЕССИЯ: длинный msg (height > viewport) помечается read ⭐', () => {
    // Сценарий из жалобы пользователя (чат "Автовоз"):
    // Msg высотой 1500px в viewport 570px → ratio максимум 570/1500 = 0.38 < 0.95.
    // Старая логика v0.87.43 (ratio>=0.95) НЕ срабатывала → seen=false → read=false.
    // Новая логика (msg пересёк центр): при прокрутке msg проходит через
    // центральную полосу → isIntersecting=true для seen-observer → seen=true.
    const { onRead, onSeen, obs } = setup()
    // Фаза 1: msg вошёл в центральную полосу (любой msg крупнее 2% viewport = 11px это сделает)
    obs.seen.trigger({ isIntersecting: true })
    expect(onSeen).toHaveBeenCalled()
    // Фаза 2: юзер прокрутил дальше → msg ушёл выше
    obs.read.trigger({ isIntersecting: false, boundingClientRect: { bottom: -10 }, rootBounds: { top: 0 } })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('v0.87.43 защита: msg появился в viewport при открытии но НЕ в центре', () => {
    // Сценарий: initial render показывает 10 msg в viewport.
    // Msg которые ВЫШЕ или НИЖЕ центра — seen observer вернёт isIntersecting=false.
    // Только msg в центральной полосе 2% viewport → seen.
    const { onRead, onSeen, obs } = setup()
    obs.seen.trigger({ isIntersecting: false })
    // Даже если такой msg вдруг ушёл выше (например scroll-programmatic)
    obs.read.trigger({ isIntersecting: false, boundingClientRect: { bottom: -50 }, rootBounds: { top: 0 } })
    expect(onSeen).not.toHaveBeenCalled()
    expect(onRead).not.toHaveBeenCalled()
  })

  it('rootBounds undefined (safety fallback) → rootTop=0', () => {
    const { onRead, obs } = setup()
    obs.seen.trigger({ isIntersecting: true })
    // Некоторые браузеры/полифиллы могут не давать rootBounds
    obs.read.trigger({ isIntersecting: false, boundingClientRect: { bottom: -50 } })
    // bottom=-50 < rootTop=0 → read
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('enabled=false → observers не создаются', () => {
    renderHook(() => {
      const elementRef = useRef({ tagName: 'DIV' })
      useReadOnScrollAway({ elementRef, onRead: vi.fn(), onSeen: vi.fn(), enabled: false })
    })
    expect(observerInstances.length).toBe(0)
  })
})
