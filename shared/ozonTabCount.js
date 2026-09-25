// shared/ozonTabCount.js — v1.2.504
//
// ГОТОВОЕ ЧИСЛО НОВЫХ, которое Ozon САМ печатает на странице, вместо подсчёта строк таблицы.
//
// ЗАЧЕМ. Счётчик «Отзывы» показывал 5, когда новых 13. Разбор (features.md v1.2.502-504):
// программа считала строки, которые Ozon успел нарисовать, а список он отдаёт ПОРЦИЯМИ — внизу
// кнопка «Показать ещё». Невидимую фоновую страницу никто не листает, поэтому она навсегда
// оставалась на первой порции: 248 проверок подряд ровно 6 строк.
//
// РАЗВЕДКА 2026-09-25 (v1.2.502) нашла путь лучше любого листания: на странице «Отзывы» стоят
// вкладки-фильтры со СВОИМИ счётчиками — «Все · Новые 13 · Просмотренные · Обработанные».
// Число 13 сошлось трижды: надпись на странице = подсчёт открытой вкладки = то, что человек
// видел на значке. Значит его можно просто читать — без прокрутки, без нажатий, мгновенно.
//
// ПОЧЕМУ ЭТОТ КОД НЕ В СТОРОЖЕ (main/preloads/hooks/ozon.hook.js): сторож занимает 299 строк из
// 300, а разбить его нельзя — он впрыскивается в чужую страницу одним куском, и механизма склейки
// частей в проекте пока нет (TODO-64). Поэтому опрос живёт отдельно и выполняется тем же способом,
// что и разведка: скрипт отправляется в страницу из src/utils/ozonBgWatcher.js. Сторож не тронут,
// уведомления Ozon не задеты вовсе.
//
// ТОЛЬКО ЧТЕНИЕ: скрипт ничего не нажимает и не прокручивает — читает подписи вкладок.

/** Подписи вкладок-фильтров Ozon, которые нас интересуют (разделы «Отзывы» и «Вопросы»). */
const TAB_LABELS = 'Все|Новые|Новое|Новый|Просмотренные|Просмотрено|Обработанные|Обработано|Ждут ответа|Без ответа'

/** Сколько ждать ответа страницы (мс). Чтение подписей — работа на миллисекунды, но страница может быть занята. */
export const TAB_COUNT_TIMEOUT_MS = 10000

/**
 * Скрипт, читающий подписи вкладок ВНУТРИ страницы Ozon. Возвращает
 * `{ path, tabs: [{ label, raw }] }`, где raw — текст числа рядом с подписью («13», «999+») либо null.
 *
 * Как ищет: находит листья с текстом ровно как подпись вкладки, затем поднимается до трёх уровней
 * вверх, пока не встретит элемент с текстом «подпись + число» — это и есть сама вкладка со счётчиком.
 * Число берётся ТОЛЬКО из такой пары, поэтому чужие числа со страницы сюда попасть не могут.
 */
export const OZON_TAB_COUNT_SCRIPT = `(function () {
  var out = { path: location.pathname, tabs: [] };
  try {
    var re = new RegExp('^(' + ${JSON.stringify(TAB_LABELS)} + ')$', 'i');
    function txt(el) { try { return (el.textContent || '').replace(/\\s+/g, ' ').trim(); } catch (_) { return ''; } }
    var all = document.querySelectorAll('*');
    var seen = {};
    for (var i = 0; i < all.length && i < 6000 && out.tabs.length < 20; i++) {
      var leaf = all[i];
      if (leaf.children && leaf.children.length) continue;
      var label = txt(leaf);
      if (!label || !re.test(label) || seen[label.toLowerCase()]) continue;
      seen[label.toLowerCase()] = 1;
      var raw = null, p = leaf;
      for (var up = 0; up < 3 && p; up++) {
        var t = txt(p);
        if (t.length > 40) break;
        var m = t.match(/^(.+?)\\s*(\\d[\\d\\s]*\\+?)$/);
        if (m && m[1].replace(/\\s+$/, '') === label) { raw = m[2].replace(/\\s+/g, ''); break; }
        p = p.parentElement;
      }
      out.tabs.push({ label: label, raw: raw });
    }
  } catch (e) { out.error = (e && e.message) || String(e); }
  return out;
})()`

/**
 * Сколько НОВЫХ записей в разделе — по подписям вкладок.
 *
 * 🔴 ГЛАВНАЯ ЛОВУШКА, ради которой написана эта функция: Ozon НЕ рисует счётчик у вкладки, когда
 * он равен нулю. Поэтому «подпись есть, числа нет» означает либо честный ноль, либо что счётчиков
 * на странице вообще не видно (другая вёрстка, страница не догрузилась). Различаем так: ноль
 * засчитываем ТОЛЬКО когда хотя бы у одной другой вкладки число нашлось — значит счётчики тут
 * рисуются. Иначе возвращаем null = «не знаю», и вызывающий остаётся на старом подсчёте строк.
 *
 * @param {{tabs?: Array<{label: string, raw: string|null}>}|null} res — ответ OZON_TAB_COUNT_SCRIPT
 * @returns {{ n: number, label: string }|null} null = число со страницы получить не удалось
 */
export function pickOzonTabCount(res) {
  const tabs = res && Array.isArray(res.tabs) ? res.tabs : null
  if (!tabs || !tabs.length) return null
  const parse = (raw) => {
    if (typeof raw !== 'string' || !raw) return null
    const n = parseInt(raw.replace(/\D+/g, ''), 10)
    return Number.isFinite(n) ? n : null
  }
  const anyNumber = tabs.some(t => parse(t && t.raw) !== null)
  const hit = tabs.find(t => t && typeof t.label === 'string' && /^Новы/i.test(t.label))
  if (!hit) return null
  const n = parse(hit.raw)
  if (n !== null) return { n, label: hit.label }
  return anyNumber ? { n: 0, label: hit.label } : null
}

/** Короткая строка для журнала: что именно прочитали со страницы. */
export function formatOzonTabs(res) {
  const tabs = res && Array.isArray(res.tabs) ? res.tabs : []
  if (!tabs.length) return 'вкладок не нашлось'
  return tabs.map(t => t.label + '=' + (t.raw === null ? '—' : t.raw)).join(' | ')
}
