// v1.2.505 — правило «кто главнее», когда число новых отзывов приходит из двух мест
// (shared/ozonCountMerge.js).
//
// ЗАЧЕМ. Ревью v1.2.505 доказало три беды прежней схемы:
//  • защита «есть точное число — подсчёту строк не верим» стояла только на пути невидимой
//    страницы; открытая вкладка писала своё заниженное число напрямую, и значок мигал 13 → 5 → 13;
//  • правило «только вверх» не давало значку погаснуть: после потери точного числа старое 13
//    нельзя было понизить ничем, и значок залипал навсегда;
//  • оба пути писали число по-своему, поэтому починить в одном месте было нельзя.
import { describe, it, expect } from 'vitest'
import { applyOzonExact, applyOzonRowCount, applyOzonSectionCount, applyOzonQaTotal, clearOzonExact, RV_SRC } from '../../shared/ozonCountMerge.js'

describe('Ozon: точное число со вкладки', () => {
  it('[!] точное число побеждает и вверх, и ВНИЗ (иначе значок не погаснет)', () => {
    const up = applyOzonExact({ rv: 5, rvSrc: RV_SRC.ROWS }, 13)
    expect(up.next.rv).toBe(13)
    const down = applyOzonExact({ rv: 13, rvSrc: RV_SRC.TAB }, 0)
    expect(down.next.rv).toBe(0)
  })

  it('то же число второй раз не дёргает состояние', () => {
    expect(applyOzonExact({ rv: 13, rvSrc: RV_SRC.TAB }, 13).next).toBeNull()
  })

  it('мусор вместо числа состояние не портит', () => {
    for (const bad of [undefined, null, NaN, 'семь', -1, {}]) {
      expect(applyOzonExact({ rv: 13, rvSrc: RV_SRC.TAB }, bad).next, String(bad)).toBeNull()
    }
  })
})

describe('Ozon: число из подсчёта строк', () => {
  it('[!] пока есть точное число — подсчёт строк игнорируется целиком', () => {
    const r = applyOzonRowCount({ rv: 13, rvSrc: RV_SRC.TAB }, 5)
    expect(r.next).toBeNull()
    expect(r.reason).toBe('ignored')
  })

  it('[!] точное число потерялось → СЛЕДУЮЩИЙ подсчёт принимается как есть, даже вниз', () => {
    // Без этого «только вверх» держало бы старые 13 вечно — ровно та беда, что нашло ревью.
    const lost = clearOzonExact({ rv: 13, rvSrc: RV_SRC.TAB })
    expect(lost.next.rvSrc).toBe(RV_SRC.REBASE)
    expect(lost.next.rv).toBe(13) // само число пока не трогаем
    const back = applyOzonRowCount(lost.next, 2)
    expect(back.next.rv).toBe(2)
    expect(back.reason).toBe('rebase')
    expect(back.next.rvSrc).toBe(RV_SRC.ROWS)
  })

  it('[!] дальше снова действует «только вверх» — фон не тянет вниз честное число вкладки', () => {
    // ADR-038: невидимая страница держит снимок до трёх минут и видит лишь первую порцию.
    const cur = { rv: 13, rvSrc: RV_SRC.ROWS }
    expect(applyOzonRowCount(cur, 5).next).toBeNull()
    expect(applyOzonRowCount(cur, 5).reason).toBe('kept')
    expect(applyOzonRowCount(cur, 20).next.rv).toBe(20)
  })

  it('первое значение вообще (счётчика ещё не было) принимается как есть', () => {
    const r = applyOzonRowCount({}, 4)
    expect(r.next.rv).toBe(4)
    expect(r.reason).toBe('first')
  })

  it('мусор не портит состояние', () => {
    expect(applyOzonRowCount({ rv: 3 }, 'пять').next).toBeNull()
    expect(applyOzonRowCount({ rv: 3 }, -2).next).toBeNull()
  })
})

describe('Ozon: число от ОТКРЫТОЙ вкладки идёт по тем же правилам', () => {
  it('[!] открытая вкладка НЕ перетирает точное число своим заниженным подсчётом', () => {
    // Это и есть мигание 13 → 5 → 13, найденное ревью: защита стояла только на фоновом пути.
    const r = applyOzonSectionCount({ rv: 13, rvSrc: RV_SRC.TAB }, 'rv', 5)
    expect(r.next).toBeNull()
  })

  it('«Сообщения» пишутся напрямую — вкладок со счётчиками у переписки нет', () => {
    expect(applyOzonSectionCount({ msg: 1 }, 'msg', 0).next.msg).toBe(0)
    expect(applyOzonSectionCount({ msg: 3 }, 'msg', 3).next).toBeNull()
  })
})

// v1.2.506: у «Вопросов» тоже появилось точное число со страницы — вкладка «Новое». Но смысл у
// двух чисел РАЗНЫЙ: «Новое» = сколько не открывали (считает Ozon), а подсчёт строк = сколько без
// ответа среди видимых (такого счётчика у Ozon нет). Оба нужны: первое на значке, второе в подсказке.
describe('Ozon: вопросы — на значке «без ответа», рядом второе число', () => {
  it('[!] значок ведёт «без ответа», а «Новое» со страницы его НЕ перебивает (v1.2.507)', () => {
    // Жалоба пользователя: «почему стоит 1, если 4 вопроса без ответа?». Раньше на значок шло
    // точное «Новое» (сколько не открывали) — оно точное, но отвечать надо на неотвеченные.
    const rows = applyOzonSectionCount({}, 'qa', 4)
    expect(rows.next.qa).toBe(4)
    const exact = applyOzonExact(rows.next, 1, 'qa')
    expect(exact.next.qa).toBe(4)     // значок не тронут
    expect(exact.next.qaNew).toBe(1)  // «не открыто» лежит рядом, для подсказки
  })

  it('[!] «без ответа» обновляется в обе стороны — ответили, и значок упал', () => {
    const a = applyOzonSectionCount({ qa: 4 }, 'qa', 1)
    expect(a.next.qa).toBe(1)
    const b = applyOzonSectionCount(a.next, 'qa', 0)
    expect(b.next.qa).toBe(0)
  })

  it('[!] сколько вопросов ВСЕГО запоминается — по нему ставится «+»', () => {
    const r = applyOzonQaTotal({ qa: 4 }, 999)
    expect(r.next.qaTotal).toBe(999)
    expect(applyOzonQaTotal(r.next, 999).next).toBeNull() // то же число второй раз не дёргает
    expect(applyOzonQaTotal({}, null).next).toBeNull()
  })

  it('точное число отзывов и вопросов не путаются между собой', () => {
    const a = applyOzonExact({}, 16, 'rv')
    const b = applyOzonExact(a.next, 1, 'qa')
    expect(b.next.rv).toBe(16)
    expect(b.next.rvSrc).toBe(RV_SRC.TAB)
    expect(b.next.qaNew).toBe(1)
    expect(b.next.qa).toBeUndefined() // значок вопросов этим числом НЕ управляется
  })

  it('«Сообщения» точного числа не имеют — пишутся напрямую', () => {
    expect(applyOzonSectionCount({ msg: 1 }, 'msg', 0).next.msg).toBe(0)
  })
})

// v1.2.508 (по ревью): открытая вкладка главнее невидимой, «всего» забывается, мусор не проходит.
describe('Ozon: открытая вкладка главнее фоновой (v1.2.508)', () => {
  it('[!] ОТЗЫВЫ: человек прочитал в открытой вкладке → значок ПАДАЕТ (регресс фикса v1.2.388)', () => {
    // Раньше правило «только вверх» применялось и к открытой вкладке — значок не гас никогда.
    const cur = { rv: 13, rvSrc: RV_SRC.ROWS }
    const r = applyOzonSectionCount(cur, 'rv', 2, true)
    expect(r.next.rv).toBe(2)
    expect(r.reason).toBe('front')
  })

  it('[!] ОТЗЫВЫ: фоновая страница по-прежнему НЕ понижает (ADR-038 цел)', () => {
    expect(applyOzonSectionCount({ rv: 13, rvSrc: RV_SRC.ROWS }, 'rv', 2, false).next).toBeNull()
  })

  it('[!] ВОПРОСЫ: открытая вкладка ставит своё число, фон его не перебивает вниз', () => {
    // Человек нажал «Показать ещё» и видит 9 без ответа; фон через пять секунд шлёт свои 4.
    const front = applyOzonSectionCount({}, 'qa', 9, true)
    expect(front.next.qa).toBe(9)
    expect(applyOzonSectionCount(front.next, 'qa', 4, false).next).toBeNull()
    // а вот рост фон передать обязан — новые вопросы не должны потеряться
    expect(applyOzonSectionCount(front.next, 'qa', 12, false).next.qa).toBe(12)
  })

  it('[!] «всего» ЗАБЫВАЕТСЯ, когда Ozon перестал его печатать', () => {
    // Иначе устаревшее 999 жило вечно и значок показывал «+» при уже коротком списке.
    const r = applyOzonQaTotal({ qa: 4, qaTotal: 999 }, null)
    expect(r.next.qaTotal).toBeUndefined()
  })

  it('[!] «Сообщения» тоже проверяются строго — мусор в состояние не попадает', () => {
    expect(applyOzonSectionCount({ msg: 3 }, 'msg', NaN).next).toBeNull()
    expect(applyOzonSectionCount({ msg: 3 }, 'msg', '5').next).toBeNull()
    expect(applyOzonSectionCount({ msg: 3 }, 'msg', 5).next.msg).toBe(5)
  })
})
