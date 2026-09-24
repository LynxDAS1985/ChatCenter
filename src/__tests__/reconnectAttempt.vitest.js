// v1.2.491 — одна попытка поднять страницу (shared/reconnectAttempt.js) на поддельной странице
// + новые правила reconnectPlan/reconnectTexts (долгая неудача, код пробы, причины для экрана).
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import { createAttemptRunner } from '../../shared/reconnectAttempt.js'
import {
  nextPauseMs, planAfterFail, errorName, LONG_FAIL_ATTEMPTS, LONG_FAIL_PAUSE_MS, PROBE_FAIL_CODE, RETRY_LADDER_MS, ATTEMPT_TIMEOUT_MS, ATTEMPT_TIMEOUT_CODE,
  ATTEMPT_TIMEOUT_MAX_MS, attemptTimeoutFor, shouldAcceptLoaded,
} from '../../shared/reconnectPlan.js'
import { reasonTitle, shouldLogEcho, logNetDownSkipLine, logSelfHealedLine } from '../../shared/reconnectTexts.js'

const T0 = 1_700_000_000_000

/** Подделка: состояние React + зеркало + страница. */
function rig({ entry, el, netOnline = true, quickProbe, attemptTimeoutMs, probeTimeoutMs } = {}) {
  let state = entry ? { wa: entry } : {}
  const stRef = { current: state }
  const setState = (fn) => { state = fn(state); stRef.current = state }
  const logs = []
  const attempt = createAttemptRunner({
    getEl: () => el, info: () => ({ name: 'WhatsApp', url: 'https://web.whatsapp.com/' }),
    stRef, setState, log: (l, m) => logs.push(l + ' ' + m), isNetOnline: () => netOnline, quickProbe, now: () => T0, attemptTimeoutMs, probeTimeoutMs,
  })
  return { attempt, get state() { return state }, stRef, logs }
}
const waitEntry = (extra) => ({ attempt: 1, phase: 'wait', dueAt: T0, pauseMs: 5000, code: -105, since: T0 - 30_000, failedAt: T0 - 5000, origin: 'load', ...extra })

describe('[!] v1.2.497 — предел ожидания попытки (находка ревью #1)', () => {
  it('страница НЕ отвечает → через предел запись возвращается в «ждём», а не висит вечно', async () => {
    // loadURL, который никогда не завершится — ровно случай мёртвого посредника (VPN/прокси).
    // Предел передаём параметром (20 мс), поэтому тест не трогает часы всему окружению и не зависит
    // от порядка файлов в общем прогоне.
    const el = { loadURL: vi.fn(() => new Promise(() => {})) }
    const r = rig({ entry: waitEntry(), el, netOnline: true, attemptTimeoutMs: 20 })
    expect(await r.attempt('wa')).toBe('failed')
    expect(r.state.wa.phase, 'из «идёт» обязаны выйти — иначе экран не снять ничем').toBe('wait')
    expect(r.logs.join(' | ')).toContain('загружаю страницу')
    expect(r.logs.join(' | ')).toContain('НЕ ОТВЕТИЛА за')
  })

  it('обычная загрузка внутри предела — успех, предел не мешает', async () => {
    const el = { loadURL: vi.fn(() => Promise.resolve()) }
    const r = rig({ entry: waitEntry(), el, netOnline: true, attemptTimeoutMs: 5000 })
    expect(await r.attempt('wa')).toBe('restored')
    expect(r.state.wa, 'запись снята — экран уходит').toBeUndefined()
  })

  it('предел по умолчанию — 45 секунд (число живёт в одном месте)', () => {
    expect(ATTEMPT_TIMEOUT_MS).toBe(45000)
    expect(errorName(ATTEMPT_TIMEOUT_CODE)).toBe('ATTEMPT_TIMEOUT')
  })
})

describe('[!] v1.2.498 — находки ревью: причина, поздний успех, замок, предел пробы', () => {
  it('[!] #3: предел НЕ затирает настоящую причину (код -130 «молчит посредник» остаётся)', async () => {
    const el = { loadURL: vi.fn(() => new Promise(() => {})) }
    const r = rig({ entry: waitEntry({ code: -130 }), el, netOnline: true, attemptTimeoutMs: 20 })
    await r.attempt('wa')
    expect(r.state.wa.code, 'код беды обязан уцелеть').toBe(-130)
    expect(r.state.wa.timedOut, 'факт «не дождались» — отдельным полем').toBe(true)
    expect(reasonTitle(r.state.wa, false, 'ВК').title, 'экран продолжает винить посредника').toContain('посредник')
    expect(r.logs.join(' | ')).toContain('причина осталась прежней')
  })

  it('[!] #2: страница догрузилась ПОСЛЕ предела → успех засчитываем, не перезагружаем', () => {
    const timedOutEntry = { attempt: 2, phase: 'wait', code: -130, timedOut: true, failedAt: T0, dueAt: T0 + 20000, pauseMs: 20000 }
    expect(shouldAcceptLoaded(timedOutEntry, T0 + 500), 'поздняя загрузка — это успех, а не эхо').toBe(true)
    // обычная запись (упала с ошибкой) по-прежнему защищена окном эха — защиту не сломали
    const failedEntry = { attempt: 2, phase: 'wait', code: -105, failedAt: T0, dueAt: T0 + 20000, pauseMs: 20000 }
    expect(shouldAcceptLoaded(failedEntry, T0 + 500), 'эхо страницы-ошибки по-прежнему отбрасываем').toBe(false)
  })

  it('[!] #5: вторая попытка поверх идущей не начинается', async () => {
    let unlock
    const el = { loadURL: vi.fn(() => new Promise(r => { unlock = r })) }
    const r = rig({ entry: waitEntry(), el, netOnline: true, attemptTimeoutMs: 5000 })
    const first = r.attempt('wa')
    const second = await r.attempt('wa')
    expect(second, 'второй запуск отклонён').toBe('busy')
    expect(el.loadURL, 'загрузка ровно одна').toHaveBeenCalledTimes(1)
    expect(r.logs.join(' | ')).toContain('попытка уже идёт')
    unlock(); await first
  })

  it('[!] #4: зависшая проверка «жива ли страница» больше не вешает попытку навсегда', async () => {
    const el = { loadURL: vi.fn(() => Promise.resolve()), stop: vi.fn() }
    const r = rig({ entry: waitEntry({ origin: 'probe' }), el, netOnline: true, quickProbe: () => new Promise(() => {}), probeTimeoutMs: 20 })
    const res = await Promise.race([r.attempt('wa'), new Promise(rr => setTimeout(() => rr('ЗАВИСЛА'), 500))])
    expect(res, 'попытка обязана завершиться').not.toBe('ЗАВИСЛА')
    expect(r.logs.join(' | ')).toContain('не ответила за')
    expect(el.loadURL, 'проба не ответила → перезагружаем').toHaveBeenCalled()
  })

  it('[!] #2: перед новой попыткой глушим прошлую зависшую загрузку', async () => {
    const el = { loadURL: vi.fn(() => Promise.resolve()), stop: vi.fn() }
    const r = rig({ entry: waitEntry({ timedOut: true }), el, netOnline: true, attemptTimeoutMs: 5000 })
    await r.attempt('wa')
    expect(el.stop, 'иначе получим две загрузки одной страницы').toHaveBeenCalledTimes(1)
    expect(r.logs.join(' | ')).toContain('глушу прошлую зависшую загрузку')
  })

  it('[!] #11: предел растёт с попытками 45 → 90 → 135 → 180 с (потолок)', () => {
    expect(attemptTimeoutFor(1)).toBe(45000)
    expect(attemptTimeoutFor(2)).toBe(90000)
    expect(attemptTimeoutFor(3)).toBe(135000)
    expect(attemptTimeoutFor(99), 'потолок').toBe(ATTEMPT_TIMEOUT_MAX_MS)
    expect(attemptTimeoutFor(0), 'мусор → как первая попытка').toBe(45000)
  })
})

describe('одна попытка', () => {
  it('страницы ещё нет → запись не теряем, ждём дальше', async () => {
    const r = rig({ entry: waitEntry(), el: null })
    expect(await r.attempt('wa')).toBe('no-element')
    expect(r.state.wa.phase).toBe('wait')
  })

  it('[!] ЛОВУШКА: интернета нет (пульс) → loadURL НЕ зовём, пишем почему, ждём', async () => {
    const el = { loadURL: vi.fn(() => Promise.resolve()) }
    const r = rig({ entry: waitEntry(), el, netOnline: false })
    expect(await r.attempt('wa')).toBe('net-down')
    expect(el.loadURL).not.toHaveBeenCalled()
    expect(r.logs.join(' | ')).toContain('интернета нет (по пульсу) — страницу не дёргаем')
    expect(r.state.wa.phase).toBe('wait')
    // 🔴 v1.2.496: та же защита обязана держать и НОВОЕ семейство кодов (молчит посредник) — иначе
    // добавление -130 в список повторов начало бы перезагружать страницы и стирать недописанное.
    const el2 = { loadURL: vi.fn(() => Promise.resolve()) }
    const r2 = rig({ entry: waitEntry({ code: -130 }), el: el2, netOnline: false })
    expect(await r2.attempt('wa')).toBe('net-down')
    expect(el2.loadURL, 'мёртвый посредник: страницу тоже не трогаем').not.toHaveBeenCalled()
  })

  it('загрузка удалась → запись снята, строка «восстановлена»', async () => {
    const el = { loadURL: vi.fn(() => Promise.resolve()) }
    const r = rig({ entry: waitEntry(), el })
    expect(await r.attempt('wa')).toBe('restored')
    expect(r.state.wa).toBeUndefined()
    expect(r.logs.join(' | ')).toContain('связь восстановлена')
  })

  it('[!] фаза «идёт попытка» стоит в зеркале СИНХРОННО до ответа loadURL (ловушка v1.2.453)', async () => {
    let seen = null
    const r0 = { current: null }
    const el = { loadURL: vi.fn(() => { seen = r0.current.stRef.current.wa.phase; return new Promise(() => {}) }) }
    const r = rig({ entry: waitEntry(), el }); r0.current = r
    r.attempt('wa')
    expect(seen).toBe('trying')
    expect(r.state.wa.attempt).toBe(2)
  })

  it('загрузка не удалась → следующая пауза по лестнице, WARN', async () => {
    const el = { loadURL: vi.fn(() => Promise.reject(Object.assign(new Error('x'), { errno: -105 }))) }
    const r = rig({ entry: waitEntry(), el })
    expect(await r.attempt('wa')).toBe('failed')
    expect(r.state.wa.phase).toBe('wait')
    expect(r.state.wa.pauseMs).toBe(RETRY_LADDER_MS[2]) // после 2-й попытки
    expect(r.logs.join(' | ')).toContain('WARN [reconnect] WhatsApp: попытка 2 не удалась')
  })

  it('[!] запись от пробы, страница ожила сама → снимаем экран БЕЗ перезагрузки', async () => {
    const el = { loadURL: vi.fn(() => Promise.resolve()) }
    const r = rig({ entry: waitEntry({ origin: 'probe', code: PROBE_FAIL_CODE }), el, quickProbe: async () => true })
    expect(await r.attempt('wa')).toBe('self-healed')
    expect(el.loadURL).not.toHaveBeenCalled()
    expect(r.state.wa).toBeUndefined()
    expect(r.logs.join(' | ')).toContain('страница ожила сама')
  })

  it('запись от пробы, страница молчит → перезагружаем', async () => {
    const el = { loadURL: vi.fn(() => Promise.resolve()) }
    const r = rig({ entry: waitEntry({ origin: 'probe', code: PROBE_FAIL_CODE }), el, quickProbe: async () => false })
    expect(await r.attempt('wa')).toBe('restored')
    expect(el.loadURL).toHaveBeenCalledTimes(1)
  })
})

describe('новые правила плана (v1.2.491)', () => {
  it('[!] долгая неудача → пауза 5 минут; ТОЛЬКО при подтверждённом «интернета нет» лестница прежняя', () => {
    // v1.2.497 (находка ревью #3): раньше долгая пауза включалась строго при netOnline===true, и при
    // ВЫКЛЮЧЕННОМ пульсе (null) страница дёргалась раз в минуту вечно — это стирает недописанное сообщение.
    // При false до загрузки дело вообще не доходит (ветка net-down), поэтому там лестница осталась прежней.
    expect(nextPauseMs(LONG_FAIL_ATTEMPTS, 'https://web.whatsapp.com/', true)).toBe(LONG_FAIL_PAUSE_MS)
    expect(nextPauseMs(LONG_FAIL_ATTEMPTS, 'https://web.whatsapp.com/', null)).toBe(LONG_FAIL_PAUSE_MS)
    expect(nextPauseMs(LONG_FAIL_ATTEMPTS, 'https://web.whatsapp.com/', false)).toBe(RETRY_LADDER_MS.at(-1))
    expect(nextPauseMs(3, 'https://web.whatsapp.com/', true)).toBe(RETRY_LADDER_MS[3]) // до 10 — как было
  })
  it('код пробы — не сетевой, но именованный; origin переживает перепланирование', () => {
    expect(errorName(PROBE_FAIL_CODE)).toBe('PAGE_UNRESPONSIVE')
    const e = planAfterFail(null, { code: PROBE_FAIL_CODE, url: 'u', now: T0, origin: 'probe' })
    expect(e.origin).toBe('probe')
    expect(planAfterFail(null, { code: -105, url: 'u', now: T0 }).origin).toBe('load')
  })
  it('причины для экрана: три разные', () => {
    expect(reasonTitle(waitEntry(), false, 'WhatsApp').title).toBe('Нет интернета')
    // 🔴 ЛОВУШКА v1.2.496: при мёртвом посреднике пульс ЧЕСТНО говорит «нет» (net.fetch идёт тем же путём),
    // поэтому ветка про посредника обязана стоять ПЕРВОЙ — иначе экран скажет «Нет интернета» и уведёт не туда.
    const prox = reasonTitle(waitEntry({ code: -130 }), false, 'WhatsApp')
    expect(prox.title).toBe('Не отвечает посредник (VPN или прокси)')
    expect(prox.hint).toContain('Windows')
    // [!] v1.2.497 (#5): пульс ПОДТВЕРДИЛ интернет → посредник жив, старый код ошибки больше не повод
    // винить VPN; экран должен говорить про сайт.
    expect(reasonTitle(waitEntry({ code: -111 }), true, 'WhatsApp').title).toBe('Сайт WhatsApp недоступен')
    expect(reasonTitle(waitEntry({ code: -130 }), null, 'WhatsApp').title, 'пульс молчит → причина остаётся').toContain('посредник')
    expect(reasonTitle(waitEntry({ origin: 'probe' }), true, 'WhatsApp').title).toContain('страница не отвечает')
    const r = reasonTitle(waitEntry({ attempt: 12 }), true, 'WhatsApp')
    expect(r.title).toBe('Сайт WhatsApp недоступен')
    expect(r.hint).toContain('интернет есть')
    expect(r.hint).toContain('раз в 5 минут')
  })
  it('эхо страницы-ошибки пишем с 3-й попытки только каждую 10-ю', () => {
    expect(shouldLogEcho({ attempt: 1 })).toBe(true)
    expect(shouldLogEcho({ attempt: 5 })).toBe(false)
    expect(shouldLogEcho({ attempt: 10 })).toBe(true)
  })
  it('строки журнала', () => {
    expect(logNetDownSkipLine('X')).toContain('интернета нет')
    expect(logSelfHealedLine('X', { since: T0 - 12_000 }, T0)).toContain('ожила сама за 12с')
  })
  it('[!] ЛОВУШКИ подключения: хук зовёт runner и вердикт пульса, экран берёт причину', () => {
    const hook = fs.readFileSync('src/hooks/useWebviewReconnect.js', 'utf8')
    expect(hook).toContain('createAttemptRunner({')
    expect(hook).toContain('isNetOnline: netVerdict')
    expect(hook).toContain("window.api?.send?.('net:pulse-waiting'")
    expect(hook).toContain('reportFail: onFail, stateRef: stRef')
    expect((hook.match(/useRef\(/g) || []).length).toBe(2) // страж памяти: новых хранилищ в хуке нет
    const overlay = fs.readFileSync('src/components/WebviewOfflineOverlay.jsx', 'utf8')
    expect(overlay).toContain('reasonTitle(entry, netVerdict(), name)')
  })
})
