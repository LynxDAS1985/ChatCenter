// shared/reconnectErrorCodes.js — v1.2.497
//
// КОДЫ ОШИБОК и их разбор — вынесены из shared/reconnectPlan.js (тот упёрся в 298/300 строк после
// добавления семейства «молчит посредник»). Правило проекта: не резать комментарии, а разделять файл
// (CLAUDE.md, «Правило превышения лимита строк»). Здесь только справочник и чистые проверки — ни
// планирования, ни времени, ни React, поэтому файл легко читается и тестируется отдельно.
//
// Кто пользуется: reconnectPlan.js (планирование), reconnectTexts.js (надписи), reconnectAttempt.js
// (предел ожидания), useOpenPageWatch.js (проба здоровья), WebviewOfflineOverlay.jsx (показ кода).

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

/**
 * v1.2.497 — ПРЕДЕЛ ОЖИДАНИЯ одной попытки.
 *
 * ЗАЧЕМ (реальный случай 2026-09-23, экран «Подключаемся к ВКонтакте… попытка 1 · идёт» висел, и
 * выйти было нечем): пока запись в фазе `trying`, из неё закрыты ВСЕ три выхода —
 *   • `bringAllForward` двигает только фазу `wait` (возврат интернета такую запись не будит);
 *   • `shouldAcceptLoaded` при `trying` возвращает false (даже успешная загрузка не снимет экран);
 *   • `dueIds` её не выдаёт (будильник лестницы проходит мимо).
 * Единственным выходом был ответ `loadURL`, а он на мёртвом посреднике может не прийти вовсе.
 * Теперь попытка ждёт ответа не дольше этого срока и возвращается в `wait` — все три выхода
 * снова работают. 45 с выбраны с запасом: обычная загрузка мессенджера в журнале — 5–30 с.
 */
export const ATTEMPT_TIMEOUT_MS = 45000

/** v1.2.491: «код» записи, рождённой ПРОБОЙ открытой страницы (не сетевой код Chromium). */
export const PROBE_FAIL_CODE = -1000

/** «Код» записи, рождённой ПРЕДЕЛОМ ОЖИДАНИЯ (не сетевой код Chromium) — как PROBE_FAIL_CODE. */
export const ATTEMPT_TIMEOUT_CODE = -1001

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
  if (n === ATTEMPT_TIMEOUT_CODE) return 'ATTEMPT_TIMEOUT' // v1.2.497
  return NETWORK_ERROR_CODES[String(n)] || ('код ' + code)
}
