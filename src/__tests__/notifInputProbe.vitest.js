// v1.2.487 — «наблюдатель мыши» окна уведомлений (дело .memory-bank/notif-window-input-loss-case.md).
//
// Окно уведомлений трижды переставало принимать мышь целиком, а в журнале о мыши не было ни
// строки. Наблюдатель обязан: (1) считать события ввода от Windows, (2) заметить «курсор над
// окном двигается, а событий нет», (3) применить два безвредных шага по одному и (4) сказать,
// после какого шага мышь вернулась. Проверяем чистую логику на поддельных тиках.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  createProbeState, recordInput, decideTick, isInside, formatStatusLine, formatWindowsSummary, formatMouseDownLine,
  SUSPECT_TICKS, REMEDY_GAP_TICKS, REMEDY_COOLDOWN_MS, STATUS_EVERY_MS, REMEDY_STEPS,
} from '../../main/handlers/notifInputProbeCore.js'

const WIN = { x: 1156, y: 10, width: 371, height: 797 } // реальные границы окна из журнала 19.09
const T0 = 1_000_000_000

/** Прогоняет n тиков: курсор внутри окна и каждый раз сдвигается, событий ввода нет. */
function quietMovingTicks(state, n, startTick = 0) {
  const outs = []
  for (let i = 0; i < n; i++) {
    const k = startTick + i
    outs.push(decideTick(state, { cursor: { x: 1200 + k, y: 100 + k }, bounds: WIN, visible: true, onscreen: true, now: T0 + k * 5000 }))
  }
  return outs
}

describe('подозрение «курсор над окном, а мыши нет»', () => {
  it('окно скрыто или за экраном — наблюдатель молчит и сбрасывает счёт', () => {
    const s = createProbeState(T0)
    expect(decideTick(s, { cursor: { x: 1200, y: 100 }, bounds: WIN, visible: false, onscreen: true, now: T0 }).idle).toBe(true)
    expect(decideTick(s, { cursor: { x: 1200, y: 100 }, bounds: { x: -30000, y: -30000, width: 1, height: 1 }, visible: true, onscreen: false, now: T0 }).idle).toBe(true)
  })

  it('курсор ВНЕ окна — подозрения нет, сколько бы тиков ни прошло', () => {
    const s = createProbeState(T0)
    for (let i = 0; i < 6; i++) {
      const o = decideTick(s, { cursor: { x: 100 + i, y: 100 + i }, bounds: WIN, visible: true, onscreen: true, now: T0 + i * 5000 })
      expect(o.suspect).toBe(false)
    }
  })

  it('[!] ЛОВУШКА: курсор внутри, но НЕ двигается — это не подозрение (мышь просто лежит)', () => {
    const s = createProbeState(T0)
    for (let i = 0; i < 6; i++) {
      const o = decideTick(s, { cursor: { x: 1200, y: 100 }, bounds: WIN, visible: true, onscreen: true, now: T0 + i * 5000 })
      expect(o.suspect).toBe(false)
    }
  })

  it('курсор внутри и двигается, событий нет — подозрение ровно на третьем тике (первый тик — точка отсчёта)', () => {
    const s = createProbeState(T0)
    const outs = quietMovingTicks(s, SUSPECT_TICKS + 1)
    expect(outs[SUSPECT_TICKS - 1].suspect).toBe(false)
    expect(outs[SUSPECT_TICKS].suspect).toBe(true)
    expect(outs[SUSPECT_TICKS].warn).toBe(true)
    expect(outs.filter(o => o.warn).length).toBe(1) // предупреждение — один раз
  })

  it('[!] ЛОВУШКА: событие ввода между тиками сбрасывает подозрение', () => {
    const s = createProbeState(T0)
    quietMovingTicks(s, SUSPECT_TICKS) // на грани
    recordInput(s, { type: 'mouseMove' }, T0 + SUSPECT_TICKS * 5000 - 100)
    const o = decideTick(s, { cursor: { x: 1300, y: 300 }, bounds: WIN, visible: true, onscreen: true, now: T0 + SUSPECT_TICKS * 5000 })
    expect(o.suspect).toBe(false)
    expect(s.suspectRun).toBe(0)
  })
})

describe('самопроверка: два безвредных шага по одному', () => {
  it('шаг 1 — в тик предупреждения, шаг 2 — через два тика, дальше «исчерпано» один раз', () => {
    const s = createProbeState(T0)
    const outs = quietMovingTicks(s, SUSPECT_TICKS + REMEDY_GAP_TICKS * REMEDY_STEPS.length + 3)
    const steps = outs.map(o => o.remedyStep).filter(Boolean)
    expect(steps).toEqual(REMEDY_STEPS)
    expect(outs[SUSPECT_TICKS].remedyStep).toBe('topmost-toggle')
    expect(outs[SUSPECT_TICKS + REMEDY_GAP_TICKS].remedyStep).toBe('bounds-nudge')
    expect(outs.filter(o => o.exhausted).length).toBe(1)
    expect(outs[SUSPECT_TICKS + REMEDY_GAP_TICKS * REMEDY_STEPS.length].exhausted).toBe(true)
  })

  it('мышь вернулась после шага — наблюдатель говорит, после какого именно', () => {
    const s = createProbeState(T0)
    quietMovingTicks(s, SUSPECT_TICKS + 1) // применён шаг 1
    const r = recordInput(s, { type: 'mouseMove' }, T0 + SUSPECT_TICKS * 5000 + 1200)
    expect(r).toEqual({ restoredAfterStep: 'topmost-toggle', waitedMs: 1200 })
    expect(recordInput(s, { type: 'mouseMove' }, T0 + SUSPECT_TICKS * 5000 + 1300)).toBeNull() // повторно не сообщает
  })

  it('[!] ЛОВУШКА: вторая серия шагов не раньше, чем через 5 минут — окно не дёргаем бесконечно', () => {
    const s = createProbeState(T0)
    const first = quietMovingTicks(s, SUSPECT_TICKS + REMEDY_GAP_TICKS * REMEDY_STEPS.length + 1)
    expect(first.filter(o => o.remedyStep).length).toBe(REMEDY_STEPS.length)
    // мышь «мигнула» и снова пропала — новое подозрение через минуту
    recordInput(s, { type: 'mouseMove' }, T0 + 60_000)
    const startTick = 13 // T0 + 65с
    const second = quietMovingTicks(s, SUSPECT_TICKS + 4, startTick)
    expect(second.filter(o => o.warn).length).toBe(1)       // предупредить — да
    expect(second.filter(o => o.remedyStep).length).toBe(0) // дёргать — нет, рано
    // а через 5+ минут — можно снова
    recordInput(s, { type: 'mouseMove' }, T0 + REMEDY_COOLDOWN_MS + 60_000)
    const lateTick = Math.ceil((REMEDY_COOLDOWN_MS + 65_000) / 5000)
    const third = quietMovingTicks(s, SUSPECT_TICKS + 1, lateTick)
    expect(third.filter(o => o.remedyStep).length).toBe(1)
  })
})

describe('строки для журнала', () => {
  it('состояние пишется сразу, потом раз в 2 минуты, и обнуляет счётчики за период', () => {
    const s = createProbeState(T0)
    const o1 = decideTick(s, { cursor: { x: 1, y: 1 }, bounds: WIN, visible: true, onscreen: true, now: T0 })
    expect(o1.statusDue).toBe(true)
    const o2 = decideTick(s, { cursor: { x: 2, y: 2 }, bounds: WIN, visible: true, onscreen: true, now: T0 + 5000 })
    expect(o2.statusDue).toBeUndefined()
    const o3 = decideTick(s, { cursor: { x: 3, y: 3 }, bounds: WIN, visible: true, onscreen: true, now: T0 + STATUS_EVERY_MS })
    expect(o3.statusDue).toBe(true)
    recordInput(s, { type: 'mouseDown' }, T0 + STATUS_EVERY_MS)
    const line = formatStatusLine(s, { bounds: WIN, cursor: { x: 1200, y: 100 }, inside: true, onTop: true, focusable: false, alive: true, windows: [{ id: 1, title: 'ЦентрЧатов', bounds: { x: 31, y: 47, width: 1538, height: 819 }, visible: true, onTop: false }], now: T0 + STATUS_EVERY_MS })
    expect(line).toContain('down=1')
    expect(line).toContain('НАД окном')
    expect(line).toContain('фокусируемо=нет')
    expect(line).toContain('#1 ЦентрЧатов 31,47 1538x819 видимо')
    expect(s.counts.mouseDown).toBe(0) // обнулили
  })

  it('нажатие от оболочки: видно, над окном ли курсор системы', () => {
    expect(formatMouseDownLine({ type: 'mouseDown', button: 'left', x: 300, y: 40 }, WIN, { x: 1456, y: 50 })).toContain('(над окном)')
    expect(formatMouseDownLine({ type: 'mouseDown', button: 'left', x: 300, y: 40 }, WIN, { x: 10, y: 10 })).toContain('(ВНЕ окна!)')
    expect(isInside(WIN, { x: 1156, y: 10 })).toBe(true)
    expect(isInside(WIN, { x: 1527, y: 10 })).toBe(false) // правая граница не включается
    expect(formatWindowsSummary([])).toBe('нет')
  })
})

describe('[!] ЛОВУШКИ: наблюдатель реально подключён, а не лежит мёртвым грузом (урок vkFull v1.2.484)', () => {
  const mgr = fs.readFileSync('main/handlers/notificationManager.js', 'utf8')
  const handlers = fs.readFileSync('main/handlers/notifHandlers.js', 'utf8')
  const helpers = fs.readFileSync('main/notification-helpers.js', 'utf8')
  const probe = fs.readFileSync('main/handlers/notifInputProbe.js', 'utf8')

  it('окно подписывается при создании', () => {
    expect(mgr).toContain("import { attachNotifInputProbe } from './notifInputProbe.js'")
    expect(mgr).toContain('attachNotifInputProbe(notifWin)')
  })
  it('тик едет на существующем стороже (без нового таймера)', () => {
    expect(handlers).toContain('notifInputProbeTick(w)')
    expect(probe).not.toMatch(/setInterval|setTimeout/)
  })
  it('страница пишет нажатия и движение мыши', () => {
    expect(helpers).toContain("document.addEventListener('mousedown'")
    expect(helpers).toContain("document.addEventListener('mousemove'")
    expect(helpers).toContain('installNotifMouseProbe()')
  })
  it('обвязка слушает именно input-event, unresponsive и падение страницы', () => {
    for (const ev of ["'input-event'", "'unresponsive'", "'responsive'", "'render-process-gone'"]) expect(probe).toContain(ev)
  })
  it('[!] шаги самопроверки НЕ прячут окно (hide у прозрачного окна — отдельная грабля #20/#21)', () => {
    expect(probe).not.toMatch(/\.hide\(\)|setIgnoreMouseEvents/)
  })
})
