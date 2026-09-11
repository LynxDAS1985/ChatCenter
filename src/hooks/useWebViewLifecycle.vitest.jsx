// useWebViewLifecycle.vitest.jsx — v1.2.457
//
// ЖАЛОБА (11 сентября 2026): «дёргание при переключении между мессенджерами».
//
// ПРИЧИНА (доказана чтением кода): при открытии веб-вкладки приложение НАРОЧНО меняет
// геометрию страницы — на миг делает её уже на 1 точку и возвращает обратно. Это «пинок
// раскладки»: он расклеивает адаптивный сайт, который при первой отрисовке прочитал
// неверный размер (из-за этого когда-то чернел веб-МАКС). Беда в том, что пинок делался
// на КАЖДОЕ открытие вкладки и ДВАЖДЫ (через 200 и 700 мс) — то есть при каждом
// переключении картинка дважды за секунду перекладывалась.
//
// ЧТО ЗАКРЕПЛЯЮТ ЭТИ ПРОВЕРКИ:
//   • первое открытие вкладки пинок ПОЛУЧАЕТ (защита от слипшейся раскладки жива);
//   • повторное открытие той же вкладки — НЕ получает (дёргания при переключении нет);
//   • нативная вкладка («Общий чат») не пинается никогда — это не веб-страница;
//   • ширина всегда возвращается обратно (пинок не оставляет страницу ужатой).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import useWebViewLifecycle from './useWebViewLifecycle.js'

// Поддельная вкладка: нам важны только обёртка, её ширина и записи в стиль.
function makeTab() {
  const writes = []
  const wrap = {
    getBoundingClientRect: () => ({ width: 800 }),
    style: {
      _w: '',
      set width(v) { this._w = v; writes.push(v) },
      get width() { return this._w },
    },
  }
  return { el: { parentElement: wrap }, wrap, writes }
}

let rafSpy
beforeEach(() => {
  vi.useFakeTimers()
  // Кадры отрисовки выполняем сразу — иначе возврат ширины не произойдёт в тесте.
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((fn) => { fn(); return 1 })
  window.api = { send: () => {}, invoke: () => Promise.resolve(null) }
})
afterEach(() => {
  vi.useRealTimers()
  rafSpy.mockRestore()
  try { delete window.api } catch { /* ок */ }
})

function mount(activeId, webviewRefs, messengers) {
  return renderHook(
    ({ id }) => useWebViewLifecycle({
      activeId: id, messengers, appReady: true, webviewRefs, setActiveId: () => {},
    }),
    { initialProps: { id: activeId } }
  )
}

const WEB = [{ id: 'tg', isNative: false }, { id: 'max', isNative: false }, { id: 'native_cc', isNative: true }]

describe('пинок раскладки при открытии веб-вкладки (v1.2.457)', () => {
  it('ПЕРВОЕ открытие вкладки — пинок делается (защита от слипшейся раскладки жива)', () => {
    const tab = makeTab()
    const refs = { current: { tg: tab.el } }
    mount('tg', refs, WEB)
    vi.advanceTimersByTime(1000)
    // Ширину сузили на 1 точку и вернули (пустая строка = «убрать своё значение»).
    expect(tab.writes).toContain('799px')
    expect(tab.writes[tab.writes.length - 1]).toBe('')
  })

  it('🔴 ГЛАВНОЕ: повторное открытие той же вкладки пинка НЕ даёт — нет дёргания', () => {
    const tab = makeTab()
    const refs = { current: { tg: tab.el, max: makeTab().el } }
    const { rerender } = mount('tg', refs, WEB)
    vi.advanceTimersByTime(1000)
    const afterFirst = tab.writes.length
    expect(afterFirst).toBeGreaterThan(0)

    // Ушли на другую вкладку и вернулись — раньше тут был второй заход пинков.
    rerender({ id: 'max' })
    vi.advanceTimersByTime(1000)
    rerender({ id: 'tg' })
    vi.advanceTimersByTime(1000)
    expect(tab.writes.length).toBe(afterFirst)
  })

  it('ушли с вкладки раньше, чем пинок закончился → в следующий раз пинок будет', () => {
    // Отметка «уже пинали» ставится только после ПОВТОРА (700 мс). Если пользователь
    // ушёл раньше, первый показ мог и не состояться — лучше пнуть ещё раз.
    const tab = makeTab()
    const refs = { current: { tg: tab.el, max: makeTab().el } }
    const { rerender } = mount('tg', refs, WEB)
    vi.advanceTimersByTime(300)      // успел только первый пинок
    const afterPartial = tab.writes.length
    rerender({ id: 'max' })
    vi.advanceTimersByTime(1000)
    rerender({ id: 'tg' })
    vi.advanceTimersByTime(1000)
    expect(tab.writes.length).toBeGreaterThan(afterPartial)
  })

  it('нативная вкладка («Общий чат») не пинается вовсе — это не веб-страница', () => {
    const tab = makeTab()
    const refs = { current: { native_cc: tab.el } }
    mount('native_cc', refs, WEB)
    vi.advanceTimersByTime(1000)
    expect(tab.writes).toEqual([])
  })

  it('вкладки ещё нет в окне — молчим, без падения', () => {
    const refs = { current: {} }
    expect(() => { mount('tg', refs, WEB); vi.advanceTimersByTime(1000) }).not.toThrow()
  })

  it('вкладка нулевой ширины (спрятана) — не пинаем, пинать нечего', () => {
    const tab = makeTab()
    tab.wrap.getBoundingClientRect = () => ({ width: 0 })
    const refs = { current: { tg: tab.el } }
    mount('tg', refs, WEB)
    vi.advanceTimersByTime(1000)
    expect(tab.writes).toEqual([])
  })
})
