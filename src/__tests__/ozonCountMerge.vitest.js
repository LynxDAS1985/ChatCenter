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
import { applyOzonExact, applyOzonRowCount, applyOzonSectionCount, clearOzonExact, RV_SRC } from '../../shared/ozonCountMerge.js'

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
describe('Ozon: вопросы — два числа рядом', () => {
  it('[!] точное «Новое» идёт на значок, подсчёт без ответа ложится РЯДОМ, а не поверх', () => {
    const exact = applyOzonExact({}, 1, 'qa')
    expect(exact.next).toEqual({ qa: 1, qaSrc: RV_SRC.TAB })
    const rows = applyOzonSectionCount(exact.next, 'qa', 4)
    expect(rows.next.qa).toBe(1)        // значок по-прежнему показывает «не открытые»
    expect(rows.next.qaUnans).toBe(4)   // а «без ответа» сохранено для подсказки
  })

  it('[!] точного числа нет → значок ведёт подсчёт строк, как раньше', () => {
    const r = applyOzonSectionCount({}, 'qa', 4)
    expect(r.next.qa).toBe(4)
    expect(r.next.qaUnans).toBe(4)
  })

  it('[!] точное число вопросов потерялось → значок снова идёт по подсчёту строк', () => {
    const lost = clearOzonExact({ qa: 1, qaSrc: RV_SRC.TAB, qaUnans: 4 }, 'qa')
    expect(lost.next.qaSrc).toBe(RV_SRC.ROWS)
    const back = applyOzonSectionCount(lost.next, 'qa', 4)
    expect(back.next.qa).toBe(4)
  })

  it('точное число отзывов и вопросов не путаются между собой', () => {
    const a = applyOzonExact({}, 16, 'rv')
    const b = applyOzonExact(a.next, 1, 'qa')
    expect(b.next).toEqual({ rv: 16, rvSrc: RV_SRC.TAB, qa: 1, qaSrc: RV_SRC.TAB })
  })

  it('«Сообщения» точного числа не имеют — пишутся напрямую', () => {
    expect(applyOzonSectionCount({ msg: 1 }, 'msg', 0).next.msg).toBe(0)
  })
})
