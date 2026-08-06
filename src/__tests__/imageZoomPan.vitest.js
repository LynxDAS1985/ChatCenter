// v1.2.197: тесты чистой математики зума/перемещения превью фото (imageZoomPan.js).
// Логика вынесена из PhotoSendModal.jsx именно чтобы её МОЖНО было проверить без DOM
// (happy-dom не считает layout). Геометрия передаётся аргументами.
import { describe, it, expect } from 'vitest'
import {
  MIN_SCALE, MAX_SCALE, clampScale, wheelScale, stepScale, zoomToPoint, resetTransform, nextRotation,
  clampOffset, fitSize,
} from '../native/utils/imageZoomPan.js'

describe('imageZoomPan — clampScale', () => {
  it('держит масштаб в границах 1..8', () => {
    expect(clampScale(0.1)).toBe(MIN_SCALE)   // ниже фита не опускаемся
    expect(clampScale(0.5)).toBe(1)
    expect(clampScale(4)).toBe(4)
    expect(clampScale(99)).toBe(MAX_SCALE)
  })
  it('мусор → MIN_SCALE', () => {
    expect(clampScale(NaN)).toBe(MIN_SCALE)
    expect(clampScale(undefined)).toBe(MIN_SCALE)
  })
})

describe('imageZoomPan — колесо и кнопки', () => {
  it('колесо вверх (deltaY<0) приближает, вниз — отдаляет', () => {
    expect(wheelScale(2, -100)).toBeGreaterThan(2)   // приблизили
    expect(wheelScale(2, 100)).toBeLessThan(2)        // отдалили
  })
  it('колесо не выходит за границы', () => {
    expect(wheelScale(1, 100)).toBe(MIN_SCALE)        // на фите отдалять некуда
    expect(wheelScale(8, -100)).toBe(MAX_SCALE)       // на максимуме приближать некуда
  })
  it('кнопки ±0.25 с клампом', () => {
    expect(stepScale(2, 1)).toBeCloseTo(2.25)
    expect(stepScale(2, -1)).toBeCloseTo(1.75)
    expect(stepScale(1, -1)).toBe(MIN_SCALE)          // ниже 100% нельзя
    expect(stepScale(8, 1)).toBe(MAX_SCALE)
  })
})

describe('imageZoomPan — zoomToPoint (точка под курсором остаётся на месте)', () => {
  // Инвариант: экранная координата точки = imgCoord*scale + offset. Проверяем, что
  // после зума точка (cx) остаётся на той же экранной позиции.
  it('точка под курсором не «уезжает» при приближении', () => {
    const before = { scale: 1, x: 0, y: 0 }
    const cx = 100, cy = 0
    // imgCoord точки под курсором ДО: (cx - x)/scale = (100-0)/1 = 100
    const imgCoord = (cx - before.x) / before.scale
    const after = zoomToPoint(before, 2, cx, cy)
    expect(after.scale).toBe(2)
    // экранная позиция ПОСЛЕ: imgCoord*newScale + x' должна равняться cx
    expect(imgCoord * after.scale + after.x).toBeCloseTo(cx)
    // конкретно: x' = 100 - (100-0)*2 = -100
    expect(after.x).toBeCloseTo(-100)
  })
  it('при отдалении точка тоже держится', () => {
    const before = { scale: 4, x: -300, y: 0 }
    const cx = 100, cy = 50
    const imgX = (cx - before.x) / before.scale
    const imgY = (cy - before.y) / before.scale
    const after = zoomToPoint(before, 2, cx, cy)
    expect(imgX * after.scale + after.x).toBeCloseTo(cx)
    expect(imgY * after.scale + after.y).toBeCloseTo(cy)
  })
  it('если масштаб не изменился — сдвиг не трогаем', () => {
    const s = { scale: 2, x: 5, y: 7 }
    const after = zoomToPoint(s, 2, 100, 100)
    expect(after).toEqual({ scale: 2, x: 5, y: 7 })
  })
})

describe('imageZoomPan — reset и поворот', () => {
  it('reset возвращает 100% и центр', () => {
    expect(resetTransform()).toEqual({ scale: 1, x: 0, y: 0 })
  })
  it('поворот идёт по 90° и зацикливается', () => {
    expect(nextRotation(0)).toBe(90)
    expect(nextRotation(90)).toBe(180)
    expect(nextRotation(270)).toBe(0)
    expect(nextRotation(undefined)).toBe(90)
  })
})

describe('imageZoomPan — clampOffset (#2: не утащить за край)', () => {
  it('картинка больше окна → сдвиг ограничен половиной разницы', () => {
    // content 1000×200, окно 400×400 → maxX=(1000-400)/2=300, maxY=0
    expect(clampOffset(500, 30, 1000, 200, 400, 400)).toEqual({ x: 300, y: 0 })
    expect(clampOffset(-500, 0, 1000, 200, 400, 400)).toEqual({ x: -300, y: 0 })
    expect(clampOffset(100, 0, 1000, 200, 400, 400)).toEqual({ x: 100, y: 0 }) // внутри — не трогаем
  })
  it('картинка меньше/равна окну → сдвиг обнуляется (по центру)', () => {
    expect(clampOffset(50, 50, 300, 300, 400, 400)).toEqual({ x: 0, y: 0 })
  })
  it('мусорный сдвиг → 0', () => {
    expect(clampOffset(NaN, undefined, 1000, 1000, 400, 400)).toEqual({ x: 0, y: 0 })
  })
})

describe('imageZoomPan — fitSize (вписать в окно)', () => {
  it('широкая картинка ограничена по ширине окна', () => {
    // 2000×1000 (шире окна 400×400) → ширина=400, высота=200
    expect(fitSize(2000, 1000, 400, 400)).toEqual({ w: 400, h: 200 })
  })
  it('высокая картинка ограничена по высоте окна', () => {
    // 1000×2000 → высота=400, ширина=200
    expect(fitSize(1000, 2000, 400, 400)).toEqual({ w: 200, h: 400 })
  })
  it('нет размеров → возвращает окно', () => {
    expect(fitSize(0, 0, 400, 300)).toEqual({ w: 400, h: 300 })
  })
})
