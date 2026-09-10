// shared/webAvatarGate.js — v1.2.441
//
// Чистые помощники «памяти» сборщика аватарок веб-аккаунтов (src/hooks/useWebAccountAvatars.js).
// Лежит в КОРНЕВОЙ shared/ (вне бюджета renderer-кода, как shared/notifAlbum.js в v1.2.95):
// правило проекта — не раздувать src/, а выносить обособленную логику. Плюс здесь она
// проверяется юнит-тестом без React и без запуска приложения.
//
// Три находки ревью v1.2.440, которые здесь закрыты:
//
//   №1 «кнопка не работает». Пункт меню «Обновить фото аккаунта» (useTabContextMenu.js)
//      чистит служебные ключи в хранилище страницы мессенджера, но значок в боковой полосе
//      продолжал показывать СТАРОЕ фото: состояние обновлялось только при появлении НОВОГО
//      снимка, а ветка «фото не нашлось» состояние не трогала. Отсюда пара:
//      меню шлёт событие AVATAR_RESET_EVENT → сборщик применяет forgetAvatar() и dropGateKeys().
//      Приём «одно место шлёт событие, другое слушает» уже есть в проекте:
//      useConsoleErrorLogger.js → UncaughtErrorToast.jsx (событие 'cc-uncaught-error').
//
//   №2 «неудачу не видно». Запись «НЕТ фото» гейтилась по одному id → писалась один раз
//      за сеанс. После сброса повторная неудача (а её как раз и надо разбирать) в журнал
//      уже не попадала. Теперь ключ несёт СОСТОЯНИЕ (где искали + причина + ошибка).
//
//   №3 «цифра в ключе». В поле sel зашит размер снимка ('onscreen-big-4360',
//      src/utils/webAvatarScript.js) → изменение размера на один символ давало НОВЫЙ ключ:
//      повтор в журнале + бесконечный рост набора ключей. Тот же класс ошибки уже чинили
//      у Озона (shared/browserBannerHider.js: v.replace(/[0-9]+/g, '')).

/** Имя события «забудь фото этого источника». Шлёт пункт меню, слушает сборщик аватарок. */
export const AVATAR_RESET_EVENT = 'cc-avatar-reset'

/**
 * Ключ «это уже писали в журнал».
 * id оставляем как есть (цифры в нём — часть имени: custom_1772704264107),
 * а переменную часть чистим от ЧИСЕЛ: размер снимка меняется, событие остаётся тем же
 * → одна строка на вид события, набор ключей не растёт (находка №3).
 * @param {string} id — идентификатор мессенджера
 * @param {...any} parts — где нашли (sel), причина (avwhy), ошибка (err)
 * @returns {string}
 */
export function avatarLogGateKey(id, ...parts) {
  return String(id) + '|' + parts.map(p => String(p == null ? '' : p).replace(/[0-9]+/g, '#')).join('|')
}

/**
 * Снять гейты журнала для одного источника (после сброса фото по команде пользователя):
 * следующая попытка — удачная или нет — обязана попасть в журнал.
 * Удаляются и простые ключи (сам id), и составные (id + '|' + состояние).
 * @param {Set<string>} set
 * @param {string} id
 * @returns {number} сколько ключей убрали
 */
export function dropGateKeys(set, id) {
  if (!set || !id) return 0
  let n = 0
  for (const k of Array.from(set)) {
    if (k === id || String(k).indexOf(id + '|') === 0) { set.delete(k); n++ }
  }
  return n
}

/**
 * Убрать фото одного источника из состояния значков.
 * Чистая функция: по доке React функция-обновитель может быть вызвана дважды (Strict Mode),
 * поэтому внутри неё нельзя ни писать в журнал, ни менять что-то ещё.
 * Если фото и не было — возвращаем ТОТ ЖЕ объект (лишней перерисовки не будет).
 * @param {Object} prev
 * @param {string} id
 * @returns {Object}
 */
export function forgetAvatar(prev, id) {
  const cur = prev || {}
  if (!id || !(id in cur)) return cur
  const next = { ...cur }
  delete next[id]
  return next
}

/**
 * Применить сброс «забудь фото» целиком: убрать фото из состояния, снять гейты журнала,
 * забыть последнее отданное фото. Сама запись в журнал делается снаружи (хук) — здесь
 * только ВОЗВРАЩАЕТСЯ готовая строка, чтобы модуль оставался чистым и проверяемым.
 * @param {Object} o
 * @param {any} o.ev — событие AVATAR_RESET_EVENT (id берём из detail: строка или {id})
 * @param {Function} o.setAvatars — обновитель состояния значков
 * @param {Array<Set<string>>} o.gateSets — наборы «уже писали в журнал»
 * @param {Map<string,string>} o.lastPhotos — последнее отданное фото по источникам
 * @returns {string|null} строка для журнала или null, если событие пустое
 */
export function applyAvatarReset({ ev, setAvatars, gateSets = [], lastPhotos }) {
  const d = ev && ev.detail
  const id = typeof d === 'string' ? d : (d && d.id) || ''
  if (!id) return null
  if (typeof setAvatars === 'function') setAvatars(prev => forgetAvatar(prev, id))
  let gates = 0
  for (const s of gateSets) gates += dropGateKeys(s, id)
  if (lastPhotos && typeof lastPhotos.delete === 'function') lastPhotos.delete(id)
  return `[web-avatar] значок ЗАБЫЛ старое фото: ${id} (снято гейтов журнала: ${gates}) — ждём новый снимок, до ~12с`
}

// ── Тексты записей в журнал ──────────────────────────────────────────────────
// Вынесены сюда, чтобы (а) хук остался тонкой проводкой, (б) сам текст проверялся тестом.
// В журнал НЕ попадает имя аккаунта и содержимое фото — только техническая причина.

/**
 * «фото получено»: где нашли (sel), причина годности сохранённого снимка (avwhy) и —
 * с v1.2.442 — ЗАМЕР «имя-рядом»: встречается ли имя нашего аккаунта в тексте возле снимка.
 * Это только НАБЛЮДЕНИЕ (см. webAvatarScript.js): по нему потом решим, можно ли по этому
 * признаку отбраковывать чужое фото. Отбраковки пока НЕТ — сначала данные из журнала.
 */
export function avatarOkLine(id, res) {
  const why = res && res.avwhy ? ', причина=' + res.avwhy : ''
  const near = res && res.avnear ? ', имя-рядом=' + res.avnear : ''
  return `[web-avatar] получен аватар: ${id} (sel=${res && res.sel}${why}${near})`
}

/** «фото заменено на другое» — подтверждение, что сброс по команде пользователя сработал. */
export function avatarReplacedLine(id, res) {
  return `[web-avatar] фото ЗАМЕНЕНО: ${id} (sel=${res && res.sel}, причина=${(res && res.avwhy) || '—'})`
}

/** «фото не нашлось»: где искали, ошибка, причина отказа сохранённого снимка, дамп. */
export function avatarFailLine(id, res) {
  const r = res || {}
  return `[web-avatar-diag] ${id}: НЕТ фото — sel=${r.sel} err=${r.err || ''}` +
    (r.avwhy ? ' причина=' + r.avwhy : '') + (r.dump ? ' dump=' + r.dump : '')
}
