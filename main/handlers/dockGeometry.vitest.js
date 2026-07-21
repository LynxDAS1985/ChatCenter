// v1.2.91: юнит-тест чистого расчёта вертикали дока (computeDockTop).
// Ловит регрессию «полоска дока сползает вниз при add/remove» БЕЗ запуска Electron.
import { describe, it, expect } from 'vitest'
import { computeDockTop } from './dockGeometry.js'

describe('computeDockTop', () => {
  it('держит верх по стабильному якорю baselineTopY (не двигает по высоте)', () => {
    // Экран 864, рабочая область сверху 0. Якорь верха 768, высота 30 → должен вернуть 768.
    expect(computeDockTop({ baselineTopY: 768, currentTopY: 999, totalH: 30, workAreaTop: 0, screenBottom: 864 })).toBe(768)
  })

  it('РЕГРЕССИЯ: не сползает вниз при разной высоте окна (баг v1.2.89)', () => {
    // Раньше формула newY = bounds.y + bounds.height - totalH при bounds.y=814,
    // высоте окна 50 и контенте 30 давала 834 (вниз на 20). Теперь якорь верха 814 → 814.
    expect(computeDockTop({ baselineTopY: 814, currentTopY: 814, totalH: 30, workAreaTop: 0, screenBottom: 864 })).toBe(814)
  })

  it('фолбэк на текущую позицию, если якоря нет (null)', () => {
    expect(computeDockTop({ baselineTopY: null, currentTopY: 800, totalH: 30, workAreaTop: 0, screenBottom: 864 })).toBe(800)
  })

  it('фолбэк на текущую позицию, если якорь битый (NaN/undefined)', () => {
    expect(computeDockTop({ baselineTopY: undefined, currentTopY: 700, totalH: 30, workAreaTop: 0, screenBottom: 864 })).toBe(700)
    expect(computeDockTop({ baselineTopY: NaN, currentTopY: 710, totalH: 30, workAreaTop: 0, screenBottom: 864 })).toBe(710)
  })

  it('кламп: не ниже низа экрана (низ полоски не уходит за экран)', () => {
    // Якорь 850, высота 30 → низ 880 > 864 → поднять до 864-30=834.
    expect(computeDockTop({ baselineTopY: 850, currentTopY: 850, totalH: 30, workAreaTop: 0, screenBottom: 864 })).toBe(834)
  })

  it('кламп: не выше рабочей области (верхняя граница важнее)', () => {
    // Якорь -100 (за верхом) → поднять до workAreaTop=40.
    expect(computeDockTop({ baselineTopY: -100, currentTopY: -100, totalH: 30, workAreaTop: 40, screenBottom: 864 })).toBe(40)
  })

  it('можно держать НА панели задач (низ ровно у низа экрана — v1.2.82)', () => {
    // Якорь так, что низ = низу экрана: 834+30=864 → без клампа, 834.
    expect(computeDockTop({ baselineTopY: 834, currentTopY: 834, totalH: 30, workAreaTop: 0, screenBottom: 864 })).toBe(834)
  })

  it('не падает на битой геометрии (все не-числа) — возвращает 0/фолбэк', () => {
    const r = computeDockTop({ baselineTopY: null, currentTopY: NaN, totalH: NaN, workAreaTop: NaN, screenBottom: NaN })
    expect(Number.isFinite(r)).toBe(true)
  })
})
