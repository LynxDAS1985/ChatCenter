// v0.89.18: тесты safeHideTransparentWindow.
// v0.89.22: УДАЛЕНЫ тесты restoreMouseEvents — функция удалена (см. шапку
// transparentWindowGuard.js, ловушка #21 в mistakes/notifications-ribbon.md).
//
// Зачем safeHide: BrowserWindow с `transparent: true` + `frame: false` на
// Windows 11 после `.hide()` может оставить невидимый hit-test регион,
// перехватывающий клики. Решение — увод за экран в 1×1 размер ПЕРЕД `.hide()`.
// БЕЗ setIgnoreMouseEvents (нарушает ловушку #27 — block drag region).

import { describe, it, expect, vi } from 'vitest'
import {
  safeHideTransparentWindow,
  __test,
} from '../../main/utils/transparentWindowGuard.js'

// Мок BrowserWindow с шпионами на методы
function makeMockWindow({ destroyed = false } = {}) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    setBounds: vi.fn(),
    hide: vi.fn(),
  }
}

describe('safeHideTransparentWindow', () => {
  it('вызывает два шага в правильном порядке: setBounds(offscreen) → hide()', () => {
    const win = makeMockWindow()
    const calls = []
    win.setBounds.mockImplementation((b) => calls.push(['setBounds', b]))
    win.hide.mockImplementation(() => calls.push(['hide']))

    const result = safeHideTransparentWindow(win)

    expect(result).toBe(true)
    expect(calls).toEqual([
      ['setBounds', __test.OFFSCREEN_BOUNDS],
      ['hide'],
    ])
  })

  it('НЕ вызывает setIgnoreMouseEvents (ловушка #27 — блокирует drag)', () => {
    // Регрессия: setIgnoreMouseEvents в v0.89.18 ломал pin/dock drag.
    // В v0.89.22 удалён. Если кто-то вернёт — тест упадёт.
    const setIgnoreMouseEvents = vi.fn()
    const win = {
      isDestroyed: vi.fn(() => false),
      setIgnoreMouseEvents,
      setBounds: vi.fn(),
      hide: vi.fn(),
    }
    safeHideTransparentWindow(win)
    expect(setIgnoreMouseEvents).not.toHaveBeenCalled()
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
    expect(win.setBounds).not.toHaveBeenCalled()
    expect(win.hide).not.toHaveBeenCalled()
  })

  it('окно без setBounds — продолжает работу (hide всё равно вызывается)', () => {
    const win = makeMockWindow()
    delete win.setBounds
    expect(safeHideTransparentWindow(win)).toBe(true)
    expect(win.hide).toHaveBeenCalled()
  })

  it('окно без hide() — возвращает true, не падает', () => {
    const win = makeMockWindow()
    delete win.hide
    expect(safeHideTransparentWindow(win)).toBe(true)
  })

  it('окно без isDestroyed — работает (некоторые тесты передают чистый mock)', () => {
    const win = { setBounds: vi.fn(), hide: vi.fn() }
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

  it('isDestroyed() кидает — возвращает false, не падает', () => {
    const win = makeMockWindow()
    win.isDestroyed.mockImplementation(() => { throw new Error('boom') })
    expect(safeHideTransparentWindow(win)).toBe(false)
  })
})

// v0.89.19: регрессия sweep вынесена в src/__tests__/transparentWindowGuard.test.cjs
// — этот .cjs тест ВСЕГДА запускается в pre-commit (vitest триггерится только
// на .jsx/.vitest.* изменениях, .js файлы проходили мимо).
