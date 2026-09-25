// v1.2.505 — опрос готового числа со вкладки страницы Ozon (shared/ozonTabPoll.js).
//
// ЗАЧЕМ. Ревью v1.2.505 нашло три беды, каждая делала счётчик «Отзывы» немым или залипшим:
//  1. обращение к странице шло без защиты: у отвалившегося <webview> метод выполнения скрипта
//     бросает СИНХРОННО, и ошибка улетала прямо из таймера мимо журнала — каждые 30 секунд;
//  2. уход страницы с раздела «Отзывы» (Ozon выкинул на вход) не сбрасывал признак «есть точное
//     число» — он оставался навсегда, подсчёт строк был заблокирован, значок замирал;
//  3. полный отказ молчал: запись «не читается» стояла под условием «раньше находилось», поэтому
//     самый вероятный случай (Ozon поменял вид страницы) не давал в журнале ни строки.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createOzonTabPoll, isOzonReviewsPage, TAB_MISS_LIMIT } from '../../shared/ozonTabPoll.js'

const REVIEWS = 'https://seller.ozon.ru/app/reviews'
const TABS_13 = { strip: true, tabs: [{ label: 'Все', raw: null }, { label: 'Новые', raw: '13' }] }

function make(over = {}) {
  const log = []
  const counts = []
  const lost = []
  const poll = createOzonTabPoll({
    exec: () => Promise.resolve(TABS_13),
    getUrl: () => REVIEWS,
    isAlive: () => true,
    isOnline: () => true,
    setCount: (n) => counts.push(n),
    onLost: () => lost.push(true),
    log: (lvl, m) => log.push(lvl + ': ' + m),
    ...over,
  })
  return { poll, log, counts, lost }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Ozon: опрос вкладки — обычная работа', () => {
  it('[!] нашли число → оно уходит в счётчик, в журнале запись', async () => {
    const t = make()
    t.poll.ask()
    await vi.advanceTimersByTimeAsync(10)
    expect(t.counts).toEqual([13])
    expect(t.poll.isExact()).toBe(true)
    expect(t.log.some(l => /точное число со страницы/.test(l))).toBe(true)
  })

  it('[!] страница не на разделе «Отзывы» → запрос вообще НЕ отправляем', async () => {
    // Раньше тяжёлый обход страницы выполнялся и на «Вопросах», и на «Сообщениях» каждые 30 с,
    // а результат выбрасывался.
    const exec = vi.fn(() => Promise.resolve(TABS_13))
    const t = make({ exec, getUrl: () => 'https://seller.ozon.ru/app/reviews/questions' })
    t.poll.ask()
    await vi.advanceTimersByTimeAsync(10)
    expect(exec).not.toHaveBeenCalled()
  })

  it('«Вопросы» не принимаются за «Отзывы» (один путь входит в другой)', () => {
    expect(isOzonReviewsPage(REVIEWS)).toBe(true)
    expect(isOzonReviewsPage('https://seller.ozon.ru/app/reviews/questions')).toBe(false)
    expect(isOzonReviewsPage('мусор')).toBe(false)
  })
})

describe('Ozon: опрос вкладки — пути отказа', () => {
  it('[!] страница отвалилась и бросила СИНХРОННО → не падаем наружу, пишем в журнал', async () => {
    const t = make({ exec: () => { throw new Error('The WebView must be attached to the DOM') } })
    expect(() => t.poll.ask()).not.toThrow()
    await vi.advanceTimersByTimeAsync(10)
    expect(t.log.some(l => /WARN.*не приняла запрос/.test(l))).toBe(true)
  })

  it('[!] после трёх промахов ТОЧНОЕ число отдаётся обратно подсчёту строк', async () => {
    let tabs = TABS_13
    const t = make({ exec: () => Promise.resolve(tabs) })
    t.poll.ask(); await vi.advanceTimersByTimeAsync(10)
    expect(t.poll.isExact()).toBe(true)
    tabs = { strip: false, tabs: [] }                       // Ozon поменял вид страницы
    for (let i = 0; i < TAB_MISS_LIMIT; i++) { t.poll.ask(); await vi.advanceTimersByTimeAsync(10) }
    expect(t.poll.isExact()).toBe(false)
    expect(t.lost.length).toBe(1)                           // счётчику разрешено идти по строкам
    expect(t.log.some(l => /WARN.*число со вкладки пропало/.test(l))).toBe(true)
  })

  it('[!] число не нашлось НИ РАЗУ → в журнале всё равно есть запись (раньше была тишина)', async () => {
    const t = make({ exec: () => Promise.resolve({ strip: false, tabs: [] }) })
    for (let i = 0; i < TAB_MISS_LIMIT; i++) { t.poll.ask(); await vi.advanceTimersByTimeAsync(10) }
    expect(t.log.some(l => /WARN.*не читается ни разу/.test(l))).toBe(true)
    expect(t.lost.length).toBe(0) // терять нечего — точного числа и не было
  })

  it('[!] страница ушла с раздела «Отзывы» → признак «есть точное число» СБРАСЫВАЕТСЯ', async () => {
    // Иначе подсчёт строк заблокирован навсегда и значок замирает до перезапуска программы.
    let url = REVIEWS
    const t = make({ getUrl: () => url })
    t.poll.ask(); await vi.advanceTimersByTimeAsync(10)
    expect(t.poll.isExact()).toBe(true)
    url = 'https://seller.ozon.ru/auth'                     // Ozon выкинул на вход
    for (let i = 0; i < TAB_MISS_LIMIT; i++) { t.poll.ask(); await vi.advanceTimersByTimeAsync(10) }
    expect(t.poll.isExact()).toBe(false)
    expect(t.lost.length).toBe(1)
  })

  it('удачный ответ обнуляет счёт промахов', async () => {
    let tabs = { strip: false, tabs: [] }
    const t = make({ exec: () => Promise.resolve(tabs) })
    t.poll.ask(); await vi.advanceTimersByTimeAsync(10)
    tabs = TABS_13
    t.poll.ask(); await vi.advanceTimersByTimeAsync(10)
    tabs = { strip: false, tabs: [] }
    t.poll.ask(); t.poll.ask(); await vi.advanceTimersByTimeAsync(10)
    expect(t.poll.isExact()).toBe(true) // двух промахов после успеха мало
  })

  it('нет интернета → не спрашиваем', async () => {
    const exec = vi.fn(() => Promise.resolve(TABS_13))
    const t = make({ exec, isOnline: () => false })
    t.poll.ask(); await vi.advanceTimersByTimeAsync(10)
    expect(exec).not.toHaveBeenCalled()
  })

  it('[!] страницу закрыли → повторяющийся опрос останавливается', async () => {
    let alive = true
    const exec = vi.fn(() => Promise.resolve(TABS_13))
    const t = make({ exec, isAlive: () => alive })
    t.poll.start()
    await vi.advanceTimersByTimeAsync(31000)
    const before = exec.mock.calls.length
    expect(before).toBeGreaterThan(0)
    alive = false
    await vi.advanceTimersByTimeAsync(120000)
    expect(exec.mock.calls.length).toBe(before)
  })

  it('повторный запуск не заводит второй таймер', async () => {
    const exec = vi.fn(() => Promise.resolve(TABS_13))
    const t = make({ exec })
    t.poll.start(); t.poll.start(); t.poll.start()
    await vi.advanceTimersByTimeAsync(31000)
    expect(exec.mock.calls.length).toBe(1)
    t.poll.stop()
  })
})
