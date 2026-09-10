// v1.2.449: знак приложения в шапке окна (CcMark) + защита от расхождения копий.
//
// 🔴 ЗАЧЕМ: одна и та же геометрия знака нарисована в ТРЁХ местах — файл иконки
// (`shared/appIconMark.js`, из него делаются .ico и значок трея), стартовая заставка
// (`index.html`, обычный html — импортировать оттуда нельзя) и заставка загрузки чатов
// (у неё своя анимация полос, поэтому общий вид ей не подходит). Копии — это риск:
// поправят цифру в одном месте, и знак в шапке разъедется со значком в панели задач.
// Этот тест сверяет ЧИСЛА во всех копиях с единым источником.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import CcMark from '../components/CcMark.jsx'
// v1.2.451: толщина линий тоже берётся из единого источника — сверяем её, а не только геометрию
import { weights, MARK } from '../../shared/appIconMark.js'

const source = readFileSync('shared/appIconMark.js', 'utf8')
const num = (re, name) => {
  const m = source.match(re)
  expect(m, 'не нашёл в shared/appIconMark.js: ' + name).toBeTruthy()
  return m
}

describe('Знак приложения в шапке окна', () => {
  it('рисуется: три полосы, пузырь и хвостик', () => {
    const { container } = render(<CcMark size={18} title="ЦентрЧатов" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('viewBox')).toBe('0 0 64 64')
    expect(svg.getAttribute('width')).toBe('18')
    expect(container.querySelectorAll('path').length).toBe(4)   // 3 полосы + хвостик
    expect(container.querySelectorAll('rect').length).toBe(1)   // пузырь
    expect(container.querySelector('title').textContent).toBe('ЦентрЧатов')
  })

  it('без подписи знак скрыт от чтения вслух (это украшение, а не смысл)', () => {
    const { container } = render(<CcMark size={14} />)
    expect(container.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('title')).toBe(null)
  })

  it('🔴 ЛОВУШКА: геометрия в шапке совпадает с единым источником иконки', () => {
    const markup = readFileSync('src/components/CcMark.jsx', 'utf8')
    // полосы: y=18/32/46 от x=3 до x=17
    num(/const BARS = \[\{ y: 18 \}, \{ y: 32 \}, \{ y: 46 \}\]/, 'BARS')
    num(/const BAR_X0 = 3, BAR_X1 = 17/, 'BAR_X0/BAR_X1')
    for (const y of [18, 32, 46]) expect(markup, 'полоса y=' + y).toContain(`d="M3 ${y} H17"`)
    // пузырь: 22,10 размером 38×34, скругление 11
    num(/const BUB = \{ x: 22, y: 10, w: 38, h: 34, r: 11 \}/, 'BUB')
    expect(markup).toContain('x="22" y="10" width="38" height="34" rx="11"')
    // хвостик: 31,44 → 31,57 → 43,44
    num(/const TAIL = \[\[31, 44\], \[31, 57\], \[43, 44\]\]/, 'TAIL')
    expect(markup).toContain('d="M31 44 V57 L43 44 Z"')
    // цвет полос — та же лазурь #38BDF8, что в источнике
    num(/bars: \[56, 189, 248\]/, 'MARK.bars')
    expect(markup.toUpperCase()).toContain('#38BDF8')
  })

  it('🔴 ЛОВУШКА: та же геометрия на заставке загрузки чатов не разъехалась', () => {
    const splash = readFileSync('src/native/components/ChatListLoadingSplash.jsx', 'utf8')
    for (const y of [18, 32, 46]) expect(splash, 'заставка, полоса y=' + y).toContain(`d="M3 ${y} H17"`)
    expect(splash).toContain('x="22" y="10" width="38" height="34" rx="11"')
    expect(splash).toContain('d="M31 44 V57 L43 44 Z"')
  })

  it('🔴 ЛОВУШКА: та же геометрия на стартовой заставке (index.html) не разъехалась', () => {
    const html = readFileSync('index.html', 'utf8')
    for (const y of [18, 32, 46]) expect(html, 'index.html, полоса y=' + y).toContain(`M3 ${y} H17`)
    expect(html).toContain('x="22" y="10" width="38" height="34" rx="11"')
  })


  it('🔴 ЛОВУШКА: точки-ручка убраны, но окно всё ещё тащится за шапку', () => {
    // Точки были подсказкой «здесь можно тащить». Их убрали по просьбе пользователя,
    // и важно, что сама зона перетаскивания осталась — иначе окно нельзя было бы двигать.
    const tabbar = readFileSync('src/components/TabBar.jsx', 'utf8')
    expect(tabbar).not.toContain('Перетащить окно')
    expect(tabbar).not.toContain('cursor-grab')
    expect(tabbar).toContain("WebkitAppRegion: 'drag'")
  })


  // v1.2.451 (находка №12 из ревью): раньше сверялась только ГЕОМЕТРИЯ, а толщина линий
  // и цвет в копиях были «своими числами» — их могли поправить в одном месте и разъехаться.
  it('🔴 ЛОВУШКА: толщина линий во всех копиях = толщина из единого источника', () => {
    // На крупных размерах источник рисует полосу 5 и контур 4.5 — именно эти числа
    // и стоят в разметке для экрана (она всегда рисуется крупно и масштабируется CSS).
    const w = weights(64)
    expect(w.bar, 'изменилась толщина полосы в источнике — обнови разметку знака').toBe(5)
    expect(w.ring, 'изменилась толщина контура в источнике — обнови разметку знака').toBe(4.5)

    const copies = {
      'src/components/CcMark.jsx': readFileSync('src/components/CcMark.jsx', 'utf8'),
      'src/native/components/ChatListLoadingSplash.jsx': readFileSync('src/native/components/ChatListLoadingSplash.jsx', 'utf8'),
      'index.html': readFileSync('index.html', 'utf8'),
    }
    for (const [name, text] of Object.entries(copies)) {
      const bar = new RegExp('stroke-?[wW]idth="' + w.bar + '"')
      const ring = new RegExp('stroke-?[wW]idth="' + w.ring + '"')
      expect(bar.test(text), name + ': толщина полосы должна быть ' + w.bar).toBe(true)
      expect(ring.test(text), name + ': толщина контура должна быть ' + w.ring).toBe(true)
    }
  })

  it('🔴 ЛОВУШКА: цвет полос во всех копиях = цвет из единого источника', () => {
    const [r, g, b] = MARK.bars
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe('#38bdf8')
    for (const f of ['src/components/CcMark.jsx', 'src/native/components/ChatListLoadingSplash.jsx', 'index.html']) {
      expect(readFileSync(f, 'utf8').toLowerCase(), f + ': цвет полос должен быть ' + hex).toContain(hex)
    }
    // белый цвет пузыря — тоже из источника
    expect(MARK.bubble).toEqual([255, 255, 255])
    for (const f of ['src/components/CcMark.jsx', 'src/native/components/ChatListLoadingSplash.jsx', 'index.html']) {
      expect(readFileSync(f, 'utf8').toLowerCase(), f + ': пузырь должен быть белым').toContain('#ffffff')
    }
  })

  it('шапка окна действительно показывает знак', () => {
    const tabbar = readFileSync('src/components/TabBar.jsx', 'utf8')
    expect(tabbar).toContain("import CcMark from './CcMark.jsx'")
    expect(tabbar).toContain('<CcMark size={18}')
  })
})
