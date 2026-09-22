// v1.2.492 — пять доводок пульса: строка «Интернет: есть · проверено N с назад», адреса из настроек,
// пакет окну на каждую проверку, сводка возврата сети, кружок «Интернет» в панели связи.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import { pulseStatusLine } from '../../shared/reconnectTexts.js'
import { resolveTargets, PULSE_TARGETS, PULSE_TARGETS_MAX } from '../../shared/netPulsePlan.js'
import { startRecoveryWindow, noteOutcome, summaryLine, _resetRecoverySummary, RECOVERY_WINDOW_MS } from '../../shared/netRecoverySummary.js'
import { initNetPulse } from '../../main/handlers/netPulseHandlers.js'

const T0 = 1_700_000_000_000

describe('строка про интернет', () => {
  it('есть / нет / ещё не проверяли; секунды и минуты', () => {
    expect(pulseStatusLine(null)).toBe('Интернет: ещё не проверяли')
    expect(pulseStatusLine({ online: null, checkedAt: 0 })).toBe('Интернет: ещё не проверяли')
    expect(pulseStatusLine({ online: true, checkedAt: T0 - 12_000 }, T0)).toBe('Интернет: есть · проверено 12 с назад')
    expect(pulseStatusLine({ online: false, checkedAt: T0 - 3 * 60_000 - 5000 }, T0)).toBe('Интернет: нет · проверено 3 мин назад')
  })
})

describe('адреса пульса из настроек', () => {
  it('нет ключа → по умолчанию без замечаний', () => {
    expect(resolveTargets({})).toEqual({ targets: PULSE_TARGETS, source: 'default' })
    expect(resolveTargets(null).source).toBe('default')
  })
  it('правильный список → берём его (с обрезкой пробелов)', () => {
    const r = resolveTargets({ netPulseTargets: [' https://a.example/ok ', 'https://b.example/x'] })
    expect(r).toEqual({ targets: ['https://a.example/ok', 'https://b.example/x'], source: 'settings' })
  })
  it('[!] ЛОВУШКИ формата: не список / пусто / слишком много / не https → по умолчанию + причина', () => {
    expect(resolveTargets({ netPulseTargets: 'https://a' }).reason).toContain('непустым списком')
    expect(resolveTargets({ netPulseTargets: [] }).reason).toContain('непустым списком')
    expect(resolveTargets({ netPulseTargets: new Array(PULSE_TARGETS_MAX + 1).fill('https://a.b/') }).reason).toContain('больше')
    expect(resolveTargets({ netPulseTargets: ['http://plain.example/'] }).reason).toContain('https://')
    expect(resolveTargets({ netPulseTargets: ['https://ok.example/', 42] }).targets).toBe(PULSE_TARGETS)
  })
})

describe('сводка возврата сети', () => {
  beforeEach(() => _resetRecoverySummary())
  it('без открытого окна — null; после «появился» считаем 30 с и не дольше', () => {
    expect(summaryLine(T0)).toBeNull()
    startRecoveryWindow(T0)
    expect(noteOutcome('a', 'self-healed', T0 + 1000)).toBe(true)
    expect(noteOutcome('b', 'restored', T0 + 2000)).toBe(true)
    expect(noteOutcome('c', 'failed', T0 + 3000)).toBe(true)
    expect(noteOutcome('d', 'restored', T0 + RECOVERY_WINDOW_MS + 1)).toBe(false) // опоздал
    expect(noteOutcome('e', 'мусор', T0 + 100)).toBe(false)
    expect(summaryLine(T0 + 5000)).toBe('[net-pulse] итог возврата сети за 30 с: ожили сами 1 · перезагружены 1 · не поднялись 1')
  })
  it('попыток не было — так и пишем', () => {
    startRecoveryWindow(T0)
    expect(summaryLine(T0 + 100)).toContain('попыток не было')
  })
})

/** Подделки Electron. */
function fakeDeps(settings, fetchPlan) {
  const handlers = {}; const sent = []
  const win = { isDestroyed: () => false, webContents: { send: (ch, p) => sent.push([ch, p]) } }
  const fetchImpl = vi.fn(async (url) => fetchPlan(url))
  const warns = []
  const origWarn = console.warn
  console.warn = (m) => warns.push(String(m))
  const deps = { net: {}, powerMonitor: { on() {} }, ipcMain: { handle: (c, f) => { handlers[c] = f }, on: (c, f) => { handlers[c] = f } },
    getMainWindow: () => win, storage: { get: () => settings }, onOnline: vi.fn(), fetchImpl }
  return { deps, handlers, sent, fetchImpl, warns, restore: () => { console.warn = origWarn } }
}
const tick = () => new Promise(r => setTimeout(r, 0))
async function settle(n = 6) { for (let i = 0; i < n; i++) await tick() }

describe('обвязка: адреса из настроек и пакет на каждую проверку', () => {
  it('адреса из настроек используются; плохие → по умолчанию с предупреждением в журнал', async () => {
    const good = fakeDeps({ netPulseTargets: ['https://one.example/'] }, () => ({ status: 200 }))
    const p1 = initNetPulse(good.deps); await settle()
    expect(good.fetchImpl.mock.calls[0][0]).toBe('https://one.example/')
    p1.stop(); good.restore()
    const bad = fakeDeps({ netPulseTargets: ['ftp://nope'] }, () => ({ status: 200 }))
    const p2 = initNetPulse(bad.deps); await settle()
    expect(bad.fetchImpl.mock.calls[0][0]).toBe(PULSE_TARGETS[0])
    expect(bad.warns.some(w => w.includes('адреса из настроек отвергнуты'))).toBe(true)
    p2.stop(); bad.restore()
  })
  it('[!] пакет окну уходит на КАЖДУЮ проверку (не только на переход), TDLib — только на переход', async () => {
    const f = fakeDeps({}, () => ({ status: 200 }))
    const pulse = initNetPulse(f.deps); await settle()
    expect(f.sent.length).toBe(1)
    pulse.getState().lastCheckAt -= 10_000
    f.handlers['net:pulse-now'](null, {}); await settle()
    expect(f.sent.length).toBe(2) // второй пакет — без перехода
    expect(f.sent[1][1].online).toBe(true)
    expect(f.deps.onOnline).toHaveBeenCalledTimes(1)
    pulse.stop(); f.restore()
  })
})

describe('[!] ЛОВУШКИ подключения', () => {
  it('экран и панель показывают строку пульса; панель слушает событие; попытка отдаёт исход в сводку', () => {
    const overlay = fs.readFileSync('src/components/WebviewOfflineOverlay.jsx', 'utf8')
    expect(overlay).toContain('pulseStatusLine(typeof window !== \'undefined\' ? window.__ccNetPulse : null, now)')
    const panel = fs.readFileSync('src/components/ConnectionsPanel.jsx', 'utf8')
    expect(panel).toContain('const pulse = useNetPulse()')
    expect(panel).toContain('pulseStatusLine(pulse, now)')
    const watch = fs.readFileSync('src/hooks/useOpenPageWatch.js', 'utf8')
    expect(watch).toContain("new CustomEvent('cc-net-pulse'")
    expect(watch).toContain('startRecoveryWindow(Date.now())')
    const hook = fs.readFileSync('src/hooks/useWebviewReconnect.js', 'utf8')
    expect(hook).toContain('onOutcome: noteOutcome')
    expect(fs.existsSync('src/utils/autoReplyStats.js')).toBe(false) // переехал в shared ради бюджета
    expect(fs.readFileSync('src/components/AutoReplyChart.jsx', 'utf8')).toContain("from '../../shared/autoReplyStats.js'")
  })
})
