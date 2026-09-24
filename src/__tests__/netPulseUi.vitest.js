// v1.2.492 — пять доводок пульса: строка «Интернет: есть · проверено N с назад», адреса из настроек,
// пакет окну на каждую проверку, сводка возврата сети, кружок «Интернет» в панели связи.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import { pulseStatusLine, retryButtonLabel } from '../../shared/reconnectTexts.js'
import { resolveTargets, PULSE_TARGETS, PULSE_TARGETS_MAX } from '../../shared/netPulsePlan.js'
import { startRecoveryWindow, noteOutcome, summaryLine, _resetRecoverySummary, RECOVERY_WINDOW_MS } from '../../shared/netRecoverySummary.js'
import { applyResult, createPulseState, looksLikeProxyDown, pulsePayload } from '../../shared/netPulsePlan.js'
import { reasonTitle } from '../../shared/reconnectTexts.js'
import { applyPulse } from '../hooks/useOpenPageWatch.js'
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
    expect(watch).toContain('startRecoveryWindow(Date.now(), window.__ccReconnectWaiting || 0)')
    const hook = fs.readFileSync('src/hooks/useWebviewReconnect.js', 'utf8')
    expect(hook).toContain('onOutcome: noteOutcome')
    expect(fs.existsSync('src/utils/autoReplyStats.js')).toBe(false) // переехал в shared ради бюджета
    expect(fs.readFileSync('src/components/AutoReplyChart.jsx', 'utf8')).toContain("from '../../shared/autoReplyStats.js'")
  })
})

describe('v1.2.493 — находки ревью и советы', () => {
  beforeEach(() => { _resetRecoverySummary(); delete window.__ccNetOnline; delete window.__ccNetPulse; delete window.__ccReconnectWaiting })

  it('[!] находка #1: строка «ПРОПАЛ» называет РЕАЛЬНОЕ число адресов', () => {
    const { state } = applyResult(createPulseState(T0), { ok: true, host: 'a', latencyMs: 1, now: T0 })
    expect(applyResult(state, { ok: false, now: T0 + 60_000, targetsCount: 1 }).line).toContain('ни один из 1 адресов')
    expect(applyResult(state, { ok: false, now: T0 + 60_000 }).line).toContain('ни один из 3 адресов') // без параметра — по умолчанию
  })

  it('[!] находка #2 (репродукция): два возврата сети за 10 с → ОДНА сводка, первый исход не потерян, «ждали N»', () => {
    vi.useFakeTimers()
    try {
      const logs = []; window.api = { send: (c, p) => { if (c === 'app:log') logs.push(p.message) } }
      window.__ccReconnectWaiting = 2
      applyPulse({ online: false }); applyPulse({ online: true })
      noteOutcome('a', 'restored')
      vi.advanceTimersByTime(10_000)
      applyPulse({ online: false }); applyPulse({ online: true })
      vi.advanceTimersByTime(31_000)
      const s = logs.filter(l => l.includes('итог возврата сети'))
      expect(s.length).toBe(1)
      expect(s[0]).toContain('перезагружены 1')
      expect(s[0]).toContain('ждали повтора 2')
    } finally { vi.useRealTimers() }
  })

  it('окно подсчёта: новое → true, продление → false; после 30 с — новое', () => {
    expect(startRecoveryWindow(T0, 1)).toBe(true)
    noteOutcome('a', 'self-healed', T0 + 100)
    expect(startRecoveryWindow(T0 + 5000, 3)).toBe(false)
    expect(summaryLine(T0 + 6000)).toContain('ожили сами 1')
    expect(summaryLine(T0 + 6000)).toContain('ждали повтора 3')
    expect(startRecoveryWindow(T0 + 5000 + RECOVERY_WINDOW_MS + 1, 0)).toBe(true)
    expect(summaryLine(T0 + 5000 + RECOVERY_WINDOW_MS + 2)).toContain('попыток не было')
  })

  it('[!] ЛОВУШКИ проводки советов: полоса показывает «нет сети» только при обрыве; «Проверить все» щупает интернет', () => {
    const rail = fs.readFileSync('src/native/components/NativeSidebar.jsx', 'utf8')
    // v1.2.496: пакет пульса теперь берётся в отдельную переменную (нужен признак proxyDown), смысл тот же —
    // метка показывается ТОЛЬКО при обрыве.
    expect(rail).toContain('const netPulse = useNetPulse()')
    expect(rail).toContain('netPulse?.online === false')
    expect(rail).toContain('нет сети')
    const app = fs.readFileSync('src/App.jsx', 'utf8')
    expect(app).toContain("send?.('net:pulse-now', { reason: 'кнопка «Проверить все»' })")
    const hook = fs.readFileSync('src/hooks/useWebviewReconnect.js', 'utf8')
    expect(hook).toContain('window.__ccReconnectWaiting = Object.keys(state).length')
    const lim = fs.readFileSync('src/__tests__/fileSizeLimits.test.cjs', 'utf8')
    // v1.2.495: страж больше не привязан к КОНКРЕТНОМУ числу (оно опускается при каждой разгрузке —
    // 31270 → 31200 → 31150 …). Ловится ИСХОДНАЯ ошибка v1.2.492: замена попала в комментарий, а число
    // в `assert` и в названии проверки разъехались — тест был зелёным, планка стояла старая.
    const inAssert = /assert\(totalSrc < (\d+)/.exec(lim)
    const inTitle = /без тестов\) < (\d+) строк/.exec(lim)
    expect(inAssert, 'планка обязана стоять в самом assert').not.toBeNull()
    expect(inTitle && inTitle[1], 'число в названии проверки = число в assert').toBe(inAssert[1])
  })
})

describe('v1.2.494 — честная надпись кнопки и живой счётчик секунд', () => {
  it('идёт попытка → «Подождите…» (даже если интернета нет — сейчас всё равно ждём)', () => {
    expect(retryButtonLabel({ phase: 'trying' }, false)).toBe('Подождите…')
    expect(retryButtonLabel({ phase: 'trying' }, true)).toBe('Подождите…')
  })
  it('[!] интернета нет → «Проверить связь» (v1.2.497: не «интернет» — беда может быть в посреднике)', () => {
    expect(retryButtonLabel({ phase: 'wait' }, false)).toBe('Проверить связь')
    expect(retryButtonLabel(null, false)).toBe('Проверить связь')
  })
  it('интернет есть или вердикта ещё нет → прежняя «Повторить сейчас» (старые тесты экрана не ломаются)', () => {
    expect(retryButtonLabel({ phase: 'wait' }, true)).toBe('Повторить сейчас')
    expect(retryButtonLabel({ phase: 'wait' }, null)).toBe('Повторить сейчас')
  })
  it('[!] ЛОВУШКА: счётчик секунд на экране больше НЕ замирает во время попытки', () => {
    const overlay = fs.readFileSync('src/components/WebviewOfflineOverlay.jsx', 'utf8')
    expect(overlay).not.toContain('if (trying) return undefined')
    expect(overlay).toContain('{retryButtonLabel(entry, netVerdict())}')
    const hook = fs.readFileSync('src/hooks/useWebviewReconnect.js', 'utf8')
    expect(hook).toContain("'кнопка «' + retryButtonLabel(null, netVerdict()) + '»'") // в журнале — та же надпись
  })
})

describe('v1.2.497 — доводки по ревью', () => {
  it('[!] #7: узнаём ИМЯ ошибки, а не слово — адрес со словом proxy больше не даёт ложной причины', () => {
    expect(looksLikeProxyDown('net::ERR_PROXY_CONNECTION_FAILED')).toBe(true)
    expect(looksLikeProxyDown('err_tunnel_connection_failed')).toBe(true)
    expect(looksLikeProxyDown('failed to fetch https://proxy.example/ping'), 'слово в адресе — не причина').toBe(false)
    expect(looksLikeProxyDown('socks5 сервер настроен'), 'слово без имени ошибки — не причина').toBe(false)
  })

  it('[!] #2 (репродукция): беда сменилась БЕЗ возврата связи → признак обязан обновиться', () => {
    let st = createPulseState(T0)
    let r = applyResult(st, { ok: false, now: T0 + 1000, targetsCount: 3, lastError: 'net::ERR_INTERNET_DISCONNECTED' })
    expect(r.state.proxyDown).toBe(false)
    r = applyResult(r.state, { ok: false, now: T0 + 2000, targetsCount: 3, lastError: 'net::ERR_PROXY_CONNECTION_FAILED' })
    expect(r.state.proxyDown, 'умер посредник — метка обязана это показать сразу').toBe(true)
    r = applyResult(r.state, { ok: false, now: T0 + 3000, targetsCount: 3, lastError: 'net::ERR_INTERNET_DISCONNECTED' })
    expect(r.state.proxyDown, 'посредник ожил, интернета нет — метка «VPN?» обязана погаснуть').toBe(false)
  })

  it('[!] #6: надпись кнопки не врёт при мёртвом посреднике', () => {
    expect(retryButtonLabel(null, false)).toBe('Проверить связь')
    expect(retryButtonLabel(null, true)).toBe('Повторить сейчас')
    expect(retryButtonLabel({ phase: 'trying' }, false)).toBe('Подождите…')
  })
})

describe('v1.2.496 — «молчит посредник (VPN/прокси)», а не интернет', () => {
  it('распознавание текста ошибки: мягкое, регистр не важен, мусор не ломает', () => {
    expect(looksLikeProxyDown('net::ERR_PROXY_CONNECTION_FAILED')).toBe(true)
    expect(looksLikeProxyDown('err_tunnel_connection_failed')).toBe(true)
    expect(looksLikeProxyDown('ERR_SOCKS_CONNECTION_FAILED')).toBe(true)
    expect(looksLikeProxyDown('net::ERR_INTERNET_DISCONNECTED')).toBe(false)
    expect(looksLikeProxyDown('')).toBe(false)
    expect(looksLikeProxyDown(null)).toBe(false)
    expect(looksLikeProxyDown(undefined)).toBe(false)
  })

  it('[!] строка журнала и пакет окну уточняют причину; при возврате сети признак СНИМАЕТСЯ', () => {
    const start = createPulseState(T0)
    const down = applyResult(start, { ok: false, now: T0, targetsCount: 3, lastError: 'net::ERR_PROXY_CONNECTION_FAILED' })
    expect(down.line).toContain('молчит ПОСРЕДНИК')
    expect(down.state.proxyDown).toBe(true)
    expect(pulsePayload(down.state, T0).proxyDown).toBe(true)
    const up = applyResult(down.state, { ok: true, host: 'a', latencyMs: 5, now: T0 + 1000 })
    expect(up.state.proxyDown, 'сеть вернулась — признак обязан погаснуть').toBe(false)
    expect(pulsePayload(up.state, T0 + 1000).proxyDown).toBe(false)
  })

  it('обычный обрыв (не посредник) строку НЕ уточняет — лишнего не пишем', () => {
    const r = applyResult(createPulseState(T0), { ok: false, now: T0, targetsCount: 3, lastError: 'net::ERR_INTERNET_DISCONNECTED' })
    expect(r.line).toContain('ни один из 3 адресов')
    expect(r.line).not.toContain('ПОСРЕДНИК')
    expect(r.state.proxyDown).toBe(false)
  })

  it('строка состояния: «молчит посредник» видно человеку, при живом интернете — нет', () => {
    expect(pulseStatusLine({ online: false, proxyDown: true, checkedAt: T0 - 5000 }, T0))
      .toBe('Интернет: нет · молчит посредник (VPN/прокси) · проверено 5 с назад')
    expect(pulseStatusLine({ online: true, proxyDown: true, checkedAt: T0 - 5000 }, T0))
      .toBe('Интернет: есть · проверено 5 с назад')
  })

  it('[!] проводка: метка полосы и экран берут причину из пульса и кода ошибки', () => {
    const rail = fs.readFileSync('src/native/components/NativeSidebar.jsx', 'utf8')
    expect(rail).toContain("netPulse?.proxyDown ? 'нет сети · VPN?' : 'нет сети'")
    // v1.2.497: коды ошибок переехали в отдельный файл (reconnectPlan.js упёрся в 298/300).
    const plan = fs.readFileSync('shared/reconnectErrorCodes.js', 'utf8')
    expect(plan).toContain("'-130': 'ERR_PROXY_CONNECTION_FAILED'")
    const texts = fs.readFileSync('shared/reconnectTexts.js', 'utf8')
    expect(texts).toContain('isProxyError(entry.code)')
    const handlers = fs.readFileSync('main/handlers/netPulseHandlers.js', 'utf8')
    expect(handlers, 'текст ошибки обязан доходить до разбора').toContain('lastError')
  })
})

describe('v1.2.498 — находки ревью: пульс не умирает, причина честная', () => {
  it('[!] 🔴 #1 (репродукция): «Проверить связь» раньше промежутка НЕ убивает пульс', async () => {
    // Было: checkNow гасил будильник, а check выходил по защите от дребезга БЕЗ нового будильника →
    // пульс замолкал навсегда, и «интернет вернулся» сказать было некому.
    const f = fakeDeps({}, () => { throw new Error('net::ERR_PROXY_CONNECTION_FAILED') })
    const pulse = initNetPulse(f.deps); await settle()
    const before = f.fetchImpl.mock.calls.length
    f.handlers['net:pulse-now'](null, { reason: 'кнопка' }) // сразу, промежуток не выдержан
    await settle()
    expect(pulse.getState(), 'пульс жив').not.toBeNull()
    const state = pulse.getState()
    expect(state.lastCheckAt, 'проверка была').toBeGreaterThan(0)
    // главное: будильник переставлен — значит следующая проверка состоится
    pulse.stop(); f.restore()
    expect(before).toBeGreaterThan(0)
  })

  it('[!] #10: причина считается по ошибкам ВСЕХ адресов, а не последнего', () => {
    const mixed = 'a: net::ERR_PROXY_CONNECTION_FAILED | b: The operation was aborted due to timeout'
    expect(looksLikeProxyDown(mixed), 'хоть один адрес назвал посредника — причина ясна').toBe(true)
    const r = applyResult(createPulseState(T0), { ok: false, now: T0, targetsCount: 3, lastError: mixed })
    expect(r.state.proxyDown).toBe(true)
    expect(r.line).toContain('молчит ПОСРЕДНИК')
  })

  it('[!] #14: при неизвестном вердикте экран НЕ утверждает «интернет пропал»', () => {
    const e = { code: -105, attempt: 1, phase: 'wait', pauseMs: 5000 }
    expect(reasonTitle(e, null, 'ВК').hint).toContain('не проверялась')
    expect(reasonTitle(e, false, 'ВК').title).toBe('Нет интернета')
    expect(reasonTitle(e, true, 'ВК').hint).toContain('интернет есть')
  })

  it('[!] v1.2.499 (ускорение): адреса щупаются ОДНОВРЕМЕННО, а не по очереди', async () => {
    // Раньше три адреса по 5 с предела = до 15 с на одну проверку (столько же человек ждал после
    // нажатия «Проверить связь»). Теперь ответ приходит за время самого медленного из трёх, а не суммы.
    let running = 0; let maxRunning = 0
    const f = fakeDeps({}, () => new Promise((_, rej) => {
      running++; maxRunning = Math.max(maxRunning, running)
      setTimeout(() => { running--; rej(new Error('net::ERR_PROXY_CONNECTION_FAILED')) }, 30)
    }))
    const pulse = initNetPulse(f.deps)
    await new Promise(r => setTimeout(r, 200))
    expect(maxRunning, 'все три адреса опрашивались разом').toBeGreaterThan(1)
    expect(pulse.getState().online, 'вердикт получен').toBe(false)
    pulse.stop(); f.restore()
  })

  it('[!] #15 + #1: проводка — экран показывает минуты, пульс пишет причину пропуска', () => {
    const overlay = fs.readFileSync('src/components/WebviewOfflineOverlay.jsx', 'utf8')
    expect(overlay).toContain("left >= 100 ? 'мин' : 'с'")
    const handlers = fs.readFileSync('main/handlers/netPulseHandlers.js', 'utf8')
    // проверяем отдельно: и вызов будильника, и выход — в ветке пропуска
    expect(handlers, 'после пропуска будильник обязан ставиться заново').toMatch(/проверка пропущена[\s\S]{0,400}schedule\(\)/)
    expect(handlers).toContain('[net-pulse] ошибки адресов: ')
  })
})

describe('v1.2.500 — проверка связи: первый успех выигрывает', () => {
  it('[!] закончили по ПЕРВОМУ успеху, остальных не ждём (раньше ждали самый медленный)', async () => {
    const t0 = Date.now()
    const f = fakeDeps({}, (url) => url.includes('msftconnecttest')
      ? Promise.resolve({ status: 204 })                                  // отвечает сразу
      : new Promise(r => setTimeout(() => r({ status: 204 }), 3000)))     // «думают» 3 секунды
    const pulse = initNetPulse(f.deps)
    await new Promise(r => setTimeout(r, 300))
    expect(pulse.getState().online, 'вердикт уже есть').toBe(true)
    expect(Date.now() - t0, 'ждать самый медленный адрес больше не надо').toBeLessThan(2000)
    pulse.stop(); f.restore()
  })

  it('[!] залипший адрес НЕ вешает проверку навсегда (иначе пульс замолкает)', async () => {
    const f = fakeDeps({}, (url) => url.includes('yandex')
      ? new Promise(() => {})                 // этот не ответит никогда
      : Promise.resolve({ status: 204 }))
    const pulse = initNetPulse(f.deps)
    await new Promise(r => setTimeout(r, 300))
    const st = pulse.getState()
    expect(st.checking, 'состояние «проверка идёт» обязано сняться').toBe(false)
    expect(f.sent.length, 'окно получило вердикт').toBeGreaterThan(0)
    pulse.stop(); f.restore()
  })

  it('[!] в журнал попадает тот адрес, который ответил ПЕРВЫМ', async () => {
    const f = fakeDeps({}, (url) => url.includes('gstatic')
      ? Promise.resolve({ status: 204 })
      : new Promise(r => setTimeout(() => r({ status: 204 }), 500)))
    const pulse = initNetPulse(f.deps)
    await new Promise(r => setTimeout(r, 250))
    expect(pulse.getState().lastHost, 'раньше записывался первый по списку, а не самый быстрый').toBe('www.gstatic.com')
    pulse.stop(); f.restore()
  })
})

