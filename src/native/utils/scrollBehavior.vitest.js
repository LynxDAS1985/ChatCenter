// v0.95.6: тесты computeScrollBehavior — порог 5 viewport'ов между instant и smooth.
//
// Главные контракты (регрессионная защита):
// 1. Большая дельта (юзер далеко от низа) → 'instant' (нет 5-10сек smooth-анимации)
// 2. Малая дельта (юзер близко) → 'smooth' (приятный плавный jump)
// 3. Нулевая/отрицательная дельта → 'smooth' (юзер уже внизу, no-op)
// 4. Кривые входные данные → 'smooth' fallback (не упадём)

import { describe, it, expect } from 'vitest'
import { computeScrollBehavior } from './scrollBehavior.js'

describe('computeScrollBehavior — Telegram-style instant/smooth switch (v0.95.6)', () => {
  it('малая дельта (1 viewport) → smooth', () => {
    expect(computeScrollBehavior(800, 800)).toBe('smooth')
  })

  it('средняя дельта (3 viewport) → smooth', () => {
    expect(computeScrollBehavior(2400, 800)).toBe('smooth')
  })

  it('пороговая дельта (5 viewport) → smooth (граница, не превышает)', () => {
    expect(computeScrollBehavior(4000, 800)).toBe('smooth')
  })

  it('чуть выше порога (5+ viewport) → instant', () => {
    expect(computeScrollBehavior(4001, 800)).toBe('instant')
  })

  it('очень большая дельта (50 viewport — например 619 непрочитанных) → instant', () => {
    expect(computeScrollBehavior(40000, 800)).toBe('instant')
  })

  it('нулевая дельта (юзер уже внизу) → smooth (no-op scroll)', () => {
    expect(computeScrollBehavior(0, 800)).toBe('smooth')
  })

  it('отрицательная дельта (странный случай) → smooth (fallback)', () => {
    expect(computeScrollBehavior(-100, 800)).toBe('smooth')
  })

  it('clientHeight = 0 (DOM не готов) → smooth (fallback)', () => {
    expect(computeScrollBehavior(5000, 0)).toBe('smooth')
  })

  it('NaN / undefined входные данные → smooth (защита)', () => {
    expect(computeScrollBehavior(NaN, 800)).toBe('smooth')
    expect(computeScrollBehavior(undefined, 800)).toBe('smooth')
    expect(computeScrollBehavior(1000, NaN)).toBe('smooth')
    expect(computeScrollBehavior(1000, undefined)).toBe('smooth')
  })

  it('реальный сценарий: chat с 619 непрочитанными, ~50000px от низа → instant', () => {
    const viewport = 720
    const farFromBottom = 50000
    expect(computeScrollBehavior(farFromBottom, viewport)).toBe('instant')
  })

  it('реальный сценарий: юзер пролистал 1 экран вверх → smooth', () => {
    const viewport = 720
    const oneScreenUp = 720
    expect(computeScrollBehavior(oneScreenUp, viewport)).toBe('smooth')
  })
})
