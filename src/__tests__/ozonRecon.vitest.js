// v1.2.502 — тест ВРЕМЕННОЙ разведки страниц Ozon (shared/ozonRecon.js).
//
// ЗАЧЕМ. Разведка нужна, чтобы отличить три причины неверного счётчика «Отзывы»: дорисовку
// запускает прокрутка / мешает невидимое окно / у Ozon есть готовое число. Вывод разведки я буду
// читать в журнале и по нему выбирать лекарство — значит ВЫВОД обязан быть правильным, иначе
// лечить начнём не то. Тест проверяет именно вывод, а не «функция не упала».
//
// Удалить вместе с shared/ozonRecon.js, когда причина будет названа.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OZON_RECON_SCRIPT, RECON_SCROLL_STEPS, formatOzonRecon } from '../../shared/ozonRecon.js'
import { bindOzonBgWatcher } from '../utils/ozonBgWatcher.js'
import { resetOzonNotifDedup } from '../../shared/ozonNotifDedup.js'

/** Всё, что разведка вернула бы с настоящей страницы; в каждом случае меняем нужное. */
const base = { path: '/app/reviews', search: '', rows0: 6, total: 5200, innerH: 800, docH: 5000, docH2: 5000, scroller: 'нет — прокручивается сам документ', texts: [] }

describe('разведка Ozon: сам скрипт', () => {
  it('[!] скрипт — правильный JavaScript (иначе страница молча его отвергнет)', () => {
    // Компилируем, но НЕ выполняем: внутри document/window, которых в проверке нет.
    expect(() => new Function(OZON_RECON_SCRIPT)).not.toThrow()
  })

  it('[!] скрипт реально прокручивает и пересчитывает строки — иначе разведка бессмысленна', () => {
    expect(OZON_RECON_SCRIPT).toContain('scrollTop')
    expect(OZON_RECON_SCRIPT).toContain('scrollTo')
    expect(OZON_RECON_SCRIPT).toContain('afterScroll')
    // число шагов подставляется из константы — проверяем, что подстановка сработала
    expect(OZON_RECON_SCRIPT).toContain('s < ' + RECON_SCROLL_STEPS)
  })
})

describe('разведка Ozon: вывод для журнала', () => {
  it('[!] прокрутка помогла → вывод велит лечить прокруткой, прибавка посчитана', () => {
    const lines = formatOzonRecon({ ...base, afterScroll: [12, 20, 21] })
    const all = lines.join(' | ')
    expect(all).toContain('прокрутка РАБОТАЕТ')
    expect(all).toContain('+15')            // было 6, стало 21
    expect(all).toContain('12 → 20 → 21')   // сама лесенка попала в журнал
    expect(all).toContain('было 6')
  })

  it('[!] прокрутка НЕ помогла, но запас есть → вывод велит лечить высотой окна', () => {
    const lines = formatOzonRecon({ ...base, afterScroll: [6, 6, 6] }).join(' | ')
    expect(lines).toContain('невидимом окне')
    expect(lines).toContain('прибавка 0')
  })

  it('[!] прокручивать нечего (список весь на странице) → вывод велит смотреть надписи', () => {
    const lines = formatOzonRecon({ ...base, docH: 830, docH2: 830, afterScroll: [6, 6, 6] }).join(' | ')
    expect(lines).toContain('прокручивать НЕЧЕГО')
  })

  it('готовое число со страницы попадает в журнал целиком', () => {
    const lines = formatOzonRecon({ ...base, afterScroll: [6], texts: ['Все', 'Новые 12', 'Обработанные'] }).join(' | ')
    expect(lines).toContain('Новые 12')
  })

  it('страница не ответила → честная строка, а не пустота', () => {
    expect(formatOzonRecon(null).join(' ')).toContain('вернула пусто')
    expect(formatOzonRecon(120).join(' ')).toContain('вернула пусто') // чужой ответ (число) — тоже не разведка
  })
})

describe('разведка Ozon: запуск из фоновой страницы', () => {
  beforeEach(() => { resetOzonNotifDedup(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  function makeEl() {
    const handlers = {}
    return {
      addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn) },
      getURL: () => 'https://seller.ozon.ru/app/reviews',
      isConnected: true,
      reload: vi.fn(),
      executeJavaScript: vi.fn(() => Promise.resolve({ ...base, afterScroll: [12, 20, 21] })),
      fire: (t, ev) => (handlers[t] || []).forEach((fn) => fn(ev)),
    }
  }

  it('[!] разведка идёт ОДИН раз, хотя страница перезагружается каждую минуту', async () => {
    const el = makeEl()
    const log = vi.fn()
    bindOzonBgWatcher(el, 'ozon', { handleNewMessage: vi.fn(), setOzonCounts: vi.fn(), log })
    el.fire('did-finish-load')
    el.fire('did-finish-load')   // перезагрузка страницы
    el.fire('did-finish-load')
    // advanceTimersByTimeAsync (не обычный advanceTimersByTime): разведка отвечает ОБЕЩАНИЕМ,
    // и без прокрутки микрозадач журнал ещё пуст — на этом тест и падал при написании.
    await vi.advanceTimersByTimeAsync(4000)
    const reconCalls = el.executeJavaScript.mock.calls.filter(c => String(c[0]).includes('afterScroll'))
    expect(reconCalls.length).toBe(1)
    expect(log.mock.calls.some(c => /ozon-recon.*прокрутка РАБОТАЕТ/.test(String(c[1])))).toBe(true)
  })

  it('страницу закрыли до разведки → не лезем в мёртвое окно', () => {
    const el = makeEl()
    bindOzonBgWatcher(el, 'ozon', { handleNewMessage: vi.fn(), setOzonCounts: vi.fn(), log: vi.fn() })
    el.fire('did-finish-load')
    el.isConnected = false
    vi.advanceTimersByTime(4000)
    expect(el.executeJavaScript).not.toHaveBeenCalled()
  })
})
