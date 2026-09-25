// shared/ozonRecon.js — v1.2.502 — ВРЕМЕННАЯ РАЗВЕДКА страниц Ozon. УДАЛИТЬ после диагноза.
//
// ЗАЧЕМ (жалоба 2026-09-25). Счётчик «Отзывы» (⭐) показывает 5, а на самом деле новых 12 —
// правильное число появляется, только если ОТКРЫТЬ раздел. Журнал доказал разницу:
//   • невидимая фоновая страница «Отзывы» — 248 проверок подряд, ВСЕГДА `rows=6 novy=5`;
//   • открытая вкладка сразу после загрузки — тоже `rows=6`, а после того как человек полистал,
//     `rows=21 novy=11..13`.
// Значит Ozon рисует список порциями и дорисовывает остальное не сразу. Что именно запускает
// дорисовку — неизвестно, а гадать нельзя: от ответа зависит РАЗНОЕ лекарство.
//
// ТРИ ВЕРСИИ, которые эта разведка различает:
//   (1) дорисовку запускает ПРОКРУТКА    → после прокрутки строк станет заметно больше;
//   (2) дело в НЕВИДИМОМ окне (браузер экономит на том, чего никто не видит)
//                                        → прокрутка ничего не даст, лечится высотой окна;
//   (3) у Ozon есть ГОТОВОЕ число новых  → считать строки вообще не нужно, берём готовое.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, а не дописать в сторожа: main/preloads/hooks/ozon.hook.js занимает
// 298 строк из 300 — временной диагностике там не место, и резать работающий сторож ради неё
// нельзя. Скрипты для ЧУЖИХ страниц по правилу проекта живут в shared/ (ADR-044).
//
// БЕЗОПАСНОСТЬ. Разведка выполняется ОДИН раз на страницу за запуск программы. Она читает DOM и
// делает до трёх прокруток — обычное для человека действие, никаких запросов к серверам Ozon
// напрямую мы не шлём.

import { withTimeout } from './withTimeout.js' // общий «жди не дольше» — пятую копию не заводим

/** Сколько ждать после каждой прокрутки, чтобы Ozon успел дорисовать (мс). */
export const RECON_SETTLE_MS = 2000

/** Сколько раз прокручивать вниз. */
export const RECON_SCROLL_STEPS = 3

/** Предел на всю разведку: три шага ожидания плюс запас на медленную страницу (мс). */
export const RECON_TIMEOUT_MS = 25000

/**
 * Скрипт разведки — выполняется ВНУТРИ страницы Ozon через executeJavaScript и возвращает
 * обещание с простым объектом (Electron умеет отдавать результат обещания обратно в приложение —
 * официальная документация webContents.executeJavaScript).
 *
 * Что собирает:
 *   rows0        — сколько строк таблицы видно сейчас;
 *   innerH/docH  — высота окна и высота всего содержимого (есть ли что прокручивать);
 *   scroller     — кто именно прокручивается: сам документ или внутренняя область;
 *   texts        — до 40 коротких надписей ВНЕ таблицы: там живут фильтры, вкладки и,
 *                  возможно, готовое число новых («Новые 12») и кнопки страниц;
 *   afterScroll  — сколько строк стало после каждой из прокруток (главный ответ);
 *   docH2        — выросла ли высота содержимого (признак, что что-то догрузилось).
 */
export const OZON_RECON_SCRIPT = `(async function () {
  var out = { path: location.pathname, search: location.search || '' };
  function txt(el) { try { return (el.textContent || '').replace(/\\s+/g, ' ').trim(); } catch (_) { return ''; } }
  function countRows() { return document.querySelectorAll('tr, [role="row"]').length; }
  out.rows0 = countRows();
  out.innerH = window.innerHeight;
  out.docH = document.documentElement ? document.documentElement.scrollHeight : 0;
  out.total = document.querySelectorAll('*').length;

  // Кто прокручивается: страница Ozon часто держит список во ВНУТРЕННЕЙ области со своей
  // полосой прокрутки — тогда прокручивать окно бесполезно, надо двигать именно её.
  var scroller = null, best = 0;
  try {
    var boxes = document.querySelectorAll('div, main, section');
    for (var i = 0; i < boxes.length && i < 4000; i++) {
      var e = boxes[i];
      var over = e.scrollHeight - e.clientHeight;
      if (over <= 200 || e.clientHeight <= 200) continue;
      var ov = '';
      try { ov = getComputedStyle(e).overflowY; } catch (_) {}
      if (ov !== 'auto' && ov !== 'scroll') continue;
      if (over > best) { best = over; scroller = e; }
    }
  } catch (_) {}
  out.scroller = scroller
    ? (scroller.tagName + '.' + String(scroller.className || '').slice(0, 30) + ' запас=' + best)
    : 'нет — прокручивается сам документ';

  // Короткие надписи ВНЕ таблицы: фильтры, вкладки, счётчики, кнопки страниц.
  var texts = [], seen = {};
  try {
    var table = document.querySelector('table');
    var all = document.querySelectorAll('*');
    for (var k = 0; k < all.length && k < 6000 && texts.length < 40; k++) {
      var x = all[k];
      if (x.children && x.children.length) continue;
      if (table && table.contains(x)) continue;
      var t = txt(x);
      if (!t || t.length > 25 || seen[t]) continue;
      seen[t] = 1; texts.push(t);
    }
  } catch (_) {}
  out.texts = texts;

  // ГЛАВНАЯ ПРОВЕРКА: прокручиваем вниз и смотрим, дорисовывает ли Ozon строки.
  var steps = [];
  for (var s = 0; s < ${RECON_SCROLL_STEPS}; s++) {
    try {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      else window.scrollTo(0, document.documentElement.scrollHeight);
    } catch (_) {}
    await new Promise(function (r) { setTimeout(r, ${RECON_SETTLE_MS}); });
    steps.push(countRows());
  }
  out.afterScroll = steps;
  out.docH2 = document.documentElement ? document.documentElement.scrollHeight : 0;
  return out;
})()`

/**
 * Превратить ответ разведки в строки для журнала. Чистая функция — её и проверяет тест.
 * @param {object|null} res — то, что вернул OZON_RECON_SCRIPT
 * @returns {string[]} строки журнала (пустой массив, если ответа нет)
 */
export function formatOzonRecon(res) {
  if (!res || typeof res !== 'object') return ['[ozon-recon] разведка вернула пусто — страница не ответила']
  const after = Array.isArray(res.afterScroll) ? res.afterScroll : []
  const grew = after.length ? Math.max(...after) - Number(res.rows0 || 0) : 0
  const lines = [
    `[ozon-recon] ${res.path || '?'}${res.search || ''} строк=${res.rows0} элементов=${res.total}`
    + ` окно=${res.innerH} содержимое=${res.docH}→${res.docH2}`,
    `[ozon-recon] прокручиваем: ${res.scroller}`,
    `[ozon-recon] строк после прокруток: ${after.join(' → ') || '(не мерили)'} (было ${res.rows0}, прибавка ${grew})`,
    `[ozon-recon] ВЫВОД: ${verdict(grew, res)}`,
  ]
  if (Array.isArray(res.texts) && res.texts.length) {
    lines.push(`[ozon-recon] надписи вне таблицы: ${res.texts.join(' | ')}`)
  }
  return lines
}

/**
 * v1.2.502 ВРЕМЕННО. Один раз за запуск программы спросить у страницы, дорисовывает ли Ozon список
 * при прокрутке. Ответ пишется в журнал строками `[ozon-recon] …`.
 *
 * v1.2.504: перед разведкой ЖДЁМ, пока страница наполнится. Причина — прогон 2026-09-25: на странице
 * «Сообщения» разведка сработала через 3 с после загрузки и увидела 151 элемент и ноль строк, то есть
 * мерила пустоту. Порог 300 элементов — тот же, что у сторожа страницы (main/preloads/hooks/ozon.hook.js),
 * до него разметки ещё нет. Ждём до пяти попыток, дальше меряем как есть и честно пишем, что застали.
 *
 * v1.2.504: живёт в shared/, а не в src/utils/ozonBgWatcher.js — бюджет строк экранов (ADR-044).
 *
 * @param {object} el — фоновая страница (webview): нужны executeJavaScript и isConnected
 * @param {(level: string, message: string) => void} log
 * @param {() => void} [afterDone] — что сделать, когда разведка отчиталась (например, опросить вкладки)
 */
export function runOzonReconOnce(el, log, afterDone) {
  try {
    if (!el || el.__ccOzonReconDone || typeof el.executeJavaScript !== 'function') return
    el.__ccOzonReconDone = true
    const run = (attempt) => {
      if (!el.isConnected) return // страницу уже закрыли — разведывать нечего
      withTimeout(Promise.resolve(el.executeJavaScript(OZON_RECON_SCRIPT)), RECON_TIMEOUT_MS,
        () => new Error('разведка Ozon: страница не ответила'))
        .then((res) => {
          const empty = !res || Number(res.total || 0) < 300
          if (empty && attempt < 5) { setTimeout(() => run(attempt + 1), 3000); return } // страница ещё пустая
          formatOzonRecon(res).forEach(line => { try { log && log('INFO', line) } catch (_) {} })
          try { afterDone && afterDone() } catch (_) {}
        })
        .catch((e) => { try { log && log('WARN', '[ozon-recon] не удалась: ' + ((e && e.message) || e)) } catch (_) {} })
    }
    setTimeout(() => run(1), 3000)
  } catch (_) {}
}

/** Короткий вывод: какая из трёх версий подтвердилась. */
function verdict(grew, res) {
  if (grew > 0) return `прокрутка РАБОТАЕТ (+${grew} строк) → лечим тихой прокруткой фоновой страницы`
  const room = Number(res.docH || 0) - Number(res.innerH || 0)
  if (room <= 50) return 'прокручивать НЕЧЕГО — список уже весь на странице; смотреть надписи выше (готовое число / страницы)'
  return 'прокрутка НЕ помогла, хотя запас есть → дело в невидимом окне; лечим высотой окна'
}
