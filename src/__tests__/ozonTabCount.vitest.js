// v1.2.504→505 — точное число новых со вкладки страницы Ozon (shared/ozonTabCount.js).
//
// ЗАЧЕМ ЭТИ ПРОВЕРКИ. Счётчик «Отзывы» показывал 5, когда новых 13: программа считала строки,
// которые Ozon успел нарисовать, а список он отдаёт порциями (внизу «Показать ещё»), и невидимую
// страницу никто не листает. Разведка 2026-09-25 нашла на странице готовый счётчик вкладки
// «Все · Новые 13 · Просмотренные · Обработанные».
//
// 🔴 ПЕРЕПИСАНО ПОСЛЕ РЕВЬЮ v1.2.505. Первая версия искала подпись ГДЕ УГОДНО на странице, и её
// обманывали двумя способами (оба воспроизведены):
//   • бейдж статуса «Новый» из таблицы отзывов — в журнале пользователя он стоит рядом с «0»,
//     и при другом порядке блоков на значок ушёл бы 0 при 13 новых;
//   • соседний элемент с одним только числом склеивался с подписью в тексте общего предка.
// Плюс «честный ноль» определялся по числам у соседних вкладок — а на настоящей странице число
// есть ТОЛЬКО у «Новые», поэтому при прочтении всех отзывов значок НИКОГДА не гас.
import { describe, it, expect, afterEach } from 'vitest'
import { OZON_TAB_COUNT_SCRIPT, pickOzonTabCount, formatOzonTabs } from '../../shared/ozonTabCount.js'

/** Ровно то, что разведка сняла с настоящей страницы «Отзывы» 2026-09-25: число ТОЛЬКО у «Новые». */
const REAL_REVIEWS = { path: '/app/reviews', strip: true, tabs: [
  { label: 'Все', raw: null },
  { label: 'Новые', raw: '13' },
  { label: 'Просмотренные', raw: null },
  { label: 'Обработанные', raw: null },
] }

describe('Ozon: выбор числа со вкладки', () => {
  it('[!] настоящие данные со страницы «Отзывы» дают 13 — столько и видел человек', () => {
    expect(pickOzonTabCount(REAL_REVIEWS)).toEqual({ n: 13, label: 'Новые' })
  })

  it('[!] всё прочитано, Ozon убрал счётчик → ЧЕСТНЫЙ НОЛЬ (иначе значок не погаснет никогда)', () => {
    // Главный баг v1.2.504: ноль засчитывался только при числе у соседей, а на настоящей странице
    // число есть ТОЛЬКО у «Новые» — значит при нуле чисел не остаётся ни у кого.
    const readAll = { ...REAL_REVIEWS, tabs: REAL_REVIEWS.tabs.map(t => ({ ...t, raw: null })) }
    expect(pickOzonTabCount(readAll)).toEqual({ n: 0, label: 'Новые' })
  })

  it('[!] полоса вкладок НЕ найдена → «не знаю», счётчик не трогаем', () => {
    // Без полосы верить числу нельзя: оно могло прийти откуда угодно со страницы.
    expect(pickOzonTabCount({ strip: false, tabs: [{ label: 'Новые', raw: '7' }] })).toBeNull()
    expect(pickOzonTabCount({ tabs: [{ label: 'Новые', raw: '7' }] })).toBeNull()
  })

  it('[!] вкладка «Новое» (так подписан раздел «Вопросы») тоже выбирается', () => {
    // В v1.2.504 выбор шёл по /^Новы/i, под который «Новое» не подходит — фича молча выключилась бы.
    expect(pickOzonTabCount({ strip: true, tabs: [{ label: 'Новое', raw: '7' }] })).toEqual({ n: 7, label: 'Новое' })
  })

  it('вкладки «новых» в полосе нет → «не знаю»', () => {
    expect(pickOzonTabCount({ strip: true, tabs: [{ label: 'Все', raw: '5' }] })).toBeNull()
  })

  it('«999+» разбирается как 999; отрицательное — как отсутствие числа, а не как 3', () => {
    expect(pickOzonTabCount({ strip: true, tabs: [{ label: 'Новые', raw: '999+' }] })).toEqual({ n: 999, label: 'Новые' })
    expect(pickOzonTabCount({ strip: true, tabs: [{ label: 'Новые', raw: '-3' }] })).toEqual({ n: 0, label: 'Новые' })
  })

  it('страница не ответила / ответила мусором → «не знаю», без падения', () => {
    for (const bad of [null, undefined, {}, { strip: true, tabs: [] }, { tabs: 'нет' }, 42]) {
      expect(pickOzonTabCount(bad), String(bad)).toBeNull()
    }
  })

  it('строка для журнала читаема и не падает на битом списке', () => {
    expect(formatOzonTabs(REAL_REVIEWS)).toBe('Все=— | Новые=13 | Просмотренные=— | Обработанные=—')
    expect(formatOzonTabs({ strip: false })).toContain('полоса вкладок не найдена')
    expect(formatOzonTabs(null)).toContain('ничего не вернула')
    expect(() => formatOzonTabs({ strip: true, tabs: [null, { label: 'Новые', raw: '1' }] })).not.toThrow()
  })
})

describe('Ozon: сам скрипт на живой странице', () => {
  afterEach(() => { document.body.innerHTML = '' })

  /** Выполнить настоящий скрипт так же, как его выполняет страница Ozon. */
  const run = () => new Function('return ' + OZON_TAB_COUNT_SCRIPT)()

  it('[!] находит «Новые 13» в полосе вкладок', () => {
    document.body.innerHTML = `
      <div class="tabs">
        <div class="tab"><span>Все</span></div>
        <div class="tab"><span>Новые</span><span class="cnt">13</span></div>
        <div class="tab"><span>Просмотренные</span></div>
      </div>`
    expect(pickOzonTabCount(run())).toEqual({ n: 13, label: 'Новые' })
  })

  it('[!] бейдж «Новый 5» из ТАБЛИЦЫ не подменяет вкладку, даже стоя выше неё', () => {
    // Ровно этот случай воспроизведён при ревью: в журнале пользователя бейдж «Новый» стоит
    // рядом с «0», и старая версия отдала бы 0 при 13 новых.
    document.body.innerHTML = `
      <table><tbody>
        <tr><td><span>Подшипник 6001</span></td><td><span>Новый</span><span>5</span></td></tr>
      </tbody></table>
      <div class="tabs">
        <div class="tab"><span>Все</span></div>
        <div class="tab"><span>Новые</span><span>13</span></div>
        <div class="tab"><span>Просмотренные</span></div>
      </div>`
    expect(pickOzonTabCount(run())).toEqual({ n: 13, label: 'Новые' })
  })

  it('[!] чужое число из СОСЕДНЕЙ вкладки не приписывается «Новым»', () => {
    document.body.innerHTML = `
      <div class="tabs">
        <div class="tab"><span>Новые</span></div>
        <div class="tab"><span>Просмотренные</span><span>13</span></div>
        <div class="tab"><span>Обработанные</span></div>
      </div>`
    expect(pickOzonTabCount(run())).toEqual({ n: 0, label: 'Новые' }) // у «Новых» счётчика нет = ноль
  })

  it('[!] подпись как обычный текст (без своего элемента) тоже находится', () => {
    // Частая вёрстка: <div class="tab">Новые<span>13</span></div> — подписи-листа нет вовсе,
    // старая версия такую вкладку не видела и молча выключалась.
    document.body.innerHTML = `
      <div class="tabs">
        <div class="tab">Все</div>
        <div class="tab">Новые<span>13</span></div>
        <div class="tab">Просмотренные</div>
      </div>`
    expect(pickOzonTabCount(run())).toEqual({ n: 13, label: 'Новые' })
  })

  it('число слева от подписи тоже читается', () => {
    document.body.innerHTML = `
      <div class="tabs"><div class="tab"><b>7</b><span>Новые</span></div><div class="tab"><span>Все</span></div></div>`
    expect(pickOzonTabCount(run())).toEqual({ n: 7, label: 'Новые' })
  })

  it('одна подпись без соседей — это не полоса вкладок, числу не верим', () => {
    document.body.innerHTML = '<div><span>Новые</span><span>13</span></div>'
    const res = run()
    expect(res.strip).toBe(false)
    expect(pickOzonTabCount(res)).toBeNull()
  })

  it('вкладок на странице нет → пустой ответ, а не выдуманное число', () => {
    document.body.innerHTML = '<div><p>Отзывы покупателей</p></div>'
    expect(pickOzonTabCount(run())).toBeNull()
  })
})
