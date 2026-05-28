// v0.95.2: гистерезис «у низа» (Schmitt trigger) — фикс мигания кнопки ↓.
// Раньше один порог <80 → колебание bottomGap 60-100 давало тоггл atBottom → кнопка мигала.
import { describe, it, expect } from 'vitest'
import { computeNearBottom } from './useInboxScroll.js'

describe('computeNearBottom — гистерезис против дребезга', () => {
  it('prev=null (первый замер) — единый порог 80', () => {
    expect(computeNearBottom(50, null)).toBe(true)
    expect(computeNearBottom(80, null)).toBe(false)
    expect(computeNearBottom(100, null)).toBe(false)
  })

  it('prev=true (в atBottom) — выходим только при bottomGap > 120', () => {
    expect(computeNearBottom(50, true)).toBe(true)    // глубоко внизу
    expect(computeNearBottom(100, true)).toBe(true)   // в полосе 40-120 — НЕ выходим (фикс мигания)
    expect(computeNearBottom(119, true)).toBe(true)
    expect(computeNearBottom(120, true)).toBe(false)  // только тут выходим
    expect(computeNearBottom(200, true)).toBe(false)
  })

  it('prev=false (не у низа) — входим в atBottom только при bottomGap < 40', () => {
    expect(computeNearBottom(200, false)).toBe(false) // далеко от низа
    expect(computeNearBottom(80, false)).toBe(false)  // в полосе 40-120 — НЕ входим
    expect(computeNearBottom(40, false)).toBe(false)
    expect(computeNearBottom(39, false)).toBe(true)   // только тут входим
    expect(computeNearBottom(0, false)).toBe(true)
  })

  it('реальный сценарий дребезга 60-100 — НЕ переключаемся', () => {
    // После входа в atBottom (был <40) bottomGap колеблется 60-100 от мелких ремаунтов.
    // С гистерезисом — остаёмся в atBottom (мигания нет). Старый код переключал каждый раз.
    let prev = true
    for (const gap of [64, 105, 48, 92, 55, 110, 70, 85]) {
      const next = computeNearBottom(gap, prev)
      expect(next).toBe(true)  // все < 120 → остаёмся в atBottom
      prev = next
    }
  })
})
