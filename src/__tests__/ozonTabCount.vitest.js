// v1.2.504 — точное число новых со вкладки страницы Ozon (shared/ozonTabCount.js).
//
// ЗАЧЕМ ЭТИ ПРОВЕРКИ. Счётчик «Отзывы» показывал 5, когда новых 13: программа считала строки,
// которые Ozon успел нарисовать, а список он отдаёт порциями (внизу «Показать ещё»), и невидимую
// страницу никто не листает. Разведка 2026-09-25 нашла на странице готовый счётчик вкладки
// «Все · Новые 13 · Просмотренные · Обработанные» — число 13 сошлось и с подсчётом открытой
// вкладки, и с тем, что человек видел на значке. Теперь читаем его.
//
// Главная ловушка, ради которой тут столько проверок: Ozon НЕ рисует счётчик при нуле, поэтому
// «подпись есть, числа нет» — это либо честный ноль, либо «счётчиков на странице не видно вовсе».
// Перепутать нельзя: в первом случае надо показать 0, во втором — не трогать счётчик.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OZON_TAB_COUNT_SCRIPT, pickOzonTabCount, formatOzonTabs } from '../../shared/ozonTabCount.js'
import { bindOzonBgWatcher } from '../utils/ozonBgWatcher.js'
import { resetOzonNotifDedup } from '../../shared/ozonNotifDedup.js'

/** Ровно то, что разведка сняла с настоящей страницы «Отзывы» 2026-09-25. */
const REAL_REVIEWS = { path: '/app/reviews', tabs: [
  { label: 'Все', raw: null },
  { label: 'Новые', raw: '13' },
  { label: 'Просмотренные', raw: null },
  { label: 'Обработанные', raw: null },
] }

describe('Ozon: выбор числа со вкладки', () => {
  it('[!] настоящие данные со страницы «Отзывы» дают 13 — столько и видел человек', () => {
    expect(pickOzonTabCount(REAL_REVIEWS)).toEqual({ n: 13, label: 'Новые' })
  })

  it('[!] у «Новых» числа нет, но у соседей есть → это честный НОЛЬ (Ozon не рисует нулевой счётчик)', () => {
    const res = { tabs: [{ label: 'Все', raw: '999+' }, { label: 'Новые', raw: null }, { label: 'Просмотренные', raw: '12' }] }
    expect(pickOzonTabCount(res)).toEqual({ n: 0, label: 'Новые' })
  })

  it('[!] чисел нет НИ У ОДНОЙ вкладки → «не знаю», счётчик не трогаем (иначе показали бы ложный ноль)', () => {
    const res = { tabs: [{ label: 'Все', raw: null }, { label: 'Новые', raw: null }] }
    expect(pickOzonTabCount(res)).toBeNull()
  })

  it('вкладки «Новые» на странице нет → «не знаю»', () => {
    expect(pickOzonTabCount({ tabs: [{ label: 'Все', raw: '5' }] })).toBeNull()
  })

  it('«999+» разбирается как 999, а не как ноль', () => {
    expect(pickOzonTabCount({ tabs: [{ label: 'Новые', raw: '999+' }] })).toEqual({ n: 999, label: 'Новые' })
  })

  it('страница не ответила / ответила мусором → «не знаю», без падения', () => {
    for (const bad of [null, undefined, {}, { tabs: [] }, { tabs: 'нет' }, 42]) {
      expect(pickOzonTabCount(bad), String(bad)).toBeNull()
    }
  })

  it('строка для журнала читаема и показывает пустой счётчик прочерком', () => {
    expect(formatOzonTabs(REAL_REVIEWS)).toBe('Все=— | Новые=13 | Просмотренные=— | Обработанные=—')
    expect(formatOzonTabs(null)).toBe('вкладок не нашлось')
  })
})

describe('Ozon: сам скрипт на живой странице', () => {
  afterEach(() => { document.body.innerHTML = '' })

  /** Выполнить настоящий скрипт так же, как его выполняет страница Ozon. */
  const run = () => new Function('return ' + OZON_TAB_COUNT_SCRIPT)()

  it('[!] находит «Новые 13» в вёрстке, где подпись и число — соседние элементы', () => {
    document.body.innerHTML = `
      <div class="tabs">
        <div class="tab"><span>Все</span></div>
        <div class="tab"><span>Новые</span><span class="cnt">13</span></div>
        <div class="tab"><span>Просмотренные</span></div>
      </div>`
    const res = run()
    expect(pickOzonTabCount(res)).toEqual({ n: 13, label: 'Новые' })
  })

  it('[!] чужое число рядом с подписью НЕ подхватывается', () => {
    // «13» лежит в соседней вкладке, а не внутри «Новые» — брать его нельзя.
    document.body.innerHTML = `
      <div><div class="tab"><span>Новые</span></div><div class="tab"><span>Просмотренные</span><span>13</span></div></div>`
    const res = run()
    expect(pickOzonTabCount(res)).toEqual({ n: 0, label: 'Новые' }) // у «Новых» счётчика нет = ноль
  })

  it('вкладок на странице нет → пустой список, а не выдуманное число', () => {
    document.body.innerHTML = '<div><p>Отзывы покупателей</p></div>'
    expect(pickOzonTabCount(run())).toBeNull()
  })
})

describe('Ozon: точное число доходит до значка', () => {
  beforeEach(() => { resetOzonNotifDedup(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  function makeEl(url = 'https://seller.ozon.ru/app/reviews', tabs = REAL_REVIEWS) {
    const handlers = {}
    return {
      addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn) },
      getURL: () => url,
      isConnected: true,
      reload: vi.fn(),
      // разведка спрашивает число элементов, опрос вкладок — подписи; отвечаем по содержимому запроса
      executeJavaScript: vi.fn((code) => {
        if (String(code).includes('querySelectorAll("*").length')) return Promise.resolve(5200)
        if (String(code).includes('afterScroll')) return Promise.resolve({ total: 5200, rows0: 6, afterScroll: [6, 6, 6], innerH: 1000, docH: 1165, docH2: 1165, texts: [] })
        return Promise.resolve(tabs)
      }),
      fire: (t, ev) => (handlers[t] || []).forEach((fn) => fn(ev)),
    }
  }

  function makeDeps() {
    let state = {}
    return {
      handleNewMessage: vi.fn(),
      setOzonCounts: vi.fn((fn) => { state = fn(state) }),
      log: vi.fn(),
      getState: () => state,
    }
  }

  it('[!] со вкладки пришло 13 → на значке 13, а не 5 из подсчёта строк', async () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-finish-load')
    await vi.advanceTimersByTimeAsync(6000)
    expect(d.getState().ozon.rv).toBe(13)
  })

  it('[!] после точного числа подсчёт строк (5) его НЕ перебивает', async () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-finish-load')
    await vi.advanceTimersByTimeAsync(6000)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'rv', n: 5 }) })
    expect(d.getState().ozon.rv).toBe(13)
    expect(d.log.mock.calls.some(c => /не берём, есть точное число/.test(String(c[1])))).toBe(true)
  })

  it('[!] точного числа нет → работает прежний подсчёт строк (запасной путь цел)', async () => {
    const el = makeEl('https://seller.ozon.ru/app/reviews', { tabs: [] }); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-finish-load')
    await vi.advanceTimersByTimeAsync(6000)
    el.fire('console-message', { message: '__CC_OZON_COUNT__' + JSON.stringify({ s: 'rv', n: 5 }) })
    expect(d.getState().ozon.rv).toBe(5)
  })

  it('[!] на странице «Вопросы» число со вкладки в счётчик НЕ идёт (там «Новое» ≠ «без ответа»)', async () => {
    const qTabs = { path: '/app/reviews/questions', tabs: [{ label: 'Все', raw: '999+' }, { label: 'Новое', raw: null }, { label: 'Просмотрено', raw: '12' }] }
    const el = makeEl('https://seller.ozon.ru/app/reviews/questions', qTabs); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-finish-load')
    await vi.advanceTimersByTimeAsync(6000)
    expect(d.getState().ozon).toBeUndefined()  // счётчик не трогали
    expect(d.log.mock.calls.some(c => /\[ozon-tab\].*Просмотрено=12/.test(String(c[1])))).toBe(true)
  })

  it('страницу закрыли → опрос прекращается, в мёртвое окно не лезем', async () => {
    const el = makeEl(); const d = makeDeps()
    bindOzonBgWatcher(el, 'ozon', d)
    el.fire('did-finish-load')
    await vi.advanceTimersByTimeAsync(6000)
    const before = el.executeJavaScript.mock.calls.length
    el.isConnected = false
    await vi.advanceTimersByTimeAsync(120000)
    expect(el.executeJavaScript.mock.calls.length).toBe(before)
  })
})
