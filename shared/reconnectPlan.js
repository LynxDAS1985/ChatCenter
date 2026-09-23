// shared/reconnectPlan.js — v1.2.445
//
// ЧИСТАЯ логика автоматического переподключения веб-мессенджеров после обрыва связи.
// Проводка (слушатели, таймеры) — в src/hooks/useWebviewReconnect.js; сама попытка — shared/reconnectAttempt.js;
// тексты записей в журнал и причины для экрана — shared/reconnectTexts.js (v1.2.491, файл упёрся в 300 строк);
// экран для пользователя — src/components/WebviewOfflineOverlay.jsx.
// Подробный план и причины — .memory-bank/reconnect-plan.md.
//
// Лежит в КОРНЕВОЙ shared/ (вне бюджета renderer, как shared/webAvatarGate.js в v1.2.441):
// здесь только вычисления, поэтому это проверяется тестом без запуска приложения.
//
// ЗАЧЕМ РАСТУЩАЯ ПАУЗА: у МАКСа частые повторы однажды довели его сервер до ответа
// «Too many requests» — 30 600 строк в журнале (ADR v1.2.417). Поэтому пауза удваивается,
// а у МАКСа снизу подпёрта 15 секундами.

/** Паузы между попытками, миллисекунды. Дальше последней — повторяем по 60 с. */
export const RETRY_LADDER_MS = [5000, 10000, 20000, 40000, 60000]

/** Минимальная пауза для отдельных сайтов (защита от шторма запросов). */
export const MIN_PAUSE_BY_HOST = [{ test: /max\.ru/i, minMs: 15000 }]

/**
 * v1.2.491: «долгая неудача». 21.09.2026 WhatsApp и веб-Telegram не открывались 3,5 часа при живом
 * интернете (остальные сайты работали) — механизм перезагружал их раз в минуту 160+ раз и засорил
 * журнал 431 строкой. После LONG_FAIL_ATTEMPTS неудач ПРИ ЖИВОМ пульсе пауза становится 5 минут:
 * сайт недоступен сам по себе, чаще стучаться бессмысленно. При мёртвом пульсе лестница обычная —
 * там всё решает возврат интернета, а не наши повторы.
 */
export const LONG_FAIL_ATTEMPTS = 10
export const LONG_FAIL_PAUSE_MS = 300000

/** v1.2.491: «код» записи, рождённой ПРОБОЙ открытой страницы (не сетевой код Chromium). */
export const PROBE_FAIL_CODE = -1000

/**
 * Коды ошибок Chromium, которые означают «связь оборвалась» → повторять стоит.
 * Список сознательно узкий: повторять «страница запрещена» или «нет прав» бессмысленно.
 */
export const NETWORK_ERROR_CODES = {
  '-2': 'ERR_FAILED',
  '-7': 'ERR_TIMED_OUT',
  '-21': 'ERR_NETWORK_CHANGED',
  '-100': 'ERR_CONNECTION_CLOSED',
  '-101': 'ERR_CONNECTION_RESET',
  '-102': 'ERR_CONNECTION_REFUSED',
  '-105': 'ERR_NAME_NOT_RESOLVED',
  '-106': 'ERR_INTERNET_DISCONNECTED',
  '-109': 'ERR_ADDRESS_UNREACHABLE',
  '-118': 'ERR_CONNECTION_TIMED_OUT',
  '-137': 'ERR_NAME_RESOLUTION_FAILED',
  '-324': 'ERR_EMPTY_RESPONSE',
  // v1.2.496: семейство «мёртв ПОСРЕДНИК» — не сайт и не интернет, а VPN/прокси между нами и сетью.
  // Реальный случай 2026-09-23: в Windows включён прокси 127.0.0.1:2080 (Liberty VPN), туннель не поднят →
  // ВСЕ пять веб-мессенджеров получили -130, но списка не было → «повтор не нужен» → ни экрана, ни повторов,
  // и после возврата VPN страницы не поднялись бы сами. Повторять здесь ОСМЫСЛЕННО: посредник оживает.
  '-111': 'ERR_TUNNEL_CONNECTION_FAILED',
  '-120': 'ERR_SOCKS_CONNECTION_FAILED',
  '-121': 'ERR_SOCKS_CONNECTION_HOST_UNREACHABLE',
  '-130': 'ERR_PROXY_CONNECTION_FAILED',
}

/**
 * Коды из NETWORK_ERROR_CODES, которые означают именно «не отвечает ПОСРЕДНИК» (VPN/прокси/туннель).
 * Нужны, чтобы экран говорил правду: интернет может быть жив, мёртв посредник.
 *
 * 🔴 ЛОВУШКА: сюда НЕЛЬЗЯ класть родственные коды, которые повторами НЕ лечатся (их нет и в
 * NETWORK_ERROR_CODES) — по официальному перечню Chromium net_error_list.h:
 *   -115 ERR_PROXY_AUTH_UNSUPPORTED  — прокси просит неподдерживаемый способ входа;
 *   -127 ERR_PROXY_AUTH_REQUESTED    — нужен логин/пароль;
 *   -131 ERR_MANDATORY_PROXY_CONFIGURATION_FAILED — не скачался/не разобрался PAC-скрипт;
 *   -136 ERR_PROXY_CERTIFICATE_INVALID — плохой сертификат прокси.
 * Добавить их = бесконечно дёргать страницу там, где нужен человек.
 */
export const PROXY_ERROR_CODES = ['-111', '-120', '-121', '-130']

/** Это «посредник не отвечает»? (для заголовка экрана и записи в журнал) */
export function isProxyError(code) {
  const n = Number(code)
  return Number.isFinite(n) && PROXY_ERROR_CODES.indexOf(String(n)) !== -1
}

/** Код -3 = ERR_ABORTED: обычная отмена перехода, приходит при НОРМАЛЬНОЙ работе. */
export const ABORTED_CODE = -3

/**
 * Это обрыв связи (стоит повторять) или другая ошибка (повтор не поможет)?
 * @param {number|string} code
 * @returns {boolean}
 */
export function isNetworkError(code) {
  const n = Number(code)
  if (!Number.isFinite(n) || n === ABORTED_CODE) return false
  return Object.prototype.hasOwnProperty.call(NETWORK_ERROR_CODES, String(n))
}

/** Человеческое имя кода ошибки — для журнала и экрана. */
export function errorName(code) {
  const n = Number(code)
  if (n === ABORTED_CODE) return 'ERR_ABORTED'
  if (n === PROBE_FAIL_CODE) return 'PAGE_UNRESPONSIVE'
  return NETWORK_ERROR_CODES[String(n)] || ('код ' + code)
}

/**
 * Сколько ждать перед следующей попыткой.
 * @param {number} attempt — сколько попыток уже сделано (0 = ещё ни одной)
 * @param {string} [url] — адрес мессенджера (для минимума по сайту)
 * @param {boolean|null} [netOnline] — вердикт пульса; долгая пауза только при true (интернет подтверждён)
 * @returns {number} миллисекунды
 */
export function nextPauseMs(attempt, url, netOnline) {
  const a = Number(attempt) || 0
  if (a >= LONG_FAIL_ATTEMPTS && netOnline === true) return LONG_FAIL_PAUSE_MS // только когда пульс ПОДТВЕРДИЛ интернет
  const i = Math.max(0, Math.min(a, RETRY_LADDER_MS.length - 1))
  let ms = RETRY_LADDER_MS[i]
  for (const rule of MIN_PAUSE_BY_HOST) {
    if (url && rule.test.test(String(url)) && ms < rule.minMs) ms = rule.minMs
  }
  return ms
}

/**
 * Новая запись состояния после обрыва.
 * Если попытка уже идёт — состояние НЕ трогаем (иначе один обрыв запланировал бы две попытки).
 * @param {Object|null} entry — что было (или null, если обрыв первый)
 * @param {Object} o
 * @param {number} o.code — код ошибки
 * @param {string} o.url — адрес мессенджера
 * @param {number} o.now — текущее время (Date.now())
 * @returns {Object|null} новая запись или null, если планировать не нужно
 */
export function planAfterFail(entry, { code, url, now, netOnline, origin }) {
  if (entry && entry.phase === 'trying') return entry
  const attempt = (entry && entry.attempt) || 0
  const pauseMs = nextPauseMs(attempt, url, netOnline)
  return {
    attempt,                       // сколько попыток уже сделано
    phase: 'wait',                 // ждём следующей попытки
    dueAt: now + pauseMs,          // когда попробуем
    pauseMs,                       // сколько ждём (для полосы на экране)
    code: Number(code),
    since: (entry && entry.since) || now, // когда началась беда — для «восстановлено за N с»
    failedAt: now,                 // v1.2.452: момент сбоя — см. isErrorPageEcho
    origin: origin || (entry && entry.origin) || 'load', // v1.2.491: 'load' — сорвалась загрузка; 'probe' — открытая страница перестала отвечать
  }
}

/** Запись перед началом попытки: считаем попытку и помечаем «идёт». */
export function planTrying(entry, now) {
  const base = entry || { attempt: 0, since: now, code: 0 }
  return { ...base, attempt: (base.attempt || 0) + 1, phase: 'trying', dueAt: now, pauseMs: 0 }
}

/** Запись после неудачной попытки: снова ждём, пауза больше. */
export function planAfterRetryFail(entry, { code, url, now, netOnline }) {
  const attempt = (entry && entry.attempt) || 1
  const pauseMs = nextPauseMs(attempt, url, netOnline)
  return {
    attempt,
    phase: 'wait',
    dueAt: now + pauseMs,
    pauseMs,
    code: Number(code) || (entry && entry.code) || 0,
    since: (entry && entry.since) || now,
    failedAt: now,                 // v1.2.452: момент сбоя — см. isErrorPageEcho
    origin: (entry && entry.origin) || 'load',
  }
}

/** Кому пора пробовать прямо сейчас. */
export function dueIds(state, now) {
  const out = []
  for (const id of Object.keys(state || {})) {
    const e = state[id]
    if (e && e.phase === 'wait' && e.dueAt <= now) out.push(id)
  }
  return out
}

/**
 * Ближайшее время, когда надо проснуться (для одного таймера вместо тика раз в секунду).
 * @returns {number|null} миллисекунды до пробуждения или null, если ждать нечего
 */
export function nextWakeMs(state, now) {
  let best = null
  for (const id of Object.keys(state || {})) {
    const e = state[id]
    if (!e || e.phase !== 'wait') continue
    const ms = Math.max(0, e.dueAt - now)
    if (best === null || ms < best) best = ms
  }
  return best
}

/** «Сеть появилась» → всем ожидающим двигаем время попытки на сейчас. */
export function bringAllForward(state, now) {
  const next = {}
  let moved = 0
  for (const id of Object.keys(state || {})) {
    const e = state[id]
    if (e && e.phase === 'wait') { next[id] = { ...e, dueAt: now }; moved++ }
    else next[id] = e
  }
  return { state: next, moved }
}

/** Сколько секунд осталось до попытки (для экрана). */
export function secondsLeft(entry, now) {
  if (!entry || entry.phase !== 'wait') return 0
  return Math.max(0, Math.ceil((entry.dueAt - now) / 1000))
}

/**
 * v1.2.452 — сколько после сбоя НЕ верить событию «страница загрузилась».
 *
 * 🔴 НАЙДЕНО ПО ЖИВОМУ ЖУРНАЛУ (2026-09-10 18:59, настоящий обрыв интернета).
 * Сразу ПОСЛЕ неудачи Chromium показывает свою страницу-ошибку, и у неё тоже случается
 * событие «загрузилась» (`did-finish-load`). По доке Electron это событие значит лишь
 * «переход завершён и сработал onload» — ЧТО именно загрузилось, оно не сообщает.
 * В журнале обрыв и «восстановление» стояли в ОДНУ секунду (30-60 мс друг от друга):
 *   [reconnect] WhatsApp: обрыв связи, код=-105 ERR_NAME_NOT_RESOLVED, попытка 1 через 5с
 *   [reconnect] WhatsApp: связь восстановлена за 0с (попыток: 1)
 * Последствие: экран «Нет связи» мелькал и исчезал, лестница повторов НЕ запускалась,
 * мессенджер оставался на странице-ошибке — то есть вся функция не работала.
 *
 * Две секунды с запасом покрывают страницу-ошибку и не мешают распознать настоящее
 * «поднялась сама»: такое случается через секунды, а не через миллисекунды.
 */
export const ERROR_PAGE_GRACE_MS = 2000

/**
 * «Это эхо страницы-ошибки, а не успех?» Момент сбоя лежит В САМОЙ ЗАПИСИ (поле failedAt) —
 * специально, чтобы в хуке не появилось ещё одно хранилище: добавление хука в работающее
 * приложение ломает горячую перезагрузку («Should have a queue» от React).
 * @param {object|null} entry — запись мессенджера
 * @param {number} now — текущее время (мс)
 */
export function isErrorPageEcho(entry, now) {
  const f = Number(entry && entry.failedAt) || 0
  if (!f) return false
  const dt = Number(now) - f
  return dt >= 0 && dt < ERROR_PAGE_GRACE_MS
}

/**
 * v1.2.453 — «Верить ли событию „страница загрузилась“?»
 *
 * НЕ верим в двух случаях (оба найдены ревью на живом журнале):
 *  1) идёт НАША попытка — в этой фазе судьбу решает только обещание loadURL (по доке
 *     Electron оно отклоняется при неудаче). Отчёт страницы-ошибки приходит РАНЬШЕ отказа
 *     обещания и успел бы снять экран до того, как мы узнаем о неудаче;
 *  2) событие пришло в первые ERROR_PAGE_GRACE_MS после сбоя — это эхо страницы-ошибки.
 * @param {object|null} entry — запись мессенджера
 * @param {number} now — текущее время (мс)
 */
export function shouldAcceptLoaded(entry, now) {
  if (!entry) return false
  if (entry.phase === 'trying') return false
  return !isErrorPageEcho(entry, now)
}

/**
 * v1.2.453 — новый сбой, когда попытка УЖЕ идёт: вторую попытку не планируем,
 * но метку времени сбоя обновляем. Иначе метка осталась бы от первого сбоя, и уже через
 * 5 секунд эхо страницы-ошибки снова сошло бы за успех (экран исчезал, повторы прекращались).
 */
export function touchFailedAt(entry, now) {
  return entry ? { ...entry, failedAt: now } : entry
}

/** Имя/адрес/цвет мессенджера по его id — для экрана и записей журнала. */
export function messengerInfo(list, id) {
  const m = (list || []).find(x => x && x.id === id)
  return { name: (m && m.name) || id, url: (m && m.url) || '', color: m && m.color }
}
