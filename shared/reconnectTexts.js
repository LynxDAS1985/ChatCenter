// shared/reconnectTexts.js — v1.2.491
//
// Тексты записей в журнал и причины для экрана «Нет связи» — вынесены из shared/reconnectPlan.js
// (тот упёрся в 300 строк). В одном месте, чтобы проверялись тестом и не расходились между
// хуком, попыткой (reconnectAttempt.js) и экраном (WebviewOfflineOverlay.jsx).
import { errorName, isProxyError, LONG_FAIL_ATTEMPTS } from './reconnectPlan.js'

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
  if (entry && isProxyError(entry.code)) {
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
    hint: (netOnline === true ? 'интернет есть, не отвечает сам сайт' : 'интернет пропал') + (long ? ' · долго не отвечает, проверяем раз в 5 минут' : ''),
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
  return netOnline === false ? 'Проверить интернет' : 'Повторить сейчас'
}
