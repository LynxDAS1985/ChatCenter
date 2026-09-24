// v1.2.500 — переход по нажатию на уведомление Ozon. Ловушки на КАЖДУЮ находку ревью v1.2.499.
//
// Коротко, что чинилось (все беды были доказаны прогоном ДО починки):
//   • отзыв, нажатый со страницы «Вопросы», никуда не вёл — путь /app/reviews целиком входит
//     в /app/reviews/questions, и сравнение подстрокой считало «мы уже на месте»;
//   • у товаров одной линейки первые 25 символов названия совпадают → открывался ЧУЖОЙ товар;
//   • «ничего не нашли» отвечало «успех» → экран писал «перешёл в чат», а повтор через 1.5 с
//     (единственное спасение для медленно рисующегося списка) больше не запускался;
//   • отбор строк `[class*="row"]` ловил обёртки → клик уходил по чужой ссылке;
//   • кнопка «Прочитано» звала тот же скрипт и уводила открытую вкладку в другой раздел.
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildOzonScript } from '../utils/navigators/ozonNavigate.js'
import { buildChatNavigateScript } from '../utils/navigateToChat.js'
import {
  ozonSectionOf, ozonHereAlready, ozonNeedle, ozonNeedleShort, OZON_SECTION_URL, OZON_MATCH_LEN,
} from '../../shared/ozonSections.js'

/** Выполняем собранный скрипт на поддельной странице и смотрим, куда ушли и по чему кликнули. */
function run(script, pathname, rowsHtml = '') {
  document.body.innerHTML = rowsHtml
  const clicks = []
  document.querySelectorAll('a, button').forEach(el => el.addEventListener('click', () => clicks.push(el.id || el.textContent.slice(0, 20))))
  delete window.location
  window.location = { href: 'https://seller.ozon.ru' + pathname, pathname }
  // eslint-disable-next-line no-eval
  const result = eval(script)
  return { ...result, clicks, href: window.location.href }
}

describe('Ozon: разбор метки и раздела', () => {
  it('вопрос / отзыв / чат различаются; чужая метка → чат', () => {
    expect(ozonSectionOf('ozon-q:1')).toBe('q')
    expect(ozonSectionOf('ozon-rv:1')).toBe('rv')
    expect(ozonSectionOf('ozon-list:1')).toBe('list')
    expect(ozonSectionOf('')).toBe('list')
    expect(ozonSectionOf(null)).toBe('list')
  })

  it('[!] путь отзывов ВХОДИТ в путь вопросов — сравнение обязано быть точным', () => {
    expect(ozonHereAlready('/app/reviews/questions', 'rv'), 'иначе отзыв со страницы вопросов никуда не ведёт').toBe(false)
    expect(ozonHereAlready('/app/reviews', 'rv')).toBe(true)
    expect(ozonHereAlready('/app/reviews/', 'rv'), 'хвостовая косая черта не мешает').toBe(true)
    expect(ozonHereAlready('/app/reviews/questions', 'q')).toBe(true)
    expect(ozonHereAlready('', 'q')).toBe(false)
  })

  it('[!] название берём ЦЕЛИКОМ (обрезка до 25 символов путала товары одной линейки)', () => {
    const a = 'Ремень генератора Contitech 10PK1555 для Toyota'
    const b = 'Ремень генератора Contitech 10PK1600 для Lexus'
    expect(b.includes(ozonNeedle(a)), 'полное название чужой товар НЕ содержит').toBe(false)
    expect(ozonNeedle('Товар с многоточием…')).toBe('Товар с многоточием')
    expect(ozonNeedle('  два   пробела  ')).toBe('два пробела')
    expect(ozonNeedle(null)).toBe('')
    expect(ozonNeedleShort('а'.repeat(100)).length, 'запасной короткий поиск ограничен').toBe(OZON_MATCH_LEN)
  })

  it('адрес «Сообщения» ведёт в подраздел покупателей (как виджет и фоновые страницы)', () => {
    expect(OZON_SECTION_URL.list).toContain('group=customers_v2')
  })
})

describe('Ozon: сам переход', () => {
  it('[!] отзыв, а открыты «Вопросы» → уводим в «Отзывы»', () => {
    const r = run(buildOzonScript('Товар X', 'ozon-rv:1'), '/app/reviews/questions')
    expect(r.method).toBe('ozon-section')
    expect(r.href).toBe(OZON_SECTION_URL.rv)
  })

  it('[!] два товара одной линейки → НЕ угадываем, клика нет', () => {
    // ХУДШИЙ случай для автозапчастей: артикул стоит в КОНЦЕ, первые 40 символов у товаров совпадают
    const html = '<div role="row"><a id="a1">Ремень генератора Contitech для Toyota 10PK1600</a></div>'
      + '<div role="row"><a id="a2">Ремень генератора Contitech для Toyota 10PK1555</a></div>'
    // ищем товар, которого на странице нет целиком → сработает запасной короткий поиск и совпадёт ДВАЖДЫ
    const r = run(buildOzonScript('Ремень генератора Contitech для Toyota 10PK1777', 'ozon-q:1'), '/app/reviews/questions', html)
    expect(r.ok, 'неоднозначно — честно говорим «нет»').toBe(false)
    expect(r.clicks, 'чужой товар открывать нельзя').toEqual([])
    expect(r.log).toContain('подошло строк: 2')
  })

  it('точное совпадение по полному названию → клик по нужной строке', () => {
    const html = '<div role="row"><a id="a1">Ремень генератора Contitech 10PK1600 для Lexus</a></div>'
      + '<div role="row"><a id="a2">Ремень генератора Contitech 10PK1555 для Toyota</a></div>'
    const r = run(buildOzonScript('Ремень генератора Contitech 10PK1555 для Toyota', 'ozon-q:1'), '/app/reviews/questions', html)
    expect(r.method).toBe('ozon-row')
    expect(r.clicks).toEqual(['a2'])
  })

  it('[!] «ничего не нашли» отвечает НЕ успехом — иначе пропадает повтор через 1.5 с', () => {
    const r = run(buildOzonScript('Такого товара нет', 'ozon-q:1'), '/app/reviews/questions')
    expect(r.ok).toBe(false)
    expect(r.method).toBe('ozon-row-miss')
    expect(r.clicks).toEqual([])
  })

  it('[!] обёртка вокруг строк не перехватывает клик', () => {
    const html = '<div role="row" id="wrap"><a id="chuzhaya">ЧУЖАЯ ССЫЛКА</a>'
      + '<div role="row"><a id="nuzhnaya">Ремень генератора 5PK1113 Gates</a></div></div>'
    const r = run(buildOzonScript('Ремень генератора 5PK1113 Gates', 'ozon-q:1'), '/app/reviews/questions', html)
    expect(r.method).toBe('ozon-row')
    expect(r.clicks, 'кликаем по внутренней строке, а не по обёртке').toEqual(['nuzhnaya'])
  })

  it('[!] кнопка «Прочитано» НЕ уводит вкладку в другой раздел', () => {
    const script = buildChatNavigateScript('https://seller.ozon.ru/app/messenger', 'Товар X', 'ozon-q:1', { markReadOnly: true })
    const r = run(script, '/app/messenger')
    expect(r.method).toBe('ozon-mark-read')
    expect(r.href, 'адрес обязан остаться прежним').toBe('https://seller.ozon.ru/app/messenger')
    // а кнопка «Перейти» (без признака) вести в раздел по-прежнему должна
    const go = run(buildChatNavigateScript('https://seller.ozon.ru/app/messenger', 'Товар X', 'ozon-q:1'), '/app/messenger')
    expect(go.href).toBe(OZON_SECTION_URL.q)
  })

  it('пустое имя → скрипта нет (решает общий навигатор, как раньше)', () => {
    expect(buildOzonScript('', 'ozon-list:1')).toBeNull()
    expect(buildOzonScript(null, 'ozon-q:1')).toBeNull()
  })
})
