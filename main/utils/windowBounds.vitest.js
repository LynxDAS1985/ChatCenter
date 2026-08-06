// v1.2.202: тесты «памяти окна» (windowBounds.js) — восстановление размеров/позиции +
// состояния «развёрнуто на весь экран» + защита от ухода за экран. Логика вынесена из
// windowManager.js именно чтобы её можно было проверить без Electron.
import { describe, it, expect } from 'vitest'
import { isBoundsVisible, buildSavedBounds, restorePlan } from './windowBounds.js'

// Один экран 1536×816 (типичный при 125% масштабе), рабочая область без панели задач.
const screen1 = [{ workArea: { x: 0, y: 0, width: 1536, height: 816 } }]
// Два экрана: основной + второй справа.
const screen2 = [
  { workArea: { x: 0, y: 0, width: 1536, height: 816 } },
  { workArea: { x: 1536, y: 0, width: 1920, height: 1080 } },
]

describe('windowBounds — isBoundsVisible', () => {
  it('окно внутри экрана → видно', () => {
    expect(isBoundsVisible({ x: 100, y: 100, width: 1000, height: 600 }, screen1)).toBe(true)
  })
  it('развёрнутое окно (−7,−7) → видно (пересекается)', () => {
    expect(isBoundsVisible({ x: -7, y: -7, width: 1541, height: 821 }, screen1)).toBe(true)
  })
  it('окно на втором мониторе → видно, если он есть', () => {
    expect(isBoundsVisible({ x: 1600, y: 100, width: 800, height: 600 }, screen2)).toBe(true)
  })
  it('окно за пределами экранов (второй монитор отключили) → НЕ видно', () => {
    expect(isBoundsVisible({ x: 1600, y: 100, width: 800, height: 600 }, screen1)).toBe(false)
  })
  it('нет x/y (первый запуск) → не видно', () => {
    expect(isBoundsVisible({ width: 1400, height: 900 }, screen1)).toBe(false)
  })
  it('нет экранов → не видно (защита)', () => {
    expect(isBoundsVisible({ x: 0, y: 0, width: 100, height: 100 }, [])).toBe(false)
  })
})

describe('windowBounds — buildSavedBounds', () => {
  it('обычное окно → сохраняем текущий размер, флаг false', () => {
    const r = buildSavedBounds({
      isMaximized: false,
      normalBounds: { x: 1, y: 1, width: 1, height: 1 },
      bounds: { x: 50, y: 20, width: 1200, height: 700 },
    })
    expect(r).toEqual({ x: 50, y: 20, width: 1200, height: 700, isMaximized: false })
  })
  it('развёрнутое окно → сохраняем ОБЫЧНЫЙ размер (getNormalBounds), флаг true', () => {
    const r = buildSavedBounds({
      isMaximized: true,
      normalBounds: { x: 80, y: 40, width: 1280, height: 720 },
      bounds: { x: -7, y: -7, width: 1541, height: 821 }, // развёрнутый — НЕ должен попасть
    })
    expect(r).toEqual({ x: 80, y: 40, width: 1280, height: 720, isMaximized: true })
  })
  it('нет данных → безопасный объект с флагом false', () => {
    expect(buildSavedBounds({}).isMaximized).toBe(false)
  })
})

describe('windowBounds — restorePlan', () => {
  it('видимое обычное окно → размеры/позиция берутся, разворот false', () => {
    const p = restorePlan({ x: 56, y: 20, width: 1456, height: 784, isMaximized: false }, screen1)
    expect(p).toEqual({ width: 1456, height: 784, x: 56, y: 20, maximize: false })
  })
  it('сохранено «развёрнуто» → maximize:true, размеры обычные', () => {
    const p = restorePlan({ x: 80, y: 40, width: 1280, height: 720, isMaximized: true }, screen1)
    expect(p.maximize).toBe(true)
    expect(p.width).toBe(1280)
    expect(p.x).toBe(80)
  })
  it('позиция вне экранов → x/y НЕ задаются (окно по центру)', () => {
    const p = restorePlan({ x: 5000, y: 5000, width: 1200, height: 700 }, screen1)
    expect(p.x).toBeUndefined()
    expect(p.y).toBeUndefined()
    expect(p.width).toBe(1200) // размер всё равно сохраняется
  })
  it('первый запуск (нет сохранённого) → размеры по умолчанию, без позиции и разворота', () => {
    const p = restorePlan(null, screen1)
    expect(p).toEqual({ width: 1400, height: 900, x: undefined, y: undefined, maximize: false })
  })
})
