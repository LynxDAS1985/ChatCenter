// main/handlers/netPulseHandlers.js — v1.2.491
//
// «Пульс интернета» — обвязка с Electron. Логика решений (частота, переходы, строки) — в
// shared/netPulsePlan.js и проверяется тестами без Electron. План — .memory-bank/reconnect-plan.md, 4e.
//
// ЧТО ДЕЛАЕТ:
//   • по таймеру щупает интернет: net.fetch к служебным адресам проверки связи (документация
//     Electron: net.fetch идёт через сетевой стек Chrome — тот же, что у страниц мессенджеров);
//   • по ПЕРЕХОДУ (был → нет / не было → появился) пишет строку в журнал и шлёт окну `net:pulse`;
//   • на «появился» зовёт TDLib setNetworkType (через бэкенд) — переоткрыть соединения;
//   • щупает немедленно при пробуждении компьютера / разблокировке экрана (powerMonitor) и по
//     просьбе окна (`net:pulse-now`); частота выше, пока окно сообщает `net:pulse-waiting` > 0.
//
// КАНАЛЫ: main→окно `net:pulse` {online, since, checkedAt, host, latencyMs, ageMs};
//         окно→main `net:pulse-state` (invoke, текущее состояние), `net:pulse-now` (send, {reason}),
//         `net:pulse-waiting` (send, {count}).
//
// ВЫКЛЮЧАТЕЛЬ: settings.netPulse === false → пульс не запускается (строка в журнал). Настройки в
// интерфейсе нет намеренно — это аварийный рычаг на случай, если пульс начнёт мешать.
//
// Таймер один (setTimeout-цепочка), останавливается в stop() по before-quit — memoryLeaks.
import {
  PULSE_TIMEOUT_MS, createPulseState, nextDelayMs, canCheckNow, applyResult, pulsePayload, setWaiting, resolveTargets,
} from '../../shared/netPulsePlan.js'

/**
 * @param {object} deps
 * @param {import('electron').Net} deps.net
 * @param {import('electron').PowerMonitor} deps.powerMonitor
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @param {{get:Function}} deps.storage
 * @param {() => Promise<any>|any} [deps.onOnline] — что сделать при «интернет появился» (TDLib setNetworkType)
 * @param {(url:string, init:object) => Promise<{status:number}>} [deps.fetchImpl] — для тестов
 */
export function initNetPulse({ net, powerMonitor, ipcMain, getMainWindow, storage, onOnline, fetchImpl }) {
  const settings = (storage && storage.get && storage.get('settings', {})) || {}
  if (settings.netPulse === false) {
    console.log('[net-pulse] выключен настройкой netPulse=false — интернет не щупаем')
    return { stop() {}, checkNow() {}, getState: () => null }
  }
  const doFetch = fetchImpl || ((url, init) => net.fetch(url, init))
  // v1.2.492: адреса можно сменить в настройках (netPulseTargets) без пересборки; ошибка формата → по умолчанию + запись.
  const { targets, source, reason: targetsReason } = resolveTargets(settings)
  if (targetsReason) console.warn('[net-pulse] адреса из настроек отвергнуты (' + targetsReason + ') — беру адреса по умолчанию')
  let state = createPulseState()
  let timer = null
  let stopped = false

  const sendToWindow = (channel, payload) => {
    try {
      const w = getMainWindow && getMainWindow()
      if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
    } catch (_) {}
  }

  /** Один адрес: любой HTTP-ответ = интернет есть; исключение/таймаут = нет. */
  async function probeOne(url) {
    const t0 = Date.now()
    const init = { method: 'GET', cache: 'no-store', redirect: 'follow' }
    try { init.signal = AbortSignal.timeout(PULSE_TIMEOUT_MS) } catch (_) {}
    try {
      const res = await doFetch(url, init)
      return { ok: !!res, latencyMs: Date.now() - t0 }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t0, error: (e && e.message) || String(e) }
    }
  }

  async function check(reason) {
    if (stopped) return
    const now = Date.now()
    if (!canCheckNow(state, now)) return
    state = { ...state, checking: true }
    let result = { ok: false, host: '', latencyMs: 0 }
    for (const url of targets) {
      const r = await probeOne(url)
      if (r.ok) { result = { ok: true, host: hostOf(url), latencyMs: r.latencyMs }; break }
    }
    const applied = applyResult(state, { ...result, now: Date.now(), reason })
    state = applied.state
    if (applied.line) console.log(applied.line)
    // v1.2.492: пакет окну — на КАЖДУЮ проверку, чтобы экран показывал «проверено N с назад» честно.
    // Окно превращает его в событие online/offline ТОЛЬКО на переходе (applyPulse, тест) — лестница
    // повторов от ежеминутных пакетов не дёргается. TDLib зовём по-прежнему только на переход.
    sendToWindow('net:pulse', pulsePayload(state))
    if (applied.transition) {
      if (applied.transition === 'online' && typeof onOnline === 'function') {
        try { await onOnline() } catch (e) { console.warn('[net-pulse] обработчик «интернет появился» упал: ' + ((e && e.message) || e)) }
      }
    }
    schedule()
  }

  function schedule() {
    if (stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; check('по расписанию') }, nextDelayMs(state))
  }

  function checkNow(reason) {
    if (timer) { clearTimeout(timer); timer = null }
    check(reason || 'по просьбе')
  }

  // ── IPC ──
  ipcMain.handle('net:pulse-state', () => pulsePayload(state))
  ipcMain.on('net:pulse-now', (_e, payload) => checkNow('окно: ' + ((payload && payload.reason) || 'повтор')))
  ipcMain.on('net:pulse-waiting', (_e, payload) => {
    const before = state.waitingCount
    state = setWaiting(state, payload && payload.count)
    // Ждущих стало больше нуля → переходим на частый пульс сразу, не дожидаясь минуты.
    if (before === 0 && state.waitingCount > 0) checkNow('мессенджер ждёт повтора')
  })

  // ── Пробуждение компьютера / разблокировка — сеть обычно поднимается позже нас ──
  try {
    powerMonitor.on('resume', () => checkNow('компьютер проснулся'))
    powerMonitor.on('unlock-screen', () => checkNow('экран разблокирован'))
  } catch (e) {
    console.warn('[net-pulse] powerMonitor недоступен: ' + ((e && e.message) || e))
  }

  console.log('[net-pulse] запущен: адресов=' + targets.length + ' (' + (source === 'settings' ? 'из настроек netPulseTargets' : 'по умолчанию') + '), в покое каждые ' + (nextDelayMs(state) / 1000) + ' с')
  checkNow('старт')

  return {
    stop() { stopped = true; if (timer) { clearTimeout(timer); timer = null } },
    checkNow,
    getState: () => state,
  }
}

function hostOf(url) {
  try { return new URL(url).hostname } catch (_) { return String(url) }
}
