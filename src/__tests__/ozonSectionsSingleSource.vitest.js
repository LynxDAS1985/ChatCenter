// v1.2.501 — адреса разделов Ozon живут в ОДНОМ месте (shared/ozonSections.js).
//
// ЗАЧЕМ ЭТОТ ТЕСТ. Один и тот же адрес был записан в четырёх местах: переход по уведомлению,
// быстрый виджет, фоновые страницы и пресет мессенджера. Они уже разъехались: у перехода
// «Сообщения» были без подраздела покупателей (`?group=customers_v2`), у виджета — с ним, и
// переход открывал не тот список. Тест ловит возврат такого расхождения.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { OZON_SECTION_URL, OZON_SECTION_PATH, OZON_BG_URLS } from '../../shared/ozonSections.js'

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
