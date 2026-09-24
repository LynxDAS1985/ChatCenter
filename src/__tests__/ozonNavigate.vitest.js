// v1.2.499 — переход по нажатию «Перейти к чату» для Ozon (находка ревью #13).
//
// БЕДА, КОТОРУЮ ЗАКРЫВАЕМ: уведомление о ВОПРОСЕ к товару вело поиск среди строк ЧАТОВ покупателей —
// там вопроса нет в принципе, поэтому экран всегда показывал красное «… — не найден в списке».
// Вторая половина беды: «отправитель» у вопроса — длинное название товара, в уведомлении обрезанное
// многоточием, а сравнение шло по строке целиком.
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildOzonScript } from '../utils/navigators/ozonNavigate.js'
import { ozonSectionOf, ozonNeedle, OZON_MATCH_LEN } from '../../shared/ozonSections.js'
import { buildChatNavigateScript } from '../utils/navigateToChat.js'

describe('Ozon: раздел по метке уведомления', () => {
  it('вопрос / отзыв / чат покупателя различаются', () => {
    expect(ozonSectionOf('ozon-q:12345')).toBe('q')
    expect(ozonSectionOf('ozon-rv:12345')).toBe('rv')
    expect(ozonSectionOf('ozon-list:12345')).toBe('list')
    expect(ozonSectionOf(''), 'метки нет → считаем чатом, как было раньше').toBe('list')
    expect(ozonSectionOf(null)).toBe('list')
    expect(ozonSectionOf(undefined)).toBe('list')
  })

  it('[!] начало названия: многоточие и лишние пробелы не мешают', () => {
    // многоточие уведомления срезается, берём первые OZON_MATCH_LEN символов
    expect(ozonNeedle('Ремень генератора Contitech (10…')).toBe('Ремень генератора Contite')
    expect(ozonNeedle('  Ремень   генератора  ')).toBe('Ремень генератора')
    expect(ozonNeedle(''), 'пусто не ломает').toBe('')
    expect(ozonNeedle(null)).toBe('')
    expect(ozonNeedle('а'.repeat(100)).length, 'длинное режем').toBe(OZON_MATCH_LEN)
  })
})

describe('Ozon: сам переход', () => {
  const run = (script, href) => {
    // страница-подделка: проверяем, куда нас увели и по чему кликнули
    delete window.location
    window.location = { href }
    // eslint-disable-next-line no-eval
    return eval(script)
  }

  it('[!] вопрос, а мы в чатах → уводит в раздел «Вопросы», а не пишет «не найден»', () => {
    document.body.innerHTML = '<div class="m9d-c4">Иванов Иван · заказ</div>'
    const script = buildOzonScript('Ремень генератора Contitech (10…', 'ozon-q:abc')
    const r = run(script, 'https://seller.ozon.ru/app/messenger')
    expect(r.ok, 'красного «не найден» больше нет').toBe(true)
    expect(r.method).toBe('ozon-section')
    expect(window.location.href).toBe('https://seller.ozon.ru/app/reviews/questions')
  })

  it('[!] мы уже в нужном разделе и строка есть → кликаем по ней (совпадение по НАЧАЛУ названия)', () => {
    let clicked = false
    document.body.innerHTML = '<div role="row"><a href="#">Ремень генератора Contitech (10PK1555) для Toyota</a></div>'
    document.querySelector('a').addEventListener('click', () => { clicked = true })
    const script = buildOzonScript('Ремень генератора Contitech (10…', 'ozon-q:abc')
    const r = run(script, 'https://seller.ozon.ru/app/reviews/questions')
    expect(r.ok).toBe(true)
    expect(r.method).toBe('ozon-row')
    expect(clicked, 'нажали именно по строке').toBe(true)
  })

  it('мы в нужном разделе, строки нет → честно говорим об этом, но НЕ считаем провалом', () => {
    document.body.innerHTML = '<div role="row">Другой товар</div>'
    const script = buildOzonScript('Ремень генератора', 'ozon-rv:abc')
    const r = run(script, 'https://seller.ozon.ru/app/reviews')
    expect(r.ok).toBe(true)
    expect(r.method).toBe('ozon-section-here')
    expect(r.log).toContain('строка не найдена')
  })

  it('чат покупателя без имени — скрипта нет (решает общий навигатор, как раньше)', () => {
    expect(buildOzonScript('', 'ozon-list:abc')).toBeNull()
  })

  it('[!] проводка: метка уведомления доходит до Ozon-навигатора', () => {
    const script = buildChatNavigateScript('https://seller.ozon.ru/app/messenger', 'Товар X', 'ozon-q:1')
    expect(script, 'раздел обязан попасть в скрипт').toContain('reviews/questions')
  })
})
