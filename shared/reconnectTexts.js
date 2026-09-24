// shared/reconnectTexts.js — v1.2.491
//
// Тексты записей в журнал и причины для экрана «Нет связи» — вынесены из shared/reconnectPlan.js
// (тот упёрся в 300 строк). В одном месте, чтобы проверялись тестом и не расходились между
// хуком, попыткой (reconnectAttempt.js) и экраном (WebviewOfflineOverlay.jsx).
import { errorName, isProxyError, LONG_FAIL_ATTEMPTS, ATTEMPT_TIMEOUT_MS, PROBE_TIMEOUT_MS } from './reconnectPlan.js'

/**
 * v1.2.497: начало попытки. Раньше журнал молчал между «обрыв связи» и ответом страницы —
 * зависшая попытка выглядела так же, как её отсутствие, и разобрать случай было нечем.
 */
export function logAttemptStartLine(name, entry, limitMs = ATTEMPT_TIMEOUT_MS) {
  return `[reconnect] ${name}: попытка ${entry.attempt} — загружаю страницу (жду до ${Math.round(limitMs / 1000)}с)`
}

/** v1.2.498: вторую попытку поверх идущей не начинаем — пишем об этом, иначе «ничего не произошло». */
export function logBusySkipLine(name) {
  return `[reconnect] ${name}: попытка уже идёт — второй запуск пропущен`
}

/** v1.2.498: проба «жива ли страница» сама не ответила за предел. */
export function logProbeTimeoutLine(name, limitMs = PROBE_TIMEOUT_MS) {
  return `[reconnect] ${name}: проверка «жива ли страница» не ответила за ${Math.round(limitMs / 1000)}с — считаю, что не жива`
}

/** v1.2.498: перед новой попыткой глушим прошлую загрузку, которую бросили по пределу. */
export function logStopPrevLine(name) {
  return `[reconnect] ${name}: глушу прошлую зависшую загрузку перед новой попыткой`
}

/** v1.2.498: страница догрузилась ПОСЛЕ того, как мы прекратили ждать — засчитываем, не перезагружаем. */
export function logLateLoadLine(name) {
  return `[reconnect] ${name}: страница догрузилась уже после предела — засчитываю, перезагружать не буду`
}

/** v1.2.497: страница не ответила за предел ожидания (ATTEMPT_TIMEOUT_MS) — не молчим об этом. */
export function logAttemptTimeoutLine(name, entry, limitMs = ATTEMPT_TIMEOUT_MS) {
  // v1.2.498: срок берём ФАКТИЧЕСКИЙ (он растёт с попытками), а не константу — иначе журнал врёт.
  const code = entry && entry.code ? ` (причина осталась прежней: код=${entry.code} ${errorName(entry.code)})` : ''
  return `[reconnect] ${name}: страница НЕ ОТВЕТИЛА за ${Math.round(limitMs / 1000)}с — прекращаю ждать${code}, ` +
    `следующая попытка через ${Math.round((entry && entry.pauseMs) || 0) / 1000}с`
}

export function logFailLine(name, entry) {
  return `[reconnect] ${name}: обрыв связи, код=${entry.code} ${errorName(entry.code)}, ` +
    `попытка ${entry.attempt + 1} через ${Math.round(entry.pauseMs / 1000)}с`
}

export function logSkipLine(name, code) {
  return `[reconnect] ${name}: код=${code} (${errorName(code)}) — повтор не нужен`
}

export function logRetryFailLine(name, entry) {
  return `[reconnect] ${name}: попытка ${entry.attempt} не удалась (код=${entry.code} ` +
    `${errorName(entry.code)}), следующая через ${Math.round(entry.pauseMs / 1000)}с`
}

export function logRestoredLine(name, entry, now) {
  const sec = Math.max(0, Math.round((now - ((entry && entry.since) || now)) / 1000))
  return `[reconnect] ${name}: связь восстановлена за ${sec}с (попыток: ${(entry && entry.attempt) || 1})`
}

export function logManualLine(name) {
  return `[reconnect] ${name}: повтор по кнопке пользователя`
}

export function logNetLine(online, waitingCount) {
  return online
    ? `[net] связь появилась — пробуем поднять мессенджеры: ${waitingCount}`
    : '[net] связь пропала'
}

// ── v1.2.491 ──
export function logNetDownSkipLine(name) {
  return `[reconnect] ${name}: интернета нет (по пульсу) — страницу не дёргаем, ждём возврата сети`
}

export function logSelfHealedLine(name, entry, now) {
  const sec = Math.max(0, Math.round((now - ((entry && entry.since) || now)) / 1000))
  return `[reconnect] ${name}: страница ожила сама за ${sec}с — перезагрузка не понадобилась`
}

/**
 * Что писать на экране «Нет связи» — честно про причину.
 * @param {object} entry — запись мессенджера
 * @param {boolean|null} netOnline — вердикт пульса (null = неизвестно)
 */
export function reasonTitle(entry, netOnline, name) {
  // v1.2.496: ПЕРВОЙ веткой — «мёртв посредник». Иначе при мёртвом пульсе (а он при мёртвом прокси
  // честно говорит «нет»: net.fetch идёт тем же путём) экран сказал бы «Нет интернета» и увёл бы
  // человека искать беду не там. Реальный случай 2026-09-23 — см. mistakes/electron-core.md.
  // v1.2.497 (#5 ревью): ветка работает, только пока пульс НЕ подтвердил интернет. Если пульс говорит
  // «есть», значит посредник ЖИВ (пульс ходит через него же) — и старый код ошибки уже неактуален,
  // беда в самом сайте. Иначе экран продолжал бы винить VPN после его починки.
  if (entry && isProxyError(entry.code) && netOnline !== true) {
    return {
      title: 'Не отвечает посредник (VPN или прокси)',
      hint: 'интернет, скорее всего, есть: весь веб идёт через программу-посредника, а она сейчас молчит — включите VPN либо выключите прокси в настройках Windows',
    }
  }
  if (netOnline === false) {
    return { title: `Нет интернета`, hint: 'проверяем связь каждые 15 секунд; страницу не трогаем, чтобы не потерять написанное' }
  }
  if (entry && entry.origin === 'probe') {
    return { title: `${name}: страница не отвечает`, hint: 'сначала спросим страницу, ожила ли сама; если нет — перезагрузим' }
  }
  const long = entry && entry.attempt >= LONG_FAIL_ATTEMPTS
  return {
    title: `Сайт ${name} недоступен`,
    // v1.2.498 (находка ревью #14): три состояния вместо двух. Раньше при НЕИЗВЕСТНОМ вердикте
    // (пульс выключен настройкой или ещё не ответил) экран уверенно писал «интернет пропал» —
    // то есть утверждал то, чего никто не проверял.
    hint: (netOnline === true ? 'интернет есть, не отвечает сам сайт'
      : netOnline === false ? 'интернет пропал'
        : 'связь не проверялась — проверка интернета выключена или ещё не ответила')
      + (long ? ' · долго не отвечает, проверяем раз в 5 минут' : ''),
  }
}

/** Эхо страницы-ошибки писать не на каждую попытку: с 3-й — только каждую 10-ю (шум в журнале). */
export function shouldLogEcho(entry) {
  const a = (entry && entry.attempt) || 0
  return a < 3 || a % 10 === 0
}

/** Запись в журнал: отбросили эхо страницы-ошибки (иначе отказ был бы «немым»). */
export function logEchoLine(name) {
  return `[reconnect] ${name}: пришла страница-ошибка, а не сама страница — восстановлением не считаю`
}

/**
 * v1.2.492: строка про пульс для экрана «Нет связи» и панели связи.
 * @param {{online:boolean|null, checkedAt:number}|null} pulse — последний пакет `net:pulse`
 * @param {number} now
 */
export function pulseStatusLine(pulse, now = Date.now()) {
  if (!pulse || typeof pulse.online !== 'boolean' || !pulse.checkedAt) return 'Интернет: ещё не проверяли'
  const sec = Math.max(0, Math.round((now - pulse.checkedAt) / 1000))
  const ago = sec < 60 ? `${sec} с назад` : `${Math.floor(sec / 60)} мин назад`
  // v1.2.496: если молчит посредник (VPN/прокси) — говорим это прямо, иначе человек ищет беду в интернете.
  const why = !pulse.online && pulse.proxyDown ? ' · молчит посредник (VPN/прокси)' : ''
  return `Интернет: ${pulse.online ? 'есть' : 'нет'}${why} · проверено ${ago}`
}

/**
 * v1.2.494: что написать на кнопке экрана «Нет связи».
 *
 * ЗАЧЕМ: когда пульс говорит «интернета нет», попытка НАМЕРЕННО не перезагружает страницу
 * (shared/reconnectAttempt.js — перезагрузка без интернета бессмысленна и стирает недописанное
 * сообщение). Нажатие при этом всё равно полезно: оно просит главный процесс проверить интернет
 * прямо сейчас (`net:pulse-now`). Но надпись «Повторить сейчас» обещала перезагрузку, которой не
 * будет — человеку казалось, что кнопка сломана. Теперь надпись говорит правду.
 *
 * @param {{phase?:string}|null} entry — запись мессенджера (фаза «идёт попытка» важнее всего)
 * @param {boolean|null} netOnline — вердикт пульса: false = интернета нет, null = ещё не знаем
 */
export function retryButtonLabel(entry, netOnline) {
  if (entry && entry.phase === 'trying') return 'Подождите…'
  // v1.2.497 (#6 ревью): «Проверить связь», а не «Проверить интернет» — при мёртвом посреднике
  // (VPN/прокси) интернет-то есть, и прежняя надпись противоречила заголовку экрана.
  return netOnline === false ? 'Проверить связь' : 'Повторить сейчас'
}
