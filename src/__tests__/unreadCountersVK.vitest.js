// v1.2.410: страж рейл-счётчика ВК (countUnreadVK).
// Проблема (по логу): хук находит «Мессенджер N» (vk-src msgBadge=1), но значок рейла пустой —
// countUnreadVK искал пункт «Мессенджер» УЗКО (a[href*=im], nav a, aside a…), а на vk.ru он
// оформлен как [role="link"] вне nav → не находился → счётчик 0. Фикс: широкий проход `a,[role="link"]`
// (как в рабочем vk.hook.js). Тесты доказывают: находит vk.ru-вид, не путает с «Друзья»/«Игры»,
// старый vk.com-вид не сломан.

import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { countUnreadVK } = require('../../main/preloads/utils/unreadCounters.js')

afterEach(() => { document.body.innerHTML = ''; try { document.title = '' } catch { /* ок */ } })

describe('countUnreadVK — «Мессенджер» на vk.ru как [role="link"] (v1.2.410)', () => {
  it('vk.ru: <div role="link">Мессенджер1</div> → счётчик = 1 (раньше было 0 — узкий селектор)', () => {
    document.body.innerHTML = '<div role="link">Мессенджер1</div>'
    expect(countUnreadVK().allTotal).toBe(1)
  })

  it('не путает с «Друзья»/«Игры» (фантомная 1) — берёт число только у «Мессенджер»', () => {
    document.body.innerHTML =
      '<div role="link">Друзья1</div>' +
      '<div role="link">Игры1</div>' +
      '<div role="link">Мессенджер2</div>'
    expect(countUnreadVK().allTotal).toBe(2)
  })

  it('старый вид vk.com: <a href="/im">Мессенджер3</a> тоже работает (не сломали регрессом)', () => {
    document.body.innerHTML = '<a href="/im">Мессенджер3</a>'
    expect(countUnreadVK().allTotal).toBe(3)
  })

  it('нет пункта «Мессенджер» и нет «(N)» в заголовке → 0', () => {
    document.body.innerHTML = '<div role="link">Профиль</div>'
    expect(countUnreadVK().allTotal).toBe(0)
  })

  // v1.2.411: точность — не хватать чужое число из длинного превью чата, где случайно есть слово «мессенджер».
  it('длинное превью чата со словом «мессенджер» и числом СТОИТ РАНЬШЕ пункта → берём пункт (1), не превью', () => {
    document.body.innerHTML =
      '<div role="link">Напиши мне в мессенджер про заказ 777 когда будет готово</div>' + // длинное превью, число 777
      '<div role="link">Мессенджер1</div>' // сам пункт меню — короткая подпись
    expect(countUnreadVK().allTotal).toBe(1) // раньше могло вернуть 777
  })

  it('число во вложенном бейдже пункта «Мессенджер» → берём бейдж', () => {
    document.body.innerHTML = '<div role="link">Мессенджер<span class="vkuiCounter">4</span></div>'
    expect(countUnreadVK().allTotal).toBe(4)
  })
})
