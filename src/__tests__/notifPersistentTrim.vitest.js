// v1.2.488 → v1.2.489 — предел «вечных» карточек уведомлений по РЕАЛЬНОЙ высоте.
// @vitest-environment jsdom
//
// Число MAX_PERSISTENT_ITEMS считает карточку в 180 точек, а раскрытая бывает до 420: 19.09.2026 шесть
// карточек дали стопку 2516 точек при экране 796 — часть за краем. Теперь перед новой «вечной» карточкой
// меряем фактические высоты и снимаем старейшие, пока стопка + место под новую не влезет в экран.
// v1.2.489: правило переехало в свой файл notification-limits.js; закрывающиеся карточки не считаются;
// место под новую — постоянные 160 (почему не медиана — комментарий в файле).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs'

const logged = []
beforeAll(async () => {
  window.notifApi = { log: (l, m) => logged.push(l + ' ' + m) }
  await import('../../main/notification-helpers.js')
  await import('../../main/notification-limits.js') // как в notification.html: оба кладут функции в один набор
})
beforeEach(() => { logged.length = 0 })

const H = () => window.__ccNotifHelpers
const BUDGET_816 = 816 - 20 // рабочая область 816 (машина пользователя) минус поля 10+10
const card = (h, pe) => ({ offsetHeight: h, style: { pointerEvents: pe || '' } })

describe('decidePersistentTrim — сколько старейших снять', () => {
  it('пусто → ничего', () => {
    expect(H().decidePersistentTrim([], BUDGET_816)).toBe(0)
    expect(H().decidePersistentTrim(null, BUDGET_816)).toBe(0)
  })

  it('стопка влезает вместе с местом под новую → ничего', () => {
    // 133+152+206 + зазоры 12 + резерв 164 = 667 ≤ 796
    expect(H().decidePersistentTrim([133, 152, 206], BUDGET_816)).toBe(0)
  })

  it('[!] ЛОВУШКА (реальные числа 19.09): шесть раскрытых по ~420 при экране 796 → снять 5, остаётся 1 + новая', () => {
    expect(H().decidePersistentTrim([420, 420, 420, 420, 420, 420], BUDGET_816)).toBe(5)
  })

  it('смешанные высоты из снимка 13:38 (133…261) → снять 3, остаются три свежие + место под новую', () => {
    // остаток [133, 170, 261] = 576 с зазорами + резерв 164 = 740 ≤ 796
    expect(H().decidePersistentTrim([133, 152, 206, 133, 170, 261], BUDGET_816)).toBe(3)
  })

  it('[!] ЛОВУШКА: одна карточка выше экрана — последнюю НЕ снимаем', () => {
    expect(H().decidePersistentTrim([900], BUDGET_816)).toBe(0)
  })

  it('две гигантские → снять одну (остаётся одна + новая, пусть и с переливом)', () => {
    expect(H().decidePersistentTrim([900, 900], BUDGET_816)).toBe(1)
  })

  it('место под новую — постоянные 160: пять мелких по 100 влезают при 796, при 600 снимаем одну', () => {
    expect(H().decidePersistentTrim([100, 100, 100, 100, 100], BUDGET_816)).toBe(0)
    expect(H().decidePersistentTrim([100, 100, 100, 100, 100], 600)).toBe(1)
  })

  it('[!] ЛОВУШКА #3 из ревью v1.2.488: после высокого альбома короткая карточка НЕ снимает лишнюю', () => {
    // «по свежей» (400) и медиана (200) давали 2; постоянные 160 → 1: остаток [200, 400] = 608 + 164 = 772 ≤ 796
    expect(H().decidePersistentTrim([200, 200, 400], BUDGET_816)).toBe(1)
  })
})

describe('бюджет и живой контейнер', () => {
  it('бюджет = рабочая область экрана минус поля 10+10; экрана нет → 780', () => {
    expect(H().persistentBudgetPx({ availHeight: 816 })).toBe(796)
    expect(H().persistentBudgetPx(null)).toBe(780)
    expect(H().persistentBudgetPx({ availHeight: 'мусор' })).toBe(780)
  })

  it('shouldTrimOldest меряет карточки контейнера, пропускает неотрисованные и пишет в журнал причину', () => {
    const container = { children: [card(420), card(0), card(420), card(420)] }
    expect(H().shouldTrimOldest(container, { availHeight: 816 })).toBe(true)
    expect(logged.join('\n')).toContain('trim-by-height: карточек=3 высота=1272 бюджет=796')
    logged.length = 0
    expect(H().shouldTrimOldest({ children: [card(141)] }, { availHeight: 816 })).toBe(false)
    expect(logged.length).toBe(0) // влезает — не шумим
  })

  it('[!] ЛОВУШКА #1 из ревью v1.2.488: закрывающаяся карточка (pointerEvents=none) НЕ занимает место', () => {
    // 3 живые по 250 + одна уже закрывается: раньше «к снятию 2», теперь честно 1 (3×254 + 164 = 926 > 796 → снять одну)
    const container = { children: [card(250), card(250), card(250), card(250, 'none')] }
    expect(H().cardHeights(container)).toEqual([250, 250, 250])
    expect(H().shouldTrimOldest(container, { availHeight: 816 })).toBe(true)
    expect(logged.join('\n')).toContain('карточек=3 высота=762')
    expect(logged.join('\n')).toContain('всего к снятию 1')
  })
})

describe('[!] ЛОВУШКИ подключения (notification.js / notification.html / сборка)', () => {
  const SRC = fs.readFileSync('main/notification.js', 'utf8')
  const HTML = fs.readFileSync('main/notification.html', 'utf8')
  const HELPERS = fs.readFileSync('main/notification-helpers.js', 'utf8')
  const VITE = fs.readFileSync('electron.vite.config.js', 'utf8')

  it('второй предел стоит ТОЛЬКО для «вечных» карточек и оставляет минимум одну', () => {
    expect(SRC).toContain("while (data.dismissMs === 0 && items.size > 1 && window.__ccNotifHelpers.shouldTrimOldest(container, window.screen))")
  })
  it('число-предел (внешний потолок) на месте — страж notificationWindowBounds его требует', () => {
    expect(SRC).toMatch(/const MAX_PERSISTENT_ITEMS = Math\.max\(6, Math\.min\(14, Math\.floor\(.*availHeight.*\/ 180\)\)\)/)
    expect(SRC).toContain('while (items.size >= maxItems)')
  })
  it('файл предела подключён в окне ДО notification.js и копируется в сборку', () => {
    const limitsAt = HTML.indexOf('notification-limits.js')
    const mainAt = HTML.indexOf('"notification.js"')
    expect(limitsAt).toBeGreaterThan(0)
    expect(limitsAt).toBeLessThan(mainAt)
    expect(VITE).toContain("{ from: 'main/notification-limits.js', to: 'out/main/notification-limits.js' }")
  })
  it('правило предела живёт в ОДНОМ файле — в helpers дубля не осталось', () => {
    expect(HELPERS).not.toContain('decidePersistentTrim')
    expect(HELPERS).not.toContain('NEW_CARD_FALLBACK_PX')
  })
})
