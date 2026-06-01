// v0.95.25: тесты decodeWaveform для TDLib voice waveform.

import { describe, it, expect } from 'vitest'
import { decodeWaveform } from './voiceWaveform.js'

describe('decodeWaveform — TDLib voice waveform decoder (v0.95.25)', () => {
  it('null / undefined / empty → []', () => {
    expect(decodeWaveform(null)).toEqual([])
    expect(decodeWaveform(undefined)).toEqual([])
    expect(decodeWaveform('')).toEqual([])
    expect(decodeWaveform(new Uint8Array(0))).toEqual([])
  })

  it('Uint8Array → массив амплитуд 0..1', () => {
    // 5 байт = 40 бит = 8 sample'ов
    // Заполним все биты 1 → каждый 5-битный sample = 0x1F = 31 (max)
    const bytes = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
    const result = decodeWaveform(bytes, 8)
    expect(result).toHaveLength(8)
    // Все 1.0 (31/31)
    for (const val of result) {
      expect(val).toBe(1)
    }
  })

  it('массив нулей → массив амплитуд 0', () => {
    const bytes = new Uint8Array([0, 0, 0, 0, 0])
    const result = decodeWaveform(bytes, 8)
    expect(result).toHaveLength(8)
    for (const val of result) {
      expect(val).toBe(0)
    }
  })

  it('массив чисел работает как Uint8Array', () => {
    const result = decodeWaveform([0xFF, 0xFF, 0xFF, 0xFF, 0xFF], 4)
    expect(result).toHaveLength(4)
    expect(result.every(v => v >= 0 && v <= 1)).toBe(true)
  })

  it('base64-строка декодируется', () => {
    // base64('AAAAAAA=') = 5 нулевых байт → 0..0
    const result = decodeWaveform('AAAAAAA=', 4)
    expect(result).toHaveLength(4)
    expect(result.every(v => v === 0)).toBe(true)
  })

  it('targetCount: возвращает ровно N столбиков', () => {
    const bytes = new Uint8Array(63).fill(0x80)  // 63 байта, ~100 sample'ов
    expect(decodeWaveform(bytes, 50)).toHaveLength(50)
    expect(decodeWaveform(bytes, 100)).toHaveLength(100)
    expect(decodeWaveform(bytes, 10)).toHaveLength(10)
  })

  it('default targetCount = 50', () => {
    const bytes = new Uint8Array(63).fill(0xAA)
    expect(decodeWaveform(bytes)).toHaveLength(50)
  })

  it('амплитуды в диапазоне [0, 1]', () => {
    const bytes = new Uint8Array(63)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) & 0xFF  // псевдо-рандом
    const result = decodeWaveform(bytes, 50)
    for (const val of result) {
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThanOrEqual(1)
    }
  })

  it('upsample короткой записи (1 sample → 10)', () => {
    // 1 байт = 8 бит = 1 sample (5 бит)
    const bytes = new Uint8Array([0xF8])  // 0xF8 = 11111000 → первые 5 бит = 11111 = 31
    const result = decodeWaveform(bytes, 10)
    expect(result).toHaveLength(10)
    expect(result.every(v => v === 1)).toBe(true)
  })

  it('downsample длинной записи (200 sample → 50)', () => {
    const bytes = new Uint8Array(125).fill(0x42)  // ~200 sample'ов
    const result = decodeWaveform(bytes, 50)
    expect(result).toHaveLength(50)
    expect(result.every(v => v >= 0 && v <= 1)).toBe(true)
  })

  it('невалидный base64 → []', () => {
    expect(decodeWaveform('not-valid-base64!!')).toEqual([])
  })

  it('число / объект → []', () => {
    expect(decodeWaveform(42)).toEqual([])
    expect(decodeWaveform({})).toEqual([])
    expect(decodeWaveform(true)).toEqual([])
  })

  it('реальный сценарий: 63 байта от TDLib → 50 столбиков для UI', () => {
    // TDLib обычно отдаёт 63-64 байта (~100 sample'ов)
    const bytes = new Uint8Array(63)
    // Заполним псевдо-голосовой паттерн (нарастание+спад)
    for (let i = 0; i < bytes.length; i++) {
      const t = i / bytes.length
      const amp = Math.sin(t * Math.PI) * 31
      bytes[i] = Math.round(amp) & 0xFF
    }
    const result = decodeWaveform(bytes, 50)
    expect(result).toHaveLength(50)
    expect(result.every(v => v >= 0 && v <= 1)).toBe(true)
  })
})
