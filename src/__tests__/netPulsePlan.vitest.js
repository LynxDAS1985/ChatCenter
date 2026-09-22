// v1.2.491 — «пульс интернета»: чистая логика (shared/netPulsePlan.js) и обвязка с Electron на подделках
// (main/handlers/netPulseHandlers.js). План — .memory-bank/reconnect-plan.md, 4e.
//
// ЗАЧЕМ ПУЛЬС: стандартные события online/offline за два настоящих обрыва (21–22.09.2026) не пришли
// ни разу — по документации Electron они надёжны только при физически выдернутом проводе.
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import {
  PULSE_TARGETS, PULSE_OK_MS, PULSE_PROBLEM_MS, PULSE_MIN_GAP_MS, STILL_OFFLINE_LOG_MS,
  createPulseState, nextDelayMs, canCheckNow, applyResult, pulsePayload, setWaiting,
} from '../../shared/netPulsePlan.js'
import { initNetPulse } from '../../main/handlers/netPulseHandlers.js'

const T0 = 1_700_000_000_000

describe('чистая логика пульса', () => {
  it('частота: в покое раз в минуту, при беде или ожидающих — раз в 15 с', () => {
    const s = createPulseState(T0)
    expect(nextDelayMs(s)).toBe(PULSE_OK_MS)
    expect(nextDelayMs({ ...s, online: false })).toBe(PULSE_PROBLEM_MS)
    expect(nextDelayMs(setWaiting({ ...s, online: true }, 2))).toBe(PULSE_PROBLEM_MS)
    expect(nextDelayMs(setWaiting({ ...s, online: true }, 0))).toBe(PULSE_OK_MS)
  })

  it('[!] ЛОВУШКА: не чаще одной проверки в 3 с и не поверх идущей', () => {
    const s = { ...createPulseState(T0), lastCheckAt: T0 }
    expect(canCheckNow(s, T0 + 1000)).toBe(false)
    expect(canCheckNow(s, T0 + PULSE_MIN_GAP_MS)).toBe(true)
    expect(canCheckNow({ ...s, checking: true }, T0 + 10_000)).toBe(false)
  })

  it('первый ответ «есть» — строка без слова ПОЯВИЛСЯ (переход online из неизвестности)', () => {
    const r = applyResult(createPulseState(T0), { ok: true, host: 'a', latencyMs: 40, now: T0 })
    expect(r.transition).toBe('online')
    expect(r.line).toContain('интернет есть')
    expect(r.line).not.toContain('ПОЯВИЛСЯ')
    expect(r.state.online).toBe(true)
  })

  it('пропал → строка ПРОПАЛ один раз; напоминание — не чаще раза в 5 минут', () => {
    let { state } = applyResult(createPulseState(T0), { ok: true, host: 'a', latencyMs: 1, now: T0 })
    let r = applyResult(state, { ok: false, now: T0 + 60_000 })
    expect(r.transition).toBe('offline'); expect(r.line).toContain('ПРОПАЛ'); state = r.state
    r = applyResult(state, { ok: false, now: T0 + 75_000 })
    expect(r.transition).toBeNull(); expect(r.line).toBeNull(); state = r.state // тишина
    r = applyResult(state, { ok: false, now: T0 + 60_000 + STILL_OFFLINE_LOG_MS })
    expect(r.line).toContain('всё ещё нет'); state = r.state
    r = applyResult(state, { ok: true, host: 'b', latencyMs: 90, now: T0 + 60_000 + STILL_OFFLINE_LOG_MS + 30_000 })
    expect(r.transition).toBe('online')
    expect(r.line).toContain('ПОЯВИЛСЯ через 330 с')
    expect(r.line).toContain('ответил b')
  })

  it('«есть» → «есть» без перехода и без строки (не шумим каждую минуту)', () => {
    const { state } = applyResult(createPulseState(T0), { ok: true, host: 'a', latencyMs: 1, now: T0 })
    const r = applyResult(state, { ok: true, host: 'a', latencyMs: 2, now: T0 + 60_000 })
    expect(r.transition).toBeNull(); expect(r.line).toBeNull()
  })

  it('что уходит окну', () => {
    const { state } = applyResult(createPulseState(T0), { ok: true, host: 'a', latencyMs: 7, now: T0 })
    expect(pulsePayload(state, T0 + 500)).toEqual({ online: true, since: T0, checkedAt: T0, host: 'a', latencyMs: 7, ageMs: 500 })
    expect(pulsePayload(null).online).toBeNull()
  })

  it('адресов проверки — три, служебные страницы проверки связи первыми', () => {
    expect(PULSE_TARGETS.length).toBe(3)
    expect(PULSE_TARGETS[0]).toContain('msftconnecttest')
  })
})

/** Подделки Electron для обвязки. */
function fakeDeps(fetchPlan) {
  const handlers = {}
  const sent = []
  const pm = { _h: {}, on(ev, fn) { this._h[ev] = fn } }
  const win = { isDestroyed: () => false, webContents: { send: (ch, p) => sent.push([ch, p]) } }
  let calls = 0
  const fetchImpl = vi.fn(async (url) => { calls++; return fetchPlan(url, calls) })
  const onOnline = vi.fn(async () => {})
  const deps = {
    net: {}, powerMonitor: pm,
    ipcMain: { handle: (ch, fn) => { handlers[ch] = fn }, on: (ch, fn) => { handlers[ch] = fn } },
    getMainWindow: () => win, storage: { get: () => ({}) }, onOnline, fetchImpl,
  }
  return { deps, handlers, sent, pm, fetchImpl, onOnline }
}
const tick = () => new Promise(r => setTimeout(r, 0))
async function settle(n = 6) { for (let i = 0; i < n; i++) await tick() }

describe('обвязка пульса (подделки Electron)', () => {
  it('старт → проверка → окно получило net:pulse, TDLib позвали; первый адрес упал — ответил второй', async () => {
    const { deps, sent, fetchImpl, onOnline } = fakeDeps((url) => { if (url.includes('msftconnecttest')) throw new Error('down'); return { status: 204 } })
    const pulse = initNetPulse(deps)
    await settle()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sent.length).toBe(1)
    expect(sent[0][0]).toBe('net:pulse')
    expect(sent[0][1].online).toBe(true)
    expect(sent[0][1].host).toBe('www.gstatic.com')
    expect(onOnline).toHaveBeenCalledTimes(1)
    pulse.stop()
  })

  it('[!] ЛОВУШКА: интернет пропал → окну ушло offline, TDLib НЕ трогаем; вернулся → online и TDLib снова', async () => {
    let down = false
    const { deps, sent, onOnline, handlers } = fakeDeps(() => { if (down) throw new Error('x'); return { status: 200 } })
    const pulse = initNetPulse(deps)
    await settle()
    expect(sent.at(-1)[1].online).toBe(true)
    down = true
    // ждём 3 с антидребезга, потом просим проверить
    const st = pulse.getState(); st.lastCheckAt -= PULSE_MIN_GAP_MS
    handlers['net:pulse-now'](null, { reason: 'тест' }); await settle()
    expect(sent.at(-1)[1].online).toBe(false)
    expect(onOnline).toHaveBeenCalledTimes(1) // на «пропал» TDLib не дёргали
    down = false
    pulse.getState().lastCheckAt -= PULSE_MIN_GAP_MS
    handlers['net:pulse-now'](null, {}); await settle()
    expect(sent.at(-1)[1].online).toBe(true)
    expect(onOnline).toHaveBeenCalledTimes(2)
    pulse.stop()
  })

  it('окно сказало «ждут 2 мессенджера» → проверка сразу и частота 15 с', async () => {
    const { deps, handlers, fetchImpl } = fakeDeps(() => ({ status: 200 }))
    const pulse = initNetPulse(deps)
    await settle()
    const n = fetchImpl.mock.calls.length
    pulse.getState().lastCheckAt -= PULSE_MIN_GAP_MS
    handlers['net:pulse-waiting'](null, { count: 2 }); await settle()
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(n)
    expect(nextDelayMs(pulse.getState())).toBe(PULSE_PROBLEM_MS)
    expect(await handlers['net:pulse-state']()).toMatchObject({ online: true })
    pulse.stop()
  })

  it('пробуждение компьютера → проверка сразу', async () => {
    const { deps, pm, fetchImpl } = fakeDeps(() => ({ status: 200 }))
    const pulse = initNetPulse(deps)
    await settle()
    const n = fetchImpl.mock.calls.length
    pulse.getState().lastCheckAt -= PULSE_MIN_GAP_MS
    pm._h['resume'](); await settle()
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(n)
    expect(typeof pm._h['unlock-screen']).toBe('function')
    pulse.stop()
  })

  it('выключатель настройкой netPulse=false — ничего не щупаем', async () => {
    const { deps, fetchImpl } = fakeDeps(() => ({ status: 200 }))
    deps.storage = { get: () => ({ netPulse: false }) }
    const pulse = initNetPulse(deps)
    await settle()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(pulse.getState()).toBeNull()
  })

  it('[!] ЛОВУШКИ подключения: main.js запускает пульс и импортирует net/powerMonitor; TDLib умеет networkChanged', () => {
    const main = fs.readFileSync('main/main.js', 'utf8')
    expect(main).toContain("import { initNetPulse } from './handlers/netPulseHandlers.js'")
    expect(main).toContain('netPulse = initNetPulse({')
    expect(main).toMatch(/import \{[^}]*\bnet\b[^}]*\bpowerMonitor\b[^}]*\} from 'electron'/)
    expect(main).toContain('netPulse.stop()')
    const backend = fs.readFileSync('main/native/backends/tdlibBackend.js', 'utf8')
    expect(backend).toContain('async networkChanged() { return networkChangedRaw(manager) }')
    const helpers = fs.readFileSync('main/native/backends/tdlibBackendHelpers.js', 'utf8')
    expect(helpers).toContain("'@type': 'setNetworkType', type: { '@type': 'networkTypeOther' }")
    expect(helpers).not.toContain("'networkTypeNone'") // сами от сети TDLib не отключаем
  })
})
