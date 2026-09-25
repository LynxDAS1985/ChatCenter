// shared/ozonCountMerge.js — v1.2.505
//
// КТО ГЛАВНЕЕ, когда число новых отзывов приходит из ДВУХ разных мест.
//
// ОТКУДА ВООБЩЕ ДВА МЕСТА:
//   1) ТОЧНОЕ число — со вкладки-фильтра самой страницы Ozon («Новые 13»). Читает невидимая
//      фоновая страница, см. shared/ozonTabPoll.js. Это правда, какой бы она ни была.
//   2) ПОДСЧЁТ СТРОК — сторож страницы (main/preloads/hooks/ozon.hook.js) считает строки с пометкой
//      «Новый». Его шлют И невидимая страница (src/utils/ozonBgWatcher.js), И открытая вкладка
//      (src/utils/consoleMessageHandler.js). Он ВСЕГДА занижает: Ozon отдаёт список порциями, и
//      кто список не листает, видит только первую (5 из 13).
//
// 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ (ревью v1.2.505 нашло три беды, все воспроизведены):
//   • защита «есть точное число — подсчёту не верим» стояла ТОЛЬКО на пути невидимой страницы.
//     Открытая вкладка писала своё заниженное число напрямую, и значок мигал 13 → 5 → 13;
//   • правило «число можно только повышать» (ADR-038) не давало значку погаснуть: после потери
//     точного числа старое 13 нельзя было понизить ничем, и значок залипал навсегда;
//   • оба пути писали число по-своему, поэтому исправить в одном месте было нельзя.
// Теперь решение одно на всех, живёт здесь и проверяется тестами.
//
// ЧТО ХРАНИМ В СОСТОЯНИИ рядом с числом: `rvSrc` — откуда пришло текущее значение.
//   'tab'    — точное со вкладки. Подсчёт строк игнорируется целиком.
//   'rebase' — точное только что потеряно. Следующее значение подсчёта принимаем КАК ЕСТЬ, чтобы
//              значок мог упасть (иначе «только вверх» держало бы старое число вечно).
//   'rows'   — ведём по подсчёту строк, действует «только вверх» (см. ниже, почему оно нужно).
//
// ПОЧЕМУ «ТОЛЬКО ВВЕРХ» ВООБЩЕ ОСТАЁТСЯ (ADR-038): невидимая страница держит снимок до трёх минут
// и видит лишь первую порцию. Без этого правила она тянула бы вниз честное число, которое поставила
// открытая вкладка. Лучше показать чуть больше, чем ПРОПУСТИТЬ отзыв.

/**
 * Годное ли это число для счётчика. Проверка СТРОГАЯ по типу: `Number(null)` равно нулю, поэтому
 * мягкая проверка пропускала `null` как честный ноль и обнулила бы значок (поймано тестом v1.2.505).
 * @returns {number|null} null = значение негодное, состояние трогать нельзя
 */
function toCount(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

/** Откуда пришло текущее значение счётчика отзывов. */
export const RV_SRC = { TAB: 'tab', REBASE: 'rebase', ROWS: 'rows' }

/**
 * Пришло ТОЧНОЕ число со вкладки страницы. Всегда побеждает — и вверх, и вниз.
 * @param {object} cur — текущее состояние счётчиков одного Ozon-аккаунта ({ msg, qa, rv, rvSrc })
 * @param {number} n
 * @returns {{ next: object|null, changed: boolean }} next=null → менять нечего
 */
export function applyOzonExact(cur, n) {
  const c = cur || {}
  const v = toCount(n)
  if (v === null) return { next: null, changed: false }
  if (c.rv === v && c.rvSrc === RV_SRC.TAB) return { next: null, changed: false }
  return { next: { ...c, rv: v, rvSrc: RV_SRC.TAB }, changed: c.rv !== v }
}

/**
 * Точное число со страницы прочитать больше не удаётся (Ozon поменял вид, ушли с раздела).
 * Само значение НЕ трогаем — просто разрешаем следующему подсчёту строк задать его заново.
 */
export function clearOzonExact(cur) {
  const c = cur || {}
  if (c.rvSrc !== RV_SRC.TAB) return { next: null, changed: false }
  return { next: { ...c, rvSrc: RV_SRC.REBASE }, changed: false }
}

/**
 * Пришло число из ПОДСЧЁТА СТРОК (сторож страницы). Что с ним делать — зависит от того, ведём ли
 * мы счёт по точному числу.
 * @returns {{ next: object|null, changed: boolean, reason: 'ignored'|'rebase'|'up'|'kept'|'first' }}
 *   reason нужен вызывающему, чтобы написать в журнал ПОНЯТНУЮ причину, а не «что-то произошло».
 */
export function applyOzonRowCount(cur, n) {
  const c = cur || {}
  const v = toCount(n)
  if (v === null) return { next: null, changed: false, reason: 'ignored' }
  if (c.rvSrc === RV_SRC.TAB) return { next: null, changed: false, reason: 'ignored' }
  if (c.rvSrc === RV_SRC.REBASE) {
    // Точное только что потерялось: принимаем как есть, иначе значок не сможет упасть.
    if (c.rv === v) return { next: { ...c, rvSrc: RV_SRC.ROWS }, changed: false, reason: 'rebase' }
    return { next: { ...c, rv: v, rvSrc: RV_SRC.ROWS }, changed: true, reason: 'rebase' }
  }
  if (c.rv === undefined) return { next: { ...c, rv: v, rvSrc: RV_SRC.ROWS }, changed: true, reason: 'first' }
  if (v > c.rv) return { next: { ...c, rv: v, rvSrc: RV_SRC.ROWS }, changed: true, reason: 'up' }
  return { next: null, changed: false, reason: 'kept' }
}

/**
 * Число из ОТКРЫТОЙ вкладки. Она видит то же, что и невидимая страница (первую порцию), но
 * человек в ней листает — поэтому её число бывает честнее. Правило то же самое: точное со
 * вкладки-фильтра сильнее, всё остальное идёт через applyOzonRowCount.
 *
 * ВАЖНО: это касается ТОЛЬКО отзывов (`rv`). Разделы «Сообщения» и «Вопросы» точного числа не
 * имеют (у них вкладка считает «не просмотрено», а не «без ответа» — см. TODO-63), поэтому их
 * значения пишутся напрямую, как и раньше.
 */
export function applyOzonSectionCount(cur, section, n) {
  if (section !== 'rv') {
    const c = cur || {}
    if (c[section] === n) return { next: null, changed: false, reason: 'kept' }
    return { next: { ...c, [section]: n }, changed: true, reason: 'first' }
  }
  return applyOzonRowCount(cur, n)
}
