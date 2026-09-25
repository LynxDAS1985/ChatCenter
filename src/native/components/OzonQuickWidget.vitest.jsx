// v1.2.409: страж видимости плавающего виджета Ozon (OzonQuickWidget).
// Жалоба: «в собранной (свежеустановленной) версии виджета нет». Диагноз (по коду):
//   - пока позиция не задана, виджет = невидимый нулевой div (OzonQuickWidget.jsx: `if (!pos) return ...`)
//   - на первом запуске (пустой localStorage) позиция ставится в правый нижний угол, а сам док полупрозрачный
//     (opacity 0.5) → узкий док в углу легко не заметить.
// Эти тесты доказывают: (1) на СВЕЖЕЙ установке (пустой localStorage) виджет всё равно рисует реальный док
// с 3 разделами (не остаётся невидимым); (2) на первом запуске он НЕ тусклый; (3) при сохранённой позиции и
// отсутствии новых — тусклый, как и раньше (поведение существующих пользователей не сломали).

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import OzonQuickWidget from './OzonQuickWidget.jsx'

const LS_KEY = 'ccOzonWidgetPos3'

beforeEach(() => { try { localStorage.clear() } catch { /* нет хранилища в среде теста — ок */ } })
afterEach(() => { cleanup(); try { localStorage.clear() } catch { /* ок */ } })

function renderWidget(unread = { msg: 0, qa: 0, rv: 0 }) {
  return render(
    <OzonQuickWidget messengerId="ozon" webviewRefs={{ current: {} }} unread={unread} loading={false} />
  )
}

// главный контейнер дока — div с border-radius:24 (см. OzonQuickWidget.jsx render). Ищем по инлайн-стилю.
function findDock(container) {
  return Array.from(container.querySelectorAll('div')).find(
    d => /border-radius:\s*24px/.test(d.getAttribute('style') || '')
  )
}

describe('OzonQuickWidget — виден на свежей установке (v1.2.409)', () => {
  it('пустой localStorage (первый запуск) → рисует док с 3 разделами, а НЕ невидимый нулевой div', () => {
    const { container } = renderWidget()
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(3) // Сообщения / Вопросы / Отзывы
    const titles = Array.from(buttons).map(b => b.getAttribute('title') || '')
    expect(titles.some(t => /Отзывы/.test(t))).toBe(true)
  })

  it('первый запуск (нет сохранённой позиции, новых нет) → виджет НЕ тусклый (opacity 1)', () => {
    const { container } = renderWidget()
    const dock = findDock(container)
    expect(dock).toBeTruthy()
    expect(dock.getAttribute('style') || '').toMatch(/opacity:\s*1\b/)
  })

  it('есть сохранённая позиция + новых нет → виджет тусклый (opacity 0.5), поведение как раньше', () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ x: 40, y: 40 })) } catch { /* ок */ }
    const { container } = renderWidget()
    const dock = findDock(container)
    expect(dock).toBeTruthy()
    expect(dock.getAttribute('style') || '').toMatch(/opacity:\s*0\.5/)
  })

  it('есть новые (rv>0) → значок числа на кнопке «Отзывы» показывается', () => {
    const { container } = renderWidget({ msg: 0, qa: 0, rv: 3 })
    // бейдж числа — красный кружок с текстом «3» внутри кнопки Отзывы
    expect(container.textContent).toContain('3')
  })
})

// v1.2.503: просьба пользователя (2026-09-25) — «видеть последние 50, а если больше, писать 50+».
// У остальных значков программы (вкладки мессенджеров, боковой рейл) предел остаётся 99 — в кабинете
// продавца счёт идёт не по чатам, а по отзывам и вопросам, там сотни, и точная цифра выше полусотни
// работе не помогает. Предел и правило — в shared/ozonSections.js (ozonBadgeText).
describe('OzonQuickWidget — предел числа на значке: 50, дальше «50+» (v1.2.503)', () => {
  it('[!] ровно 50 → точное число (граница НЕ должна превращаться в «50+»)', () => {
    const { container } = renderWidget({ msg: 0, qa: 0, rv: 50 })
    expect(container.textContent).toContain('50')
    expect(container.textContent).not.toContain('50+')
  })

  it('[!] 51 и больше → «50+», а не точное число', () => {
    const { container } = renderWidget({ msg: 0, qa: 0, rv: 51 })
    expect(container.textContent).toContain('50+')
    expect(container.textContent).not.toContain('51')
  })

  it('[!] старый предел 99 на значках Ozon больше не действует', () => {
    const { container } = renderWidget({ msg: 0, qa: 0, rv: 120 })
    expect(container.textContent).toContain('50+')
    expect(container.textContent).not.toContain('99+')
  })

  it('подпись при наведении говорит то же, что значок', () => {
    const { container } = renderWidget({ msg: 0, qa: 0, rv: 120 })
    const titles = Array.from(container.querySelectorAll('button')).map(b => b.getAttribute('title') || '')
    expect(titles.some(t => /Отзывы · 50\+ новых/.test(t))).toBe(true)
  })

  it('значки Сообщений и Вопросов живут по тому же правилу', () => {
    const { container } = renderWidget({ msg: 77, qa: 12, rv: 0 })
    expect(container.textContent).toContain('50+')  // Сообщения
    expect(container.textContent).toContain('12')   // Вопросы — точное число
  })
})
