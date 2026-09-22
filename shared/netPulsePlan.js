// shared/netPulsePlan.js — v1.2.491
//
// ЧИСТАЯ логика «пульса интернета»: когда щупать, что считать переходом, какие строки писать.
// Обвязка с Electron (net.fetch, powerMonitor, IPC, таймер) — main/handlers/netPulseHandlers.js.
// План и причины — .memory-bank/reconnect-plan.md, раздел 4e.
//
// ЗАЧЕМ. По официальной документации Electron (DOCS/Electron docs/tutorial/online-offline-events.md,
// api/net.md) стандартные события «online/offline» и `net.isOnline()` надёжны только в одну сторону:
// «false» = сети точно нет, а «true» ничего не гарантирует. На машине пользователя за два настоящих
// обрыва (21–22.09.2026) эти события не сработали НИ РАЗУ (0 строк `[net]` в журнале) — провод в
// роутер был, интернета не было. Поэтому единственный честный способ узнать «интернет есть?» — самому
// сделать крошечный запрос и посмотреть, ответили ли. Это и есть пульс.
//
// ЧТО ДАЁТ ПЕРЕХОД «не было → появился»: веб-страницы пробуют подняться СРАЗУ (а не по будильнику до
// 60 с), родному Telegram посылается setNetworkType (по документации TDLib его надо звать при каждой
// смене сети — он переоткрывает соединения), полоса «нет связи» у «Общего чата» гаснет.
//
// ЧАСТОТА: раз в 60 с в покое; раз в 15 с, когда интернета нет ИЛИ кто-то из мессенджеров ждёт
// повтора; немедленно — при пробуждении компьютера, разблокировке экрана и по просьбе окна.
// Между двумя проверками — не меньше 3 с (защита от «дребезга» просьб).

/**
 * Куда стучимся. Порядок важен: первый ответивший = интернет есть. Адреса — служебные страницы
 * проверки связи (их держат ради этого сами Microsoft/Google), плюс запасной обычный сайт.
 * Любой HTTP-ответ (даже 4xx/5xx) = сеть до сервера есть; нет ответа/таймаут = нет.
 */
export const PULSE_TARGETS = [
  'https://www.msftconnecttest.com/connecttest.txt', // тем же адресом Windows сам проверяет интернет
  'https://www.gstatic.com/generate_204',
  'https://yandex.ru/favicon.ico',
]

export const PULSE_OK_MS = 60000        // пауза между проверками, когда всё хорошо и никто не ждёт
export const PULSE_PROBLEM_MS = 15000   // пауза, когда интернета нет или мессенджеры ждут повтора
export const PULSE_TIMEOUT_MS = 5000    // сколько ждём ответ одного адреса
export const PULSE_MIN_GAP_MS = 3000    // не чаще одной проверки в 3 с (дребезг просьб «проверь сейчас»)
export const STILL_OFFLINE_LOG_MS = 300000 // пока интернета нет — напоминание в журнал раз в 5 мин

export function createPulseState(now = Date.now()) {
  return {
    online: null,        // null = ещё не проверяли; true/false — последний вердикт
    since: 0,            // когда наступило текущее состояние
    lastCheckAt: 0,
    lastHost: '',        // кто ответил
    lastLatencyMs: 0,
    waitingCount: 0,     // сколько мессенджеров в окне ждут повтора (ускоряет пульс)
    checking: false,
    lastStillLogAt: 0,
    createdAt: now,
  }
}

/** Через сколько миллисекунд щупать в следующий раз. */
export function nextDelayMs(state) {
  if (!state) return PULSE_OK_MS
  if (state.online === false || (state.waitingCount || 0) > 0) return PULSE_PROBLEM_MS
  return PULSE_OK_MS
}

/** Можно ли проверять прямо сейчас (не идёт ли проверка, не слишком ли рано). */
export function canCheckNow(state, now = Date.now()) {
  if (!state || state.checking) return false
  return !state.lastCheckAt || now - state.lastCheckAt >= PULSE_MIN_GAP_MS
}

/**
 * Применить результат проверки.
 * @param {object} state
 * @param {{ok:boolean, host?:string, latencyMs?:number, now?:number, reason?:string}} r
 * @returns {{state:object, transition:'online'|'offline'|null, line:string|null}}
 */
export function applyResult(state, { ok, host = '', latencyMs = 0, now = Date.now(), reason = '' }) {
  const prev = state.online
  const next = { ...state, checking: false, lastCheckAt: now, lastHost: ok ? host : state.lastHost, lastLatencyMs: ok ? latencyMs : state.lastLatencyMs }
  let transition = null
  let line = null
  if (ok && prev !== true) {
    transition = 'online'
    const downSec = prev === false && state.since ? Math.round((now - state.since) / 1000) : 0
    line = prev === null
      ? `[net-pulse] интернет есть (ответил ${host} за ${latencyMs} мс)${reason ? ' · причина проверки: ' + reason : ''}`
      : `[net-pulse] интернет ПОЯВИЛСЯ через ${downSec} с (ответил ${host} за ${latencyMs} мс)${reason ? ' · причина проверки: ' + reason : ''}`
    next.online = true; next.since = now; next.lastStillLogAt = 0
  } else if (!ok && prev !== false) {
    transition = 'offline'
    line = `[net-pulse] интернет ПРОПАЛ — ни один из ${PULSE_TARGETS.length} адресов не ответил${reason ? ' · причина проверки: ' + reason : ''}`
    next.online = false; next.since = now; next.lastStillLogAt = now
  } else if (!ok && prev === false && now - (state.lastStillLogAt || 0) >= STILL_OFFLINE_LOG_MS) {
    line = `[net-pulse] интернета всё ещё нет (уже ${Math.round((now - state.since) / 60000)} мин)`
    next.lastStillLogAt = now
  }
  return { state: next, transition, line }
}

/** Что уходит в окно приложения (и что оно спрашивает при старте). */
export function pulsePayload(state, now = Date.now()) {
  return {
    online: state ? state.online : null,
    since: state ? state.since : 0,
    checkedAt: state ? state.lastCheckAt : 0,
    host: state ? state.lastHost : '',
    latencyMs: state ? state.lastLatencyMs : 0,
    ageMs: state && state.lastCheckAt ? now - state.lastCheckAt : -1,
  }
}

/** Сколько мессенджеров ждут — от окна. Меняет частоту пульса. */
export function setWaiting(state, count) {
  const n = Math.max(0, Number(count) || 0)
  return state.waitingCount === n ? state : { ...state, waitingCount: n }
}
