// AISidebar.vitest.jsx — v1.2.456
//
// ПЕРВЫЙ тест ОТРИСОВКИ панели ИИ. До него панель проверялась только «по тексту кода»
// (страж в panelWidthCap.vitest.js читает исходник и смотрит, что там написано нужное).
// Разница принципиальная: страж не заметит, если правильное правило написано, но в готовую
// разметку не попало — например, его перебило другое правило ниже по списку.
//
// Что доказываем:
//   • потолок «не больше половины окна» реально доезжает до готовой разметки;
//   • ширина внешнего слоя — ПОСТОЯННОЕ число (иначе при изменении размера окна
//     запускался бы плавный переход и край панели ехал бы с отставанием — беда v1.2.455,
//     найденная собственным ревью и закрытая в v1.2.456);
//   • внутренний слой держит выражение с потолком (у него есть минимум ширины, а минимум
//     побеждает отдельный потолок — поэтому там нужен именно такой вид);
//   • скрытая панель схлопывается в ноль;
//   • панель сообщает измерителю раскладки, сколько точек она ПРОСИЛА.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import AISidebar from './AISidebar.jsx'

// Панель при появлении дёргает настройки и проверки провайдеров через мост в главный
// процесс. В тесте моста нет — подставляем пустой, чтобы ничего не падало.
beforeEach(() => {
  window.api = {
    invoke: () => Promise.resolve(null),
    send: () => {},
    on: () => {},
    off: () => {},
  }
})
afterEach(() => { cleanup(); try { delete window.api } catch { /* ок */ } })

function renderPanel(props = {}) {
  const { container } = render(
    <AISidebar
      settings={{ aiProvider: 'anthropic' }}
      onSettingsChange={() => {}}
      lastMessage={null}
      visible
      onToggle={() => {}}
      width={458}
      chatHistory={[]}
      {...props}
    />
  )
  const outer = container.querySelector('[data-cc-layout="ai-panel"]')
  return { container, outer, inner: outer && outer.firstElementChild }
}

describe('AISidebar — потолок ширины доезжает до готовой разметки (v1.2.456)', () => {
  it('панель вообще рисуется и помечена для измерителя раскладки', () => {
    const { outer } = renderPanel()
    expect(outer).toBeTruthy()
  })

  it('🔴 у внешнего слоя ширина ПОСТОЯННАЯ, а потолок — отдельным правилом', () => {
    const { outer } = renderPanel()
    const style = outer.getAttribute('style') || ''
    // Постоянное число: при изменении размера окна оно не меняется, значит плавный
    // переход по ширине не запускается и панель не едет за окном с отставанием.
    expect(style).toMatch(/width:\s*458px/)
    // Потолок «не больше половины окна» — отдельно, в переход не входит.
    expect(style).toMatch(/max-width:\s*50vw/)
    // И ширина НЕ содержит выражения с потолком (ровно это и вызывало отставание).
    expect(style).not.toMatch(/width:\s*min\(/)
  })

  it('внутренний слой держит выражение с потолком (у него минимум ширины)', () => {
    const { inner } = renderPanel()
    const style = inner.getAttribute('style') || ''
    expect(style).toMatch(/min\(458px,\s*50vw\)/)
    // Минимум задан тем же выражением — иначе он победил бы потолок и слой вылез бы
    // за внешний, получив обрезку (у внешнего «лишнее срезать»).
    expect(style).toMatch(/min-width:\s*min\(458px,\s*50vw\)/)
  })

  it('панель сообщает, сколько точек она ПРОСИЛА — по этому числу журнал покажет, сработал ли потолок', () => {
    const { outer } = renderPanel()
    expect(outer.getAttribute('data-cc-width-want')).toBe('458')
  })

  it('скрытая панель схлопывается в ноль, но потолок остаётся заданным', () => {
    const { outer } = renderPanel({ visible: false })
    const style = outer.getAttribute('style') || ''
    expect(style).toMatch(/width:\s*0px/)
    expect(style).toMatch(/max-width:\s*50vw/)
  })

  it('ширина не задана — берётся значение по умолчанию, разметка не ломается', () => {
    const { outer, inner } = renderPanel({ width: undefined })
    expect((outer.getAttribute('style') || '')).toMatch(/width:\s*300px/)
    expect((inner.getAttribute('style') || '')).toMatch(/min\(300px,\s*50vw\)/)
  })
})
