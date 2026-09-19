// v1.2.488 — предел «вечных» карточек уведомлений по РЕАЛЬНОЙ высоте.
// @vitest-environment jsdom
//
// Число MAX_PERSISTENT_ITEMS считает карточку в 180 точек, а раскрытая бывает до 420: 19.09.2026 шесть
// карточек дали стопку 2516 точек при экране 796 — часть за краем. Теперь перед новой «вечной» карточкой
// меряем фактические высоты и снимаем старейшие, пока стопка + место под новую не влезет в экран.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs'

const logged = []
beforeAll(async () => {
  window.notifApi = { log: (l, m) => logged.push(l + ' ' + m) }
  await import('../../main/notification-helpers.js')
})
beforeEach(() => { logged.length = 0 })

const H = () => window.__ccNotifHelpers
const BUDGET_816 = 816 - 20 // рабочая область 816 (машина пользователя) минус поля 10+10

describe('decidePersistentTrim — сколько старейших снять', () => {
  it('пусто → ничего', () => {
    expect(H().decidePersistentTrim([], BUDGET_816)).toBe(0)
    expect(H().decidePersistentTrim(null, BUDGET_816)).toBe(0)
  })

  it('стопка влезает вместе с местом под новую → ничего', () => {
    // 133+152+206 + зазоры + резерв 210 = 722 ≤ 796
    expect(H().decidePersistentTrim([133, 152, 206], BUDGET_816)).toBe(0)
  })

  it('[!] ЛОВУШКА (реальные числа 19.09): шесть раскрытых по ~420 при экране 796 → снять 5, остаётся 1 + новая', () => {
    expect(H().decidePersistentTrim([420, 420, 420, 420, 420, 420], BUDGET_816)).toBe(5)
  })

  it('смешанные высоты из снимка 13:38 (133…261) → снять 4, остаются две свежие + место под новую', () => {
    // остаток [170, 261] = 439 + резерв (261+4) = 704 ≤ 796
    expect(H().decidePersistentTrim([133, 152, 206, 133, 170, 261], BUDGET_816)).toBe(4)
  })

  it('[!] ЛОВУШКА: одна карточка выше экрана — последнюю НЕ снимаем', () => {
    expect(H().decidePersistentTrim([900], BUDGET_816)).toBe(0)
  })

  it('две гигантские → снять одну (остаётся одна + новая, пусть и с переливом)', () => {
    expect(H().decidePersistentTrim([900, 900], BUDGET_816)).toBe(1)
  })

  it('резерв под новую не меньше 160, даже если свежая карточка крохотная', () => {
    // 5 карточек по 100 = 520 с зазорами; резерв 164 → 684 ≤ 796 → 0; при бюджете 600 → надо снять
    expect(H().decidePersistentTrim([100, 100, 100, 100, 100], BUDGET_816)).toBe(0)
    expect(H().decidePersistentTrim([100, 100, 100, 100, 100], 600)).toBe(1)
  })
})

describe('бюджет и живой контейнер', () => {
  it('бюджет = рабочая область экрана минус поля 10+10; экрана нет → 780', () => {
    expect(H().persistentBudgetPx({ availHeight: 816 })).toBe(796)
    expect(H().persistentBudgetPx(null)).toBe(780)
    expect(H().persistentBudgetPx({ availHeight: 'мусор' })).toBe(780)
  })

  it('shouldTrimOldest меряет карточки контейнера, пропускает неотрисованные и пишет в журнал причину', () => {
    const container = { children: [{ offsetHeight: 420 }, { offsetHeight: 0 }, { offsetHeight: 420 }, { offsetHeight: 420 }] }
    expect(H().shouldTrimOldest(container, { availHeight: 816 })).toBe(true)
    expect(logged.join('\n')).toContain('trim-by-height: карточек=3 высота=1272 бюджет=796')
    logged.length = 0
    expect(H().shouldTrimOldest({ children: [{ offsetHeight: 141 }] }, { availHeight: 816 })).toBe(false)
    expect(logged.length).toBe(0) // влезает — не шумим
  })
})

describe('[!] ЛОВУШКИ подключения к окну (notification.js)', () => {
  const SRC = fs.readFileSync('main/notification.js', 'utf8')
  it('второй предел стоит ТОЛЬКО для «вечных» карточек и оставляет минимум одну', () => {
    expect(SRC).toContain("while (data.dismissMs === 0 && items.size > 1 && window.__ccNotifHelpers.shouldTrimOldest(container, window.screen))")
  })
  it('число-предел (внешний потолок) на месте — страж notificationWindowBounds его требует', () => {
    expect(SRC).toMatch(/const MAX_PERSISTENT_ITEMS = Math\.max\(6, Math\.min\(14, Math\.floor\(.*availHeight.*\/ 180\)\)\)/)
    expect(SRC).toContain('while (items.size >= maxItems)')
  })
})
