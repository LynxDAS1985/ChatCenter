// v1.2.501 — адреса разделов Ozon живут в ОДНОМ месте (shared/ozonSections.js).
//
// ЗАЧЕМ ЭТОТ ТЕСТ. Один и тот же адрес был записан в четырёх местах: переход по уведомлению,
// быстрый виджет, фоновые страницы и пресет мессенджера. Они уже разъехались: у перехода
// «Сообщения» были без подраздела покупателей (`?group=customers_v2`), у виджета — с ним, и
// переход открывал не тот список. Тест ловит возврат такого расхождения.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { OZON_SECTION_URL, OZON_SECTION_PATH, OZON_BG_URLS, OZON_BADGE_MAX, OZON_QA_PAGE, ozonBadgeText, ozonQaPartial, ozonTipText, ozonWidgetCounts } from '../../shared/ozonSections.js'

describe('Ozon: адреса разделов — один источник', () => {
  it('[!] в коде экранов не осталось вписанных руками адресов кабинета', () => {
    // Исключение: shared/messengerPresets.js — там СТАРТОВАЯ страница новой вкладки Ozon, другое
    // назначение (её открывает человек при добавлении мессенджера), поэтому она живёт отдельно.
    const files = ['src/App.jsx', 'src/native/components/OzonQuickWidget.jsx', 'shared/ozonNavigateScript.js']
    for (const f of files) {
      const code = fs.readFileSync(f, 'utf8')
      const hardcoded = code.match(/'https:\/\/seller\.ozon\.ru\/app[^']*'/g) || []
      expect(hardcoded, f + ': адрес обязан браться из shared/ozonSections.js').toEqual([])
    }
  })

  it('[!] «Сообщения» ведут в подраздел покупателей (иначе открывается не тот список)', () => {
    expect(OZON_SECTION_URL.list).toContain('group=customers_v2')
    const widget = fs.readFileSync('src/native/components/OzonQuickWidget.jsx', 'utf8')
    expect(widget, 'виджет берёт тот же адрес').toContain('OZON_SECTION_URL.list')
  })

  it('[!] порядок фоновых страниц не менялся — от него зависят частоты обновления', () => {
    // src/App.jsx выбирает частоту по номеру страницы: 0 — раз в минуту, 2 — раз в три минуты.
    expect(OZON_BG_URLS).toEqual([OZON_SECTION_URL.q, OZON_SECTION_URL.list, OZON_SECTION_URL.rv])
    const app = fs.readFileSync('src/App.jsx', 'utf8')
    expect(app).toContain('OZON_BG_URLS')
    expect(app, 'частоты по-прежнему привязаны к номеру страницы').toContain('bgI === 0 ? 60000')
  })

  it('пути разделов согласованы с адресами', () => {
    for (const key of ['q', 'rv', 'list']) {
      expect(OZON_SECTION_URL[key], key).toContain(OZON_SECTION_PATH[key])
    }
  })
})

describe('Ozon: «жди не дольше» — одна общая реализация', () => {
  it('[!] быстрая проба использует общий помощник, пятой копии нет', () => {
    const probe = fs.readFileSync('shared/webviewHealthProbe.js', 'utf8')
    expect(probe, 'quickProbe переведён на общий помощник').toContain("from './withTimeout.js'")
    expect(probe, 'предупреждение о пятой копии стоит на месте').toContain('ПЯТУЮ копию')
    // в quickProbe своей гонки больше нет (в большой проверке она оставлена намеренно).
    // Ищем именно ВОЗВРАТ гонки, а не слово в пояснении — иначе тест ловил бы собственный комментарий.
    const quick = probe.slice(probe.indexOf('export function quickProbe'))
    expect(quick).not.toContain('return Promise.race(')
    expect(quick).toContain('withTimeout(')
  })
})

// v1.2.508, по прямому указанию пользователя: «если вопросов или отзывов больше 30, писать вместо
// 31 или 32 — 30+». Прежнее правило (плюс, когда список виден не весь) давало «3+» при трёх
// вопросах — человек читал это как «их больше трёх», что неверно.
describe('Ozon: предел числа на значке — 30, дальше «30+»', () => {
  it('[!] граница: 30 — точное число, 31 — уже «30+»', () => {
    expect(OZON_BADGE_MAX).toBe(30)
    expect(ozonBadgeText(29)).toBe('29')
    expect(ozonBadgeText(30)).toBe('30')
    expect(ozonBadgeText(31)).toBe('30+')
    expect(ozonBadgeText(999)).toBe('30+')
  })

  it('[!] три вопроса показываются как «3», а НЕ «3+»', () => {
    expect(ozonBadgeText(3)).toBe('3')
  })

  it('мусор вместо числа не рисует «NaN»', () => {
    for (const bad of [undefined, null, NaN, 'пять', {}, -7, Infinity]) {
      expect(ozonBadgeText(bad), String(bad)).toBe('0')
    }
  })
})

// v1.2.508 (по ревью): значок и подсказка говорят ОДНО И ТО ЖЕ; значок вопросов не пропадает.
describe('Ozon: неполнота списка объясняется СЛОВАМИ в подсказке (v1.2.508)', () => {
  it('[!] список виден не весь → подсказка честно об этом говорит', () => {
    expect(ozonQaPartial(999)).toBe(true)
    expect(ozonTipText('qa', 'Вопросы', 4, { qaTotal: 999 })).toMatch(/среди первых|не весь список/)
  })

  it('[!] список виден целиком → никакой оговорки, и на значке просто «3»', () => {
    expect(ozonQaPartial(3)).toBe(false)
    expect(ozonTipText('qa', 'Вопросы', 3, { qaTotal: 3 })).toBe('Вопросы · 3 без ответа')
    expect(ozonBadgeText(3)).toBe('3')
  })

  it('сколько всего неизвестно → считаем список неполным и говорим это словами', () => {
    expect(ozonQaPartial(0)).toBe(true)
    expect(ozonTipText('qa', 'Вопросы', 4, { qaTotal: 0 })).toContain('не весь список')
  })

  it('заглушку «999+» в подсказке не выдаём за точное число', () => {
    expect(ozonTipText('qa', 'Вопросы', 4, { qaTotal: 999 })).toContain('с лишним')
  })
})

describe('Ozon: значок «Вопросы» не пропадает (v1.2.508)', () => {
  it('[!] сторож молчит (нет столбца «Ответы») → показываем «Новое» со вкладки, а не пустоту', () => {
    expect(ozonWidgetCounts({ qaNew: 1, qaTotal: 999 }).qa).toBe(1)
  })

  it('[!] честный ноль сохраняется: «без ответа» пришло и равно нулю', () => {
    expect(ozonWidgetCounts({ qa: 0, qaNew: 1 }).qa).toBe(0)
  })

  it('обычный случай: показываем «без ответа»', () => {
    expect(ozonWidgetCounts({ qa: 4, qaNew: 1 }).qa).toBe(4)
  })

  it('пустое состояние не падает', () => {
    expect(ozonWidgetCounts(null)).toEqual({ msg: 0, qa: 0, rv: 0, qaNew: 0, qaTotal: 0 })
  })
})
