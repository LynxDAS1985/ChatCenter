// v0.95.44: тесты useUploadProgress + formatBytes.

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUploadProgress, formatBytes } from './useUploadProgress.js'

describe('useUploadProgress (v0.95.44)', () => {
  it('пустой/undefined uploads → 0% / hasActive=false', () => {
    const r1 = renderHook(() => useUploadProgress(undefined))
    expect(r1.result.current).toEqual({ percent: 0, active: 0, hasActive: false, uploaded: 0, total: 0 })
    const r2 = renderHook(() => useUploadProgress({}))
    expect(r2.result.current.hasActive).toBe(false)
  })

  it('один upload 50% → percent: 50', () => {
    const r = renderHook(() => useUploadProgress({
      'f1': { uploaded: 500, total: 1000, percent: 50 },
    }))
    expect(r.result.current).toEqual({
      percent: 50, active: 1, hasActive: true, uploaded: 500, total: 1000,
    })
  })

  it('два upload — суммируем uploaded и total', () => {
    const r = renderHook(() => useUploadProgress({
      'f1': { uploaded: 300, total: 1000 },
      'f2': { uploaded: 700, total: 2000 },
    }))
    expect(r.result.current.uploaded).toBe(1000)
    expect(r.result.current.total).toBe(3000)
    expect(r.result.current.percent).toBe(33)  // floor(1000/3000*100)
    expect(r.result.current.active).toBe(2)
  })

  it('clamp percent на 100% если uploaded > total', () => {
    const r = renderHook(() => useUploadProgress({
      'f1': { uploaded: 1500, total: 1000 },
    }))
    expect(r.result.current.percent).toBe(100)
  })

  it('total=0 → percent=0 (защита от деления на 0)', () => {
    const r = renderHook(() => useUploadProgress({
      'f1': { uploaded: 0, total: 0 },
    }))
    expect(r.result.current.percent).toBe(0)
    expect(r.result.current.hasActive).toBe(true)  // запись есть, но total=0
  })

  it('невалидные значения → не падает', () => {
    const r = renderHook(() => useUploadProgress({
      'f1': { uploaded: null, total: undefined },
      'f2': null,
    }))
    expect(() => r.result.current).not.toThrow()
    expect(r.result.current.percent).toBe(0)
  })
})

describe('formatBytes (v0.95.44)', () => {
  it('< 1 КБ → байты', () => {
    expect(formatBytes(0)).toBe('0 Б')
    expect(formatBytes(512)).toBe('512 Б')
  })

  it('< 1 МБ → КБ', () => {
    expect(formatBytes(1024)).toBe('1.0 КБ')
    expect(formatBytes(102400)).toBe('100.0 КБ')
  })

  it('< 1 ГБ → МБ', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 МБ')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 МБ')
  })

  it('>= 1 ГБ → ГБ', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 ГБ')
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 ГБ')
  })

  it('null/undefined → "0 Б"', () => {
    expect(formatBytes(null)).toBe('0 Б')
    expect(formatBytes(undefined)).toBe('0 Б')
  })
})
