// v0.87.43: тесты для Вариант 5 — двойной IntersectionObserver seen+away
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
  const { result } = renderHook(() => {
    const elementRef = useRef({ tagName: 'DIV' })  // фейковый DOM node
    useReadOnScrollAway({ elementRef, onRead, onSeen, enabled: true })
    return elementRef
  })
  return { onRead, onSeen, obs: observerInstances[0] }
}

describe('useReadOnScrollAway — Вариант 5 (seen + scroll-away)', () => {
  it('msg появился в viewport (ratio=0.5) — НЕ seen, НЕ read', () => {
    const { onRead, onSeen, obs } = setup()
    obs.trigger({ intersectionRatio: 0.5, isIntersecting: true, boundingClientRect: { bottom: 200 } })
    expect(onSeen).not.toHaveBeenCalled()
    expect(onRead).not.toHaveBeenCalled()
  })

  it('msg полностью в viewport (ratio=1.0) — SEEN, но не read', () => {
    const { onRead, onSeen, obs } = setup()
    obs.trigger({ intersectionRatio: 1.0, isIntersecting: true, boundingClientRect: { bottom: 500 } })
    expect(onSeen).toHaveBeenCalledTimes(1)
    expect(onRead).not.toHaveBeenCalled()
  })

  it('msg был seen → ушёл выше viewport (bottom < 0) — READ', () => {
    const { onRead, onSeen, obs } = setup()
    // Фаза 1: полностью виден
    obs.trigger({ intersectionRatio: 1.0, isIntersecting: true, boundingClientRect: { bottom: 300 } })
    expect(onSeen).toHaveBeenCalled()
    // Фаза 2: ушёл выше
    obs.trigger({ intersectionRatio: 0, isIntersecting: false, boundingClientRect: { bottom: -50 } })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('msg промелькнул (fast scroll) — НЕ seen → НЕ read', () => {
    const { onRead, onSeen, obs } = setup()
    // Не набрал 95% — например ratio 0.3 → ratio 0 (ушёл вверх)
    obs.trigger({ intersectionRatio: 0.3, isIntersecting: true, boundingClientRect: { bottom: 100 } })
    obs.trigger({ intersectionRatio: 0, isIntersecting: false, boundingClientRect: { bottom: -50 } })
    expect(onSeen).not.toHaveBeenCalled()
    expect(onRead).not.toHaveBeenCalled()  // ⭐ ключевой тест — промелькнувшее НЕ помечается
  })

  it('msg ушёл вниз (bottom > viewportHeight, не вверх) — НЕ read', () => {
    const { onRead, obs } = setup()
    obs.trigger({ intersectionRatio: 1.0, isIntersecting: true, boundingClientRect: { bottom: 300 } })
    // Ушёл ВНИЗ (scroll назад): bottom остался положительным
    obs.trigger({ intersectionRatio: 0, isIntersecting: false, boundingClientRect: { bottom: 800 } })
    expect(onRead).not.toHaveBeenCalled()
  })

  it('onRead вызывается ТОЛЬКО ОДИН РАЗ (не повторяется)', () => {
    const { onRead, obs } = setup()
    obs.trigger({ intersectionRatio: 1.0, isIntersecting: true, boundingClientRect: { bottom: 300 } })
    obs.trigger({ intersectionRatio: 0, isIntersecting: false, boundingClientRect: { bottom: -50 } })
    obs.trigger({ intersectionRatio: 0, isIntersecting: false, boundingClientRect: { bottom: -100 } })
    obs.trigger({ intersectionRatio: 0, isIntersecting: false, boundingClientRect: { bottom: -150 } })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('onSeen вызывается ТОЛЬКО ОДИН РАЗ (не повторяется)', () => {
    const { onSeen, obs } = setup()
    obs.trigger({ intersectionRatio: 1.0, isIntersecting: true, boundingClientRect: { bottom: 300 } })
    obs.trigger({ intersectionRatio: 1.0, isIntersecting: true, boundingClientRect: { bottom: 310 } })
    obs.trigger({ intersectionRatio: 1.0, isIntersecting: true, boundingClientRect: { bottom: 320 } })
    expect(onSeen).toHaveBeenCalledTimes(1)
  })

  it('threshold [0, 0.95] настроен правильно', () => {
    const { obs } = setup()
    expect(obs.opts.threshold).toEqual([0, 0.95])
  })

  it('v0.87.43 РЕГРЕССИЯ: открытие чата с 22 msg в viewport, юзер не скроллил', () => {
    // Сценарий: 10 bubbles видны на 50% (частично) при initial-scroll
    const results = []
    for (let i = 0; i < 10; i++) {
      const { onRead, obs } = setup()
      // Все msg видны частично (50%), не полностью
      obs.trigger({ intersectionRatio: 0.5, isIntersecting: true, boundingClientRect: { bottom: 400 } })
      results.push({ read: onRead.mock.calls.length })
    }
    const totalRead = results.reduce((sum, r) => sum + r.read, 0)
    // Старая логика: все 10 помечены (threshold 0.15)
    // Новая логика: НИ ОДНО не помечено (нет 95%, нет ухода вверх)
    expect(totalRead).toBe(0)
  })
})
