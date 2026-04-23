// v0.87.51: тесты для новой логики "msg появился в viewport → прочитан".
// Один IntersectionObserver с threshold=0 + initial-guard от mass-read при открытии.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useReadOnScrollAway } from './useReadOnScrollAway.js'

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
  globalThis.window.api = { send: vi.fn(), invoke: vi.fn(), on: vi.fn(() => () => {}) }
})

function setup() {
  const onRead = vi.fn()
  const onSeen = vi.fn()
  renderHook(() => {
    const elementRef = useRef({ tagName: 'DIV' })
    useReadOnScrollAway({ elementRef, onRead, onSeen, enabled: true, msgId: 'test-1' })
  })
  return { onRead, onSeen, obs: observerInstances[0] }
}

describe('useReadOnScrollAway v0.87.51 — threshold=0 + initial-guard', () => {
  it('создаётся ОДИН observer с threshold=0', () => {
    setup()
    expect(observerInstances.length).toBe(1)
    expect(observerInstances[0].opts.threshold).toBe(0)
  })

  it('⭐ РЕГРЕССИЯ open-chat: msg УЖЕ в viewport при открытии → НЕ read', () => {
    const { onRead, obs } = setup()
    // Первый callback сразу после observe() — msg уже виден (initial state)
    obs.trigger({ isIntersecting: true })
    expect(onRead).not.toHaveBeenCalled()
  })

  it('msg появился из-за скролла (был скрыт, стал виден) → READ', () => {
    const { onRead, obs } = setup()
    // Initial: msg скрыт
    obs.trigger({ isIntersecting: false })
    expect(onRead).not.toHaveBeenCalled()
    // Юзер прокрутил → msg появился
    obs.trigger({ isIntersecting: true })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('msg initially visible → ушёл → появился снова → READ (юзер вернулся, читает)', () => {
    const { onRead, obs } = setup()
    obs.trigger({ isIntersecting: true })   // initial visible — initial-guard сбрасывается
    obs.trigger({ isIntersecting: false })  // ушёл
    obs.trigger({ isIntersecting: true })   // появился опять — READ (юзер повторно смотрит)
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('⭐ onSeen и onRead — оба вызываются одновременно при появлении', () => {
    const { onRead, onSeen, obs } = setup()
    obs.trigger({ isIntersecting: false })  // initial hidden
    obs.trigger({ isIntersecting: true })   // появился
    expect(onSeen).toHaveBeenCalledTimes(1)
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('enabled=false — observer не создаётся', () => {
    renderHook(() => {
      const elementRef = useRef({ tagName: 'DIV' })
      useReadOnScrollAway({ elementRef, onRead: vi.fn(), onSeen: vi.fn(), enabled: false })
    })
    expect(observerInstances.length).toBe(0)
  })

  it('многократный trigger isIntersecting=true — onRead только ОДИН раз', () => {
    const { onRead, obs } = setup()
    obs.trigger({ isIntersecting: false })  // initial hidden
    obs.trigger({ isIntersecting: true })
    obs.trigger({ isIntersecting: true })
    obs.trigger({ isIntersecting: true })
    expect(onRead).toHaveBeenCalledTimes(1)
  })
})
