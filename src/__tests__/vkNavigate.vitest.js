// v1.2.217: настоящий тест-репродюсер искалки «перейти в чат» для ВК.
// @vitest-environment happy-dom
//
// Прошлые проверки (navigateToChat.test.cjs) смотрели только «есть ли нужные слова в коде».
// Здесь мы СТРОИМ понарошку-страницу vk.ru (строки списка чатов с новыми классами
// ConvoTitle__author / ChannelTitle__title внутри .ConvoListItem) и ПРОГОНЯЕМ по ней
// сам скрипт из buildVkScript — проверяем, что он реально находит и «кликает» нужную строку.
// Если ВК снова сменит вёрстку — этот тест поймает поломку, а не пользователь вручную.
import { describe, it, expect, beforeEach } from 'vitest'
import { buildVkScript } from '../utils/navigators/vkNavigate.js'

// buildVkScript возвращает строку "(function(){...})();" — выполняем её на текущем document.
function runNavigate(name) {
  // eslint-disable-next-line no-eval
  return eval(buildVkScript(name))
}

// Создаёт строку чата как на vk.ru; возвращает элемент строки + счётчик кликов по ней.
function addRow(nameText, { channel = false } = {}) {
  const row = document.createElement('div')
  row.className = 'ConvoListItem ConvoListItem--click'
  const title = document.createElement('span')
  title.className = channel ? 'ChannelTitle__title' : 'ConvoTitle__author'
  title.textContent = nameText
  row.appendChild(title)
  const clicks = { n: 0 }
  row.addEventListener('click', () => { clicks.n++ })
  document.body.appendChild(row)
  return clicks
}

beforeEach(() => { document.body.innerHTML = '' })

describe('buildVkScript — навигация по списку vk.ru', () => {
  it('точное совпадение: кликает нужную строку', () => {
    const artem = addRow('Artem Artem')
    const elena = addRow('Елена Дугина')
    const r = runNavigate('Елена Дугина')
    expect(r.ok).toBe(true)
    expect(r.method).toBe('vk-exact')
    expect(elena.n).toBe(1)
    expect(artem.n).toBe(0)
  })

  it('мягкое совпадение: имя со временем рядом (начинается с)', () => {
    addRow('Сергей Пересыпкин')
    const elena = addRow('Елена Дугина 12:34') // имя + время в одном элементе
    const r = runNavigate('Елена Дугина')
    expect(r.ok).toBe(true)
    expect(r.method).toBe('vk-starts')
    expect(elena.n).toBe(1)
  })

  it('совпадение в СЕРЕДИНЕ имени не открывает чужой чат', () => {
    // Ищем «Дугина», а в списке только «Елена Дугина» — это НЕ должно кликнуться
    // (startsWith, а не «содержит»). Уведомление всегда несёт полное имя.
    const elena = addRow('Елена Дугина')
    const r = runNavigate('Дугина')
    expect(r.ok).toBe(false)
    expect(elena.n).toBe(0)
  })

  it('НЕ путает «Елена» и «Елена Дугина» (точный проход первым)', () => {
    const short = addRow('Елена')
    const full = addRow('Елена Дугина')
    const r = runNavigate('Елена Дугина')
    expect(r.ok).toBe(true)
    expect(full.n).toBe(1)
    expect(short.n).toBe(0)
  })

  it('канал (ChannelTitle__title) тоже находится', () => {
    const ch = addRow('Новости', { channel: true })
    const r = runNavigate('Новости')
    expect(r.ok).toBe(true)
    expect(ch.n).toBe(1)
  })

  it('нет такого чата → ok:false, log с noMatch', () => {
    addRow('Кто-то другой')
    const r = runNavigate('Елена Дугина')
    expect(r.ok).toBe(false)
    expect(r.method).toBe('vk')
    expect(r.log).toContain('noMatch')
  })

  it('пустое имя → ok:false, no-name (ничего не кликает)', () => {
    const a = addRow('Елена Дугина')
    const r = runNavigate('')
    expect(r.ok).toBe(false)
    expect(r.log).toBe('no-name')
    expect(a.n).toBe(0)
  })
})
