// v0.89.18: тесты safeHideTransparentWindow + restoreMouseEvents.
//
// Зачем эти helper'ы: BrowserWindow с `transparent: true` + `frame: false` на
// Windows 11 после `.hide()` может оставить невидимый hit-test регион,
// перехватывающий клики. Решение — `setIgnoreMouseEvents(true)` +
// уведение за экран в 1×1 ПЕРЕД `.hide()`. См. шапку модуля
// `main/utils/transparentWindowGuard.js`.

import { describe, it, expect, vi } from 'vitest'
import {
  safeHideTransparentWindow,
  restoreMouseEvents,
  __test,
} from '../../main/utils/transparentWindowGuard.js'

// Мок BrowserWindow с шпионами на методы
function makeMockWindow({ destroyed = false } = {}) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    setIgnoreMouseEvents: vi.fn(),
    setBounds: vi.fn(),
    hide: vi.fn(),
  }
}

describe('safeHideTransparentWindow', () => {
  it('вызывает три шага в правильном порядке: setIgnoreMouseEvents(true) → setBounds(offscreen) → hide()', () => {
    const win = makeMockWindow()
    const calls = []
    win.setIgnoreMouseEvents.mockImplementation((v) => calls.push(['setIgnoreMouseEvents', v]))
    win.setBounds.mockImplementation((b) => calls.push(['setBounds', b]))
    win.hide.mockImplementation(() => calls.push(['hide']))

    const result = safeHideTransparentWindow(win)

    expect(result).toBe(true)
    expect(calls).toEqual([
      ['setIgnoreMouseEvents', true],
      ['setBounds', __test.OFFSCREEN_BOUNDS],
      ['hide'],
    ])
  })

  it('offscreen bounds — за пределами экрана и размер 1×1', () => {
    expect(__test.OFFSCREEN_BOUNDS.x).toBeLessThan(-10000)
    expect(__test.OFFSCREEN_BOUNDS.y).toBeLessThan(-10000)
    expect(__test.OFFSCREEN_BOUNDS.width).toBe(1)
    expect(__test.OFFSCREEN_BOUNDS.height).toBe(1)
  })

  it('null окно → false, не падает', () => {
    expect(safeHideTransparentWindow(null)).toBe(false)
    expect(safeHideTransparentWindow(undefined)).toBe(false)
  })

  it('isDestroyed=true → false, ничего не вызывает', () => {
    const win = makeMockWindow({ destroyed: true })
    expect(safeHideTransparentWindow(win)).toBe(false)
    expect(win.setIgnoreMouseEvents).not.toHaveBeenCalled()
    expect(win.setBounds).not.toHaveBeenCalled()
    expect(win.hide).not.toHaveBeenCalled()
  })

  it('окно без setIgnoreMouseEvents (нестандартное) — продолжает работу', () => {
    const win = makeMockWindow()
    delete win.setIgnoreMouseEvents
    expect(safeHideTransparentWindow(win)).toBe(true)
    expect(win.setBounds).toHaveBeenCalled()
    expect(win.hide).toHaveBeenCalled()
  })

  it('окно без setBounds — продолжает работу', () => {
    const win = makeMockWindow()
    delete win.setBounds
    expect(safeHideTransparentWindow(win)).toBe(true)
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    expect(win.hide).toHaveBeenCalled()
  })

  it('окно без hide() — возвращает true, не падает', () => {
    const win = makeMockWindow()
    delete win.hide
    expect(safeHideTransparentWindow(win)).toBe(true)
  })

  it('окно без isDestroyed — работает (некоторые тесты передают чистый mock)', () => {
    const win = { setIgnoreMouseEvents: vi.fn(), setBounds: vi.fn(), hide: vi.fn() }
    expect(safeHideTransparentWindow(win)).toBe(true)
    expect(win.hide).toHaveBeenCalled()
  })

  it('hide() кидает исключение → возвращает false, не падает', () => {
    const win = makeMockWindow()
    win.hide.mockImplementation(() => { throw new Error('boom') })
    expect(safeHideTransparentWindow(win)).toBe(false)
  })

  it('setBounds кидает — возвращает false, не падает', () => {
    const win = makeMockWindow()
    win.setBounds.mockImplementation(() => { throw new Error('boom') })
    expect(safeHideTransparentWindow(win)).toBe(false)
  })

  it('setIgnoreMouseEvents кидает — возвращает false, не падает', () => {
    const win = makeMockWindow()
    win.setIgnoreMouseEvents.mockImplementation(() => { throw new Error('boom') })
    expect(safeHideTransparentWindow(win)).toBe(false)
  })

  it('isDestroyed() кидает — возвращает false, не падает', () => {
    const win = makeMockWindow()
    win.isDestroyed.mockImplementation(() => { throw new Error('boom') })
    expect(safeHideTransparentWindow(win)).toBe(false)
  })
})

describe('restoreMouseEvents', () => {
  it('вызывает setIgnoreMouseEvents(false)', () => {
    const win = makeMockWindow()
    restoreMouseEvents(win)
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(false)
  })

  it('null/undefined → не падает', () => {
    expect(() => restoreMouseEvents(null)).not.toThrow()
    expect(() => restoreMouseEvents(undefined)).not.toThrow()
  })

  it('isDestroyed=true → ничего не вызывает', () => {
    const win = makeMockWindow({ destroyed: true })
    restoreMouseEvents(win)
    expect(win.setIgnoreMouseEvents).not.toHaveBeenCalled()
  })

  it('окно без setIgnoreMouseEvents — не падает', () => {
    const win = makeMockWindow()
    delete win.setIgnoreMouseEvents
    expect(() => restoreMouseEvents(win)).not.toThrow()
  })

  it('setIgnoreMouseEvents кидает — не падает', () => {
    const win = makeMockWindow()
    win.setIgnoreMouseEvents.mockImplementation(() => { throw new Error('boom') })
    expect(() => restoreMouseEvents(win)).not.toThrow()
  })
})

// v0.89.19: регрессия вынесена в src/__tests__/transparentWindowGuard.test.cjs
// — этот .cjs тест ВСЕГДА запускается в pre-commit (vitest триггерится только
// на .jsx/.vitest.* изменениях, .js файлы проходили мимо).
