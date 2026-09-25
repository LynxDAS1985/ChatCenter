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
export const RV_SRC = { TAB: 'tab', REBASE: 'rebase', ROWS: 'rows', FRONT: 'front' }

/**
 * Пришло ТОЧНОЕ число со вкладки страницы. Всегда побеждает — и вверх, и вниз.
 * @param {object} cur — текущее состояние счётчиков одного Ozon-аккаунта ({ msg, qa, rv, rvSrc })
 * @param {number} n
 * @returns {{ next: object|null, changed: boolean }} next=null → менять нечего
 */
export function applyOzonExact(cur, n, section = 'rv') {
  const c = cur || {}
  const v = toCount(n)
  if (v === null) return { next: null, changed: false }
  // v1.2.507: у ВОПРОСОВ точное число со вкладки («Новое» — сколько не открывали) на значок больше
  // не идёт. Значок показывает «без ответа», а это число хранится рядом и видно в подсказке.
  if (section === 'qa') {
    if (c.qaNew === v) return { next: null, changed: false }
    return { next: { ...c, qaNew: v }, changed: false }
  }
  const src = section === 'qa' ? 'qaSrc' : 'rvSrc'
  if (c[section] === v && c[src] === RV_SRC.TAB) return { next: null, changed: false }
  return { next: { ...c, [section]: v, [src]: RV_SRC.TAB }, changed: c[section] !== v }
}

/**
 * Точное число со страницы прочитать больше не удаётся (Ozon поменял вид, ушли с раздела).
 * Само значение НЕ трогаем — просто разрешаем следующему подсчёту строк задать его заново.
 */
export function clearOzonExact(cur) {
  const c = cur || {}
  // Ревью v1.2.508: раньше функция принимала раздел, но для вопросов ветка была МЁРТВОЙ — пометку
  // «точное число со вкладки» им никто не ставит (их значок ведёт «без ответа»). Оставлен один
  // раздел — отзывы, чтобы комментарий не описывал несуществующее поведение.
  if (c.rvSrc !== RV_SRC.TAB) return { next: null, changed: false }
  return { next: { ...c, rvSrc: RV_SRC.REBASE }, changed: false }
}

/**
 * Пришло число из ПОДСЧЁТА СТРОК (сторож страницы). Что с ним делать — зависит от того, ведём ли
 * мы счёт по точному числу.
 * @returns {{ next: object|null, changed: boolean, reason: 'ignored'|'rebase'|'up'|'kept'|'first' }}
 *   reason нужен вызывающему, чтобы написать в журнал ПОНЯТНУЮ причину, а не «что-то произошло».
 */
export function applyOzonRowCount(cur, n, fromFront = false) {
  const c = cur || {}
  const v = toCount(n)
  if (v === null) return { next: null, changed: false, reason: 'ignored' }
  if (c.rvSrc === RV_SRC.TAB) return { next: null, changed: false, reason: 'ignored' }
  // 🔴 Ревью v1.2.508 (регресс ADR-038 / фикса v1.2.388): правило «только вверх» писалось против
  // НЕВИДИМОЙ фоновой страницы, которая держит старый снимок и видит лишь первую порцию. К ОТКРЫТОЙ
  // вкладке оно применяться не должно: человек листает её сам, и её число — самое свежее, какое есть.
  // Пока этого различия не было, звезда после прочтения отзывов не гасла вовсе (воспроизведено).
  if (fromFront) {
    if (c.rv === v && c.rvSrc === RV_SRC.FRONT) return { next: null, changed: false, reason: 'kept' }
    return { next: { ...c, rv: v, rvSrc: RV_SRC.FRONT }, changed: c.rv !== v, reason: 'front' }
  }
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
 * Число из подсчёта строк для раздела «Вопросы».
 *
 * v1.2.506: у вопросов ТОЖЕ появилось точное число со страницы — вкладка «Новое». Но смысл у
 * этих двух чисел РАЗНЫЙ, и оба нужны:
 *   • вкладка «Новое» = сколько вопросов человек ещё не открывал. Это и показывает значок;
 *   • подсчёт строк   = сколько вопросов БЕЗ ОТВЕТА среди видимых (Ozon такого счётчика не даёт).
 * На значке — «без ответа» (v1.2.507), а число со вкладки «Новое» хранится отдельно и видно
 * в подсказке при наведении.
 */
export function applyOzonQaCount(cur, n, fromFront = false) {
  const c = cur || {}
  const v = toCount(n)
  if (v === null) return { next: null, changed: false, reason: 'ignored' }
  // v1.2.507: на значке «Вопросы» именно ЭТО число — сколько без ответа. Число со вкладки «Новое»
  // (сколько не открывали) точное, но в работе бесполезно: отвечать надо на неотвеченные.
  // 🔴 Ревью v1.2.508: у открытой вкладки ПРИОРИТЕТ. Иначе значок скакал: человек нажал «Показать
  // ещё» и видит 9 без ответа, а невидимая страница через пять секунд пишет свои 4 (первая порция).
  if (fromFront) {
    if (c.qa === v && c.qaSrc === RV_SRC.FRONT) return { next: null, changed: false, reason: 'kept' }
    return { next: { ...c, qa: v, qaSrc: RV_SRC.FRONT }, changed: c.qa !== v, reason: 'front' }
  }
  if (c.qaSrc === RV_SRC.FRONT && v < (c.qa || 0)) return { next: null, changed: false, reason: 'kept' }
  if (c.qa === v) return { next: null, changed: false, reason: 'kept' }
  return { next: { ...c, qa: v, qaSrc: RV_SRC.ROWS }, changed: true, reason: 'first' }
}

/**
 * Число из ОТКРЫТОЙ вкладки. Она видит то же, что и невидимая страница (первую порцию), но
 * человек в ней листает — поэтому её число бывает честнее. Правило то же самое: точное со
 * вкладки-фильтра сильнее, всё остальное идёт через подсчёт строк.
 *
 * ВАЖНО: «Сообщения» (`msg`) точного числа не имеют — это переписка с покупателями, вкладок со
 * счётчиками там нет вовсе. Их значение пишется напрямую, как и раньше.
 */
export function applyOzonSectionCount(cur, section, n, fromFront = false) {
  if (section === 'rv') return applyOzonRowCount(cur, n, fromFront)
  if (section === 'qa') return applyOzonQaCount(cur, n, fromFront)
  const c = cur || {}
  // Ревью v1.2.508: «Сообщения» тоже через строгую проверку — иначе мусор от сторожа (строка «3»,
  // NaN) попадал прямо в состояние, в отличие от соседних веток.
  const v = toCount(n)
  if (v === null || c[section] === v) return { next: null, changed: false, reason: 'kept' }
  return { next: { ...c, [section]: v }, changed: true, reason: 'first' }
}

/** Сколько вопросов в разделе ВСЕГО (вкладка «Все»). Нужно, чтобы понять, видим ли мы список целиком. */
export function applyOzonQaTotal(cur, total) {
  const c = cur || {}
  const v = toCount(total)
  // Ревью v1.2.508: раньше `null` (Ozon перестал печатать «Все») просто игнорировался, и устаревшее
  // «999» жило вечно — значок показывал «+» даже когда список уже виден целиком. Теперь забываем.
  if (v === null) return c.qaTotal === undefined ? { next: null, changed: false } : { next: { ...c, qaTotal: undefined }, changed: false }
  if (c.qaTotal === v) return { next: null, changed: false }
  return { next: { ...c, qaTotal: v }, changed: false }
}
