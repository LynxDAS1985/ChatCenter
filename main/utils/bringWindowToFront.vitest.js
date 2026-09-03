// Тест bringWindowToFront — подъём окна с сохранением «на весь экран».
// Проверяет ОБА случая потери maximize: окно СВЁРНУТО (restore) и окно в ТРЕЕ (подстраховка maximize).
import { describe, it, expect } from 'vitest'
import { bringWindowToFront } from './bringWindowToFront.js'

function makeWin(init) {
  const st = Object.assign({ minimized: false, visible: true, maximized: false, destroyed: false }, init)
  const calls = { restore: 0, show: 0, focus: 0, maximize: 0 }
  return {
    st, calls,
    isDestroyed: () => st.destroyed,
    isMinimized: () => st.minimized,
    isVisible: () => st.visible,
    isMaximized: () => st.maximized,
    restore() { calls.restore++; st.minimized = false; st.maximized = true; st.visible = true }, // restore → развёрнутое
    show() { calls.show++; st.visible = true },
    focus() { calls.focus++ },
    maximize() { calls.maximize++; st.maximized = true },
  }
}

describe('bringWindowToFront', () => {
  it('свёрнутое-развёрнутое (taskbar): restore() возвращает «на весь экран», maximize не нужен', () => {
    const w = makeWin({ minimized: true, visible: true, maximized: false })
    bringWindowToFront(w)
    expect(w.calls.restore).toBe(1)
    expect(w.calls.show).toBe(0)   // свёрнутое = visible=true → show не зовём
    expect(w.calls.focus).toBe(1)
    expect(w.calls.maximize).toBe(0) // restore уже развернул
    expect(w.st.maximized).toBe(true)
  })

  it('трей, show() СОХРАНЯЕТ maximize: подстраховка не нужна', () => {
    const w = makeWin({ minimized: false, visible: false, maximized: true })
    bringWindowToFront(w) // show() (по умолчанию) не трогает maximized → остаётся true
    expect(w.calls.show).toBe(1)
    expect(w.calls.maximize).toBe(0)
    expect(w.st.maximized).toBe(true)
  })

  it('трей, show() ПОТЕРЯЛ maximize (баг Windows): подстраховка maximize() срабатывает', () => {
    const w = makeWin({ minimized: false, visible: false, maximized: true })
    w.show = function () { w.calls.show++; w.st.visible = true; w.st.maximized = false } // Windows развернул в обычный
    bringWindowToFront(w)
    expect(w.calls.show).toBe(1)
    expect(w.calls.maximize).toBe(1) // подстраховка вернула «на весь экран»
    expect(w.st.maximized).toBe(true)
  })

  it('видимое-развёрнутое: только focus, ничего не разворачиваем/показываем', () => {
    const w = makeWin({ minimized: false, visible: true, maximized: true })
    bringWindowToFront(w)
    expect(w.calls.restore).toBe(0)
    expect(w.calls.show).toBe(0)
    expect(w.calls.focus).toBe(1)
    expect(w.calls.maximize).toBe(0)
  })

  it('видимое-обычное: не разворачиваем (не навязываем maximize)', () => {
    const w = makeWin({ minimized: false, visible: true, maximized: false })
    bringWindowToFront(w)
    expect(w.calls.maximize).toBe(0)
    expect(w.calls.focus).toBe(1)
  })

  it('уничтоженное окно — ничего не делаем, не падаем', () => {
    const w = makeWin({ destroyed: true })
    expect(() => bringWindowToFront(w)).not.toThrow()
    expect(w.calls.focus).toBe(0)
  })

  it('null — не падает', () => { expect(() => bringWindowToFront(null)).not.toThrow() })
})
