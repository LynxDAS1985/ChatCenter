// v0.95.40: тесты useStickyBottomOnMedia — ResizeObserver удерживает scroll
// у низа при lazy-load медиа.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useStickyBottomOnMedia } from './useStickyBottomOnMedia.js'

let roCallbacks = []
let roInstance

beforeEach(() => {
  roCallbacks = []
  roInstance = null
  globalThis.ResizeObserver = vi.fn(function (cb) {
    roCallbacks.push(cb)
    roInstance = this
    this.observe = vi.fn()
    this.disconnect = vi.fn()
    return this
  })
})

function setupScrollEl(initialScrollHeight) {
  const el = {
    scrollHeight: initialScrollHeight,
    scrollTop: 0,
    clientHeight: 600,
  }
  return el
}

function triggerResize() {
  return new Promise((resolve) => {
    roCallbacks.forEach(cb => cb())
    requestAnimationFrame(() => resolve())
  })
}

describe('useStickyBottomOnMedia (v0.95.40)', () => {
  it('атBottom=true + scrollHeight вырос → el.scrollTop = scrollHeight', async () => {
    const el = setupScrollEl(1000)
    const scrollRef = { current: el }
    const atBottomRef = { current: true }
    renderHook(() => useStickyBottomOnMedia(scrollRef, atBottomRef))
    // Имитируем lazy-load картинки — высота выросла
    el.scrollHeight = 1500
    await triggerResize()
    expect(el.scrollTop).toBe(1500)
  })

  it('атBottom=false → НЕ трогает scroll (юзер крутит вверх)', async () => {
    const el = setupScrollEl(1000)
    el.scrollTop = 200
    const scrollRef = { current: el }
    const atBottomRef = { current: false }
    renderHook(() => useStickyBottomOnMedia(scrollRef, atBottomRef))
    el.scrollHeight = 1500
    await triggerResize()
    expect(el.scrollTop).toBe(200)  // не изменился
  })

  it('изменение высоты < 4px → no-op (font baseline и пр.)', async () => {
    const el = setupScrollEl(1000)
    el.scrollTop = 100
    const scrollRef = { current: el }
    const atBottomRef = { current: true }
    renderHook(() => useStickyBottomOnMedia(scrollRef, atBottomRef))
    el.scrollHeight = 1002  // +2px только
    await triggerResize()
    expect(el.scrollTop).toBe(100)  // не изменился
  })

  it('disconnect ResizeObserver при unmount', () => {
    const el = setupScrollEl(1000)
    const scrollRef = { current: el }
    const atBottomRef = { current: true }
    const { unmount } = renderHook(() => useStickyBottomOnMedia(scrollRef, atBottomRef))
    expect(roInstance.observe).toHaveBeenCalledWith(el)
    unmount()
    expect(roInstance.disconnect).toHaveBeenCalled()
  })

  it('scrollRef.current = null → no-op (нет наблюдения)', () => {
    const scrollRef = { current: null }
    const atBottomRef = { current: true }
    expect(() => {
      renderHook(() => useStickyBottomOnMedia(scrollRef, atBottomRef))
    }).not.toThrow()
  })

  it('Throttle через rAF — 2 быстрых resize → 1 scroll update', async () => {
    const el = setupScrollEl(1000)
    const scrollRef = { current: el }
    const atBottomRef = { current: true }
    renderHook(() => useStickyBottomOnMedia(scrollRef, atBottomRef))
    el.scrollHeight = 1500
    roCallbacks.forEach(cb => cb())
    el.scrollHeight = 2000
    roCallbacks.forEach(cb => cb())
    await new Promise(r => requestAnimationFrame(r))
    // Только последнее значение применилось (rAF batches)
    expect(el.scrollTop).toBe(2000)
  })
})
