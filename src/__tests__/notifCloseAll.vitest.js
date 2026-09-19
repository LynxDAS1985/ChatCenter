// v1.2.490 — кнопка «✕ Закрыть все (N)» над стопкой уведомлений (независимый модуль notificationCloseAll.js).
// @vitest-environment jsdom
//
// Проверяем на живом DOM: кнопка появляется при ≥2 карточках и прячется при <2; нажатие идёт ТЕМ ЖЕ путём,
// что человек — нажимает крестик каждой карточки; контейнер получает полосу под кнопку, а линейка высоты
// (calcHeight) добавляет те же 28 точек, что и стиль — иначе окно было бы ниже содержимого.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs'

const logged = []
let container
beforeAll(async () => {
  window.notifApi = { log: (l, m) => logged.push(l + ' ' + m) }
  container = document.createElement('div'); container.id = 'container'; document.body.appendChild(container)
  await import('../../main/notification-helpers.js')
  await import('../../main/notificationCloseAll.js')
})
// Состояние модуля («показана/скрыта») живёт между тестами: сначала очищаем список и ДОЖИДАЕМСЯ реакции
// наблюдателя (переход в «скрыта» уходит в журнал), и только потом чистим журнал — иначе счёт переходов плывёт.
beforeEach(async () => { container.innerHTML = ''; await flush(); logged.length = 0 })

/** Карточка как в окне: .notif-item с прямым потомком .close-btn. */
function addCard(onClose) {
  const el = document.createElement('div'); el.className = 'notif-item'
  const b = document.createElement('button'); b.className = 'close-btn'
  b.addEventListener('click', onClose || (() => {}))
  el.appendChild(b); container.appendChild(el)
  return el
}
const btn = () => document.querySelector('.close-all-btn')
const flush = () => new Promise(r => queueMicrotask(r)) // MutationObserver — микрозадача

describe('появление и исчезновение', () => {
  it('одна карточка — кнопки нет и полосы нет', async () => {
    addCard(); await flush()
    expect(btn().style.display).toBe('none')
    expect(container.classList.contains('has-toolbar')).toBe(false)
  })
  it('две карточки — кнопка видна с числом, у контейнера полоса', async () => {
    addCard(); addCard(); await flush()
    expect(btn().style.display).toBe('')
    expect(btn().textContent).toContain('Закрыть все (2)')
    expect(container.classList.contains('has-toolbar')).toBe(true)
    expect(logged.join('\n')).toContain('close-all: shown count=2')
  })
  it('карточки ушли — кнопка и полоса исчезают, лог только на переходе', async () => {
    addCard(); addCard(); addCard(); await flush()
    expect(btn().textContent).toContain('(3)')
    container.removeChild(container.lastChild); await flush()
    expect(btn().textContent).toContain('(2)')
    container.innerHTML = ''; await flush()
    expect(btn().style.display).toBe('none')
    expect(container.classList.contains('has-toolbar')).toBe(false)
    expect(logged.filter(l => l.includes('shown')).length).toBe(1)
    expect(logged.filter(l => l.includes('hidden')).length).toBe(1)
  })
  it('чистое правило: с двух карточек', () => {
    expect(window.__ccCloseAll.visibleFor(1)).toBe(false)
    expect(window.__ccCloseAll.visibleFor(2)).toBe(true)
    expect(window.__ccCloseAll.visibleFor('мусор')).toBe(false)
  })
})

describe('нажатие', () => {
  it('[!] нажимает крестик КАЖДОЙ карточки — тот же путь, что у человека', async () => {
    const spies = [vi.fn(), vi.fn(), vi.fn()]
    spies.forEach(s => addCard(s)); await flush()
    btn().click()
    spies.forEach(s => expect(s).toHaveBeenCalledTimes(1))
    expect(logged.join('\n')).toContain('close-all: click: закрываю 3 карточек через их крестики')
  })
})

describe('высота окна учитывает полосу', () => {
  const H = () => window.__ccNotifHelpers
  const fake = (has, heights) => ({
    classList: { contains: (c) => has && c === 'has-toolbar' },
    children: heights.map(h => ({ offsetHeight: h, style: {}, dataset: {} })),
  })
  it('[!] calcHeight добавляет 28 при полосе — и НЕ добавляет без карточек (иначе «пустое окно» не считалось бы пустым)', () => {
    expect(H().calcHeight(fake(false, [100, 100]))).toBe(212)      // 100+4+100+4 +4
    expect(H().calcHeight(fake(true, [100, 100]))).toBe(240)       // + 28
    expect(H().calcHeight(fake(true, []))).toBe(0)                 // полоса без карточек — ноль
  })
  it('[!] ЛОВУШКА согласованности: 28 в линейке = padding-top 32 − 4 обычных в стиле', () => {
    const css = fs.readFileSync('main/notification.css', 'utf8')
    const helpers = fs.readFileSync('main/notification-helpers.js', 'utf8')
    expect(css).toMatch(/#container\.has-toolbar\s*\{\s*padding-top:\s*32px/)
    expect(helpers).toContain('const CLOSE_ALL_BAR_PX = 28')
  })
})

describe('[!] ЛОВУШКИ подключения (html / сборка / независимость)', () => {
  const HTML = fs.readFileSync('main/notification.html', 'utf8')
  const VITE = fs.readFileSync('electron.vite.config.js', 'utf8')
  const MAIN = fs.readFileSync('main/notification.js', 'utf8')
  it('подключён отдельным <script> ПОСЛЕ notification.js и копируется в сборку', () => {
    expect(HTML.indexOf('notificationCloseAll.js')).toBeGreaterThan(HTML.indexOf('"notification.js"'))
    expect(VITE).toContain("{ from: 'main/notificationCloseAll.js', to: 'out/main/notificationCloseAll.js' }")
  })
  it('notification.js про кнопку не знает (модуль независимый)', () => {
    expect(MAIN).not.toContain('close-all')
  })
})
