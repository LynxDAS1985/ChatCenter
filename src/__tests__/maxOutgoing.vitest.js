// v1.2.463: ЖАЛОБА «почему мои сообщения приходят в уведомления» (МАКС).
//
// Корень (доказан журналом chatcenter.log 2026-09-15 + чтением кода): признак «своё отправленное»
// с v1.2.427 только ИЗМЕРЯЛСЯ и писался в журнал строкой `[MAX-OUT-DIAG]`, решения по нему не
// принимал НИКТО. Свои сообщения гасило лишь соседнее правило «вкладка открыта» — оно зависит от
// фокуса окна, поэтому «отправил и переключился» пробивало защиту. За 2026-09-15: поймано 4 своих
// сообщения, 2 стали карточками уведомлений (id=12 «Понял, отлично», id=39 «смотрю»).
//
// Числа ниже — РЕАЛЬНЫЕ из журнала: строка чата rowL=471 rowW=524 → правый край 995.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { maxOutgoingDecision } = require('../../main/preloads/utils/maxDiagnostics.js')

const ROW = { rowLeft: 471, rowRight: 995 }   // строка переписки МАКС из журнала

describe('maxOutgoingDecision — своё отправленное сообщение МАКС (v1.2.463)', () => {
  it('ВХОДЯЩЕЕ: пузырь прижат влево (bubbleL=487 = край строки + 16) → НЕ своё', () => {
    const d = maxOutgoingDecision({ ...ROW, bubbleLeft: 487, bubbleRight: 700 })
    expect(d.outgoing).toBe(false)
    expect(d.reason).toBe('прижат-влево')
  })

  it('ИСХОДЯЩЕЕ «смотрю» (bubbleL=848 из журнала, карточка id=39) → СВОЁ', () => {
    expect(maxOutgoingDecision({ ...ROW, bubbleLeft: 848, bubbleRight: 979 }).outgoing).toBe(true)
  })

  it('ИСХОДЯЩЕЕ «Понял, отлично» (bubbleL=791 из журнала, карточка id=12) → СВОЁ', () => {
    expect(maxOutgoingDecision({ ...ROW, bubbleLeft: 791, bubbleRight: 979 }).outgoing).toBe(true)
  })

  it('ИСХОДЯЩЕЕ длинное «Нет, он придёт завтра…» (bubbleL=634) → СВОЁ', () => {
    expect(maxOutgoingDecision({ ...ROW, bubbleLeft: 634, bubbleRight: 979 }).outgoing).toBe(true)
  })

  it('ИСХОДЯЩЕЕ «3 340 получено, спасибо» (bubbleL=724) → СВОЁ', () => {
    expect(maxOutgoingDecision({ ...ROW, bubbleLeft: 724, bubbleRight: 979 }).outgoing).toBe(true)
  })

  it('🔴 ЛОВУШКА: ШИРОКОЕ ВХОДЯЩЕЕ (пузырь почти во всю строку) НЕ должно стать «своим»', () => {
    // Самая дорогая ошибка: проглоченное чужое сообщение. Пузырь от левого края и почти до правого.
    const d = maxOutgoingDecision({ ...ROW, bubbleLeft: 487, bubbleRight: 990 })
    expect(d.outgoing).toBe(false)
  })

  it('🔴 ЛОВУШКА: СОМНИТЕЛЬНЫЙ случай (пузырь во всю ширину) → пропускаем, а не глушим', () => {
    const d = maxOutgoingDecision({ ...ROW, bubbleLeft: 490, bubbleRight: 976 })
    expect(d.outgoing).toBe(false)
    expect(d.reason).toBe('во-всю-ширину-не-знаем')
  })

  it('🔴 ЛОВУШКА: перевес меньше запаса 40 точек не считается «своим»', () => {
    // leftGap=60, rightGap=30 → разница 30 < 40 → решения нет
    const d = maxOutgoingDecision({ ...ROW, bubbleLeft: 531, bubbleRight: 965 })
    expect(d.outgoing).toBe(false)
  })

  it('сбой замера (нет чисел / нулевой размер) → НЕ своё, сообщение проходит', () => {
    expect(maxOutgoingDecision(null).outgoing).toBe(false)
    expect(maxOutgoingDecision({ rowLeft: 0, rowRight: 0, bubbleLeft: 0, bubbleRight: 0 }).outgoing).toBe(false)
    expect(maxOutgoingDecision({ ...ROW, bubbleLeft: 700, bubbleRight: 700 }).reason).toBe('нулевой-размер')
  })
})

describe('проводка: решение реально стоит на пути сообщения (v1.2.463)', () => {
  const fs = require('node:fs')

  it('monitor.preload.cjs спрашивает решение и ПРЕРЫВАЕТ обработку своего сообщения', () => {
    const code = fs.readFileSync('main/preloads/monitor.preload.cjs', 'utf8')
    expect(code).toContain('maxOutgoingVerdict(node)')
    // Главное: после вердикта есть выход из обработки, а не только запись в журнал.
    expect(code).toMatch(/maxOutgoingVerdict\(node\)[\s\S]{0,400}?if \(mo\.outgoing\) continue/)
    // Проверка обязана стоять ДО того, как текст попадёт в список на отправку.
    expect(code.indexOf('if (mo.outgoing) continue')).toBeLessThan(code.indexOf('foundTexts.push(text)'))
  })

  it('🔴 ЛОВУШКА: старое «измерение без решения» не вернулось под прежним именем', () => {
    const code = fs.readFileSync('main/preloads/utils/maxDiagnostics.js', 'utf8')
    expect(code).not.toMatch(/function maxOutgoingReport/)
    expect(code).toContain('module.exports')
    expect(code).toMatch(/maxOutgoingVerdict/)
  })

  it('решение НЕ опирается на число значков (у входящего файла их тоже 2)', () => {
    const code = fs.readFileSync('main/preloads/utils/maxDiagnostics.js', 'utf8')
    const decision = code.slice(code.indexOf('function maxOutgoingDecision'), code.indexOf('function maxOutgoingVerdict'))
    expect(decision).not.toContain('ticks')
  })
})
