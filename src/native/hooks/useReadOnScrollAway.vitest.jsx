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

function setup(root = null) {
  const onRead = vi.fn()
  const onSeen = vi.fn()
  renderHook(() => {
    const elementRef = useRef({ tagName: 'DIV' })
    useReadOnScrollAway({ elementRef, onRead, onSeen, enabled: true, root, msgId: 'test-1' })
  })
  return { onRead, onSeen, obs: observerInstances[0] }
}

describe('useReadOnScrollAway - root-aware reading line', () => {
  it('creates one observer using the middle reading line', () => {
    const root = { tagName: 'SCROLLER' }
    setup(root)
    expect(observerInstances.length).toBe(1)
    expect(observerInstances[0].opts.root).toBe(root)
    expect(observerInstances[0].opts.rootMargin).toBe('-48% 0px -48% 0px')
    expect(observerInstances[0].opts.threshold).toBe(0)
  })

  it('does not mark an initially visible message as read on chat open', () => {
    const { onRead, obs } = setup()
    obs.trigger({ isIntersecting: true, rootBounds: { top: 100 }, boundingClientRect: { bottom: 150 } })
    expect(onRead).not.toHaveBeenCalled()
  })

  it('marks an initially visible message read after it leaves the reading line upward', () => {
    const { onRead, obs } = setup()
    obs.trigger({ isIntersecting: true, rootBounds: { top: 100 }, boundingClientRect: { bottom: 150 } })
    obs.trigger({ isIntersecting: false, rootBounds: { top: 100 }, boundingClientRect: { bottom: 90 } })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('marks a hidden message only after it crosses and then leaves the reading line', () => {
    const { onRead, onSeen, obs } = setup()
    obs.trigger({ isIntersecting: false, rootBounds: { top: 100 }, boundingClientRect: { bottom: 300 } })
    obs.trigger({ isIntersecting: true, rootBounds: { top: 100 }, boundingClientRect: { bottom: 140 } })
    expect(onSeen).toHaveBeenCalledTimes(1)
    expect(onRead).not.toHaveBeenCalled()
    obs.trigger({ isIntersecting: false, rootBounds: { top: 100 }, boundingClientRect: { bottom: 90 } })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('does not mark read when the message leaves downward', () => {
    const { onRead, obs } = setup()
    obs.trigger({ isIntersecting: false, rootBounds: { top: 100 }, boundingClientRect: { bottom: 300 } })
    obs.trigger({ isIntersecting: true, rootBounds: { top: 100 }, boundingClientRect: { bottom: 140 } })
    obs.trigger({ isIntersecting: false, rootBounds: { top: 100 }, boundingClientRect: { bottom: 300 } })
    expect(onRead).not.toHaveBeenCalled()
  })

  it('fires read only once', () => {
    const { onRead, obs } = setup()
    obs.trigger({ isIntersecting: false, rootBounds: { top: 100 }, boundingClientRect: { bottom: 300 } })
    obs.trigger({ isIntersecting: true, rootBounds: { top: 100 }, boundingClientRect: { bottom: 140 } })
    obs.trigger({ isIntersecting: false, rootBounds: { top: 100 }, boundingClientRect: { bottom: 90 } })
    obs.trigger({ isIntersecting: true, rootBounds: { top: 100 }, boundingClientRect: { bottom: 140 } })
    obs.trigger({ isIntersecting: false, rootBounds: { top: 100 }, boundingClientRect: { bottom: 90 } })
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('enabled=false does not create observer', () => {
    renderHook(() => {
      const elementRef = useRef({ tagName: 'DIV' })
      useReadOnScrollAway({ elementRef, onRead: vi.fn(), onSeen: vi.fn(), enabled: false })
    })
    expect(observerInstances.length).toBe(0)
  })
})
