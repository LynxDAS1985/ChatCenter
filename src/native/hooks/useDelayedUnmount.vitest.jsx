// v0.95.8: тесты для useDelayedUnmount — задержка реального unmount под exit-анимацию.
//
// Контракты:
// 1. visible=true initial → mounted=true, leaving=false
// 2. visible=false → leaving=true сразу, mounted=true до delay → unmount
// 3. visible→true во время leaving → snap back (cancel timer)
// 4. visible=false initial → mounted=false, leaving=false
// 5. Cleanup на unmount хука → timer не зависает

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useDelayedUnmount from './useDelayedUnmount.js'

describe('useDelayedUnmount — exit animation timing', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('visible=true initial → mounted=true, leaving=false', () => {
    const { result } = renderHook(() => useDelayedUnmount(true, 220))
    expect(result.current.mounted).toBe(true)
    expect(result.current.leaving).toBe(false)
  })

  it('visible=false initial → mounted=false, leaving=false', () => {
    const { result } = renderHook(() => useDelayedUnmount(false, 220))
    expect(result.current.mounted).toBe(false)
    expect(result.current.leaving).toBe(false)
  })

  it('visible true→false → leaving=true сразу, mounted=true до delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDelayedUnmount(v, 220), {
      initialProps: { v: true },
    })
    expect(result.current.mounted).toBe(true)
    rerender({ v: false })
    expect(result.current.mounted).toBe(true)
    expect(result.current.leaving).toBe(true)
    // Прошло меньше delay — всё ещё mounted
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current.mounted).toBe(true)
    expect(result.current.leaving).toBe(true)
    // Прошло > delay — unmount
    act(() => { vi.advanceTimersByTime(150) })
    expect(result.current.mounted).toBe(false)
    expect(result.current.leaving).toBe(false)
  })

  it('visible false→true во время leaving → snap back, timer отменён', () => {
    const { result, rerender } = renderHook(({ v }) => useDelayedUnmount(v, 220), {
      initialProps: { v: true },
    })
    rerender({ v: false })
    expect(result.current.leaving).toBe(true)
    // Прерываем — visible снова true
    act(() => { vi.advanceTimersByTime(100) })
    rerender({ v: true })
    expect(result.current.mounted).toBe(true)
    expect(result.current.leaving).toBe(false)
    // Пропускаем оставшееся время — НЕ должно unmount
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current.mounted).toBe(true)
    expect(result.current.leaving).toBe(false)
  })

  it('cleanup на unmount хука → timer не зависает', () => {
    const { rerender, unmount } = renderHook(({ v }) => useDelayedUnmount(v, 220), {
      initialProps: { v: true },
    })
    rerender({ v: false })
    unmount()
    // Если бы timer не очистился, vi.advanceTimers вызвал бы setState на unmounted хук
    expect(() => { act(() => { vi.advanceTimersByTime(500) }) }).not.toThrow()
  })

  it('custom delayMs работает', () => {
    const { result, rerender } = renderHook(({ v }) => useDelayedUnmount(v, 500), {
      initialProps: { v: true },
    })
    rerender({ v: false })
    act(() => { vi.advanceTimersByTime(220) })
    // При delay=500 после 220мс всё ещё leaving
    expect(result.current.mounted).toBe(true)
    expect(result.current.leaving).toBe(true)
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current.mounted).toBe(false)
  })
})
