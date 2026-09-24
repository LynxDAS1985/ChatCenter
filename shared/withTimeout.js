// shared/withTimeout.js — v1.2.499
//
// «Жди не дольше N миллисекунд» — один помощник на весь проект.
//
// ЗАЧЕМ. Ожидание без предела — это не редкий случай, а повторяющаяся беда проекта: в v1.2.497
// экран «Подключаемся…» висел вечно именно из-за такого ожидания (разбор — mistakes/electron-core.md,
// «ранний выход… = механизм умирает молча» и соседняя запись про фазу «идёт»). Ревью нашло ещё два
// места с тем же изъяном: загрузка страницы и выполнение скрипта в WebContentsView
// (main/utils/webContentsViewManager.js) и отправка текста в ИИ-вкладку (shared/aiWebviewContext.js).
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ. Похожих обёрток в проекте уже было две (shared/reconnectAttempt.js и
// shared/webviewHealthProbe.js) — третью писать нельзя (правило «не плоди дубль»). Этот файл —
// общий; у него нет зависимостей, поэтому годится и главному процессу, и окну приложения.
//
// ЧЕГО ЭТОТ ПОМОЩНИК НЕ ДЕЛАЕТ. Он не останавливает саму работу: обещание, которое «повисло»,
// продолжает висеть (так устроен Promise.race). Он лишь возвращает управление ждущему. Если работу
// нужно ещё и прекратить (например, погасить загрузку страницы), это делает вызывающий — см.
// el.stop() в shared/reconnectAttempt.js.

/** Предупреждение в штатный журнал: из окна — через app:log, из главного процесса — как есть. */
function logWarn(message) {
  try {
    const api = globalThis.window && globalThis.window.api
    if (api && typeof api.send === 'function') { api.send('app:log', { level: 'WARN', message }); return }
  } catch (_) {}
  try { globalThis.process && globalThis.process.emitWarning && globalThis.process.emitWarning(message) } catch (_) {}
}

/** Предел таймеров Node/Chromium: больше этого числа setTimeout срабатывает НЕМЕДЛЕННО. */
export const MAX_TIMEOUT_MS = 2147483647

/** Запасной предел, если вызывающий передал мусор или ноль (лучше ждать 30 с, чем вечно). */
export const FALLBACK_TIMEOUT_MS = 30000

/**
 * Ждать обещание не дольше ms; иначе — отказ ошибкой из mkError().
 * Таймер гасится в любом случае (finally) — иначе он жил бы до конца срока даже после успеха.
 *
 * @param {Promise<any>} promise — чего ждём
 * @param {number} ms — предел в мс; мусор или ноль → запасной FALLBACK_TIMEOUT_MS, слишком большое
 *   число → ограничивается MAX_TIMEOUT_MS (иначе таймер сработал бы мгновенно)
 * @param {() => Error} mkError — какую ошибку бросить по истечении предела
 * @returns {Promise<any>}
 */
export function withTimeout(promise, ms, mkError) {
  // 🔴 ЛОВУШКИ, найденные ревью v1.2.499 (обе доказаны прогоном):
  //  • мусорный или нулевой предел ТИХО означал «жду вечно» — ровно та беда, ради которой помощник
  //    и написан. Теперь такой предел заменяется запасным (30 с) и пишется предупреждение;
  //  • предел больше 2 147 483 647 мс таймеры Node/Chromium урезают до 1 мс, то есть отказ
  //    приходил МГНОВЕННО. Теперь такой предел ограничивается сверху.
  let limit = Number(ms)
  if (!Number.isFinite(limit) || limit <= 0) {
    // Правило проекта: из общего кода пишем через штатный журнал (app:log), а не console.* —
    // console в окне приложения уходит только в средства разработчика, человек их не видит.
    // В главном процессе window нет, там работает второй путь (главный процесс сам ведёт журнал).
    logWarn('[withTimeout] негодный предел (' + ms + ') — беру запасной ' + FALLBACK_TIMEOUT_MS + ' мс')
    limit = FALLBACK_TIMEOUT_MS
  }
  if (limit > MAX_TIMEOUT_MS) limit = MAX_TIMEOUT_MS
  let timer = null
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      // если mkError сам упадёт, ждущий не получит управление НИКОГДА — подстраховываемся
      let err
      try { err = typeof mkError === 'function' ? mkError() : new Error('timeout') } catch (e) { err = e }
      reject(err instanceof Error ? err : new Error(String(err && err.message ? err.message : err || 'timeout')))
    }, limit)
  })
  return Promise.race([Promise.resolve(promise), guard])
    .finally(() => { if (timer) { clearTimeout(timer); timer = null } })
}

/**
 * Удобная обёртка для случая «не дождались — считаем неудачей, но не падаем».
 * Возвращает { ok: true, result } либо { ok: false, error, timedOut }.
 *
 * ЗАЧЕМ ОТДЕЛЬНО: в главном процессе такие вызовы почти всегда заканчиваются ответом вида
 * { ok, error } окну — без этой обёртки в каждом месте пришлось бы писать один и тот же try/catch.
 *
 * @param {Promise<any>} promise
 * @param {number} ms
 * @param {string} what — что именно ждали (попадёт в текст ошибки и в журнал вызывающего)
 */
export async function tryWithTimeout(promise, ms, what = 'операция') {
  try {
    // v1.2.500: секунды не округляем вниз до нуля — при пределе меньше секунды пишем миллисекунды.
    const human = Number(ms) >= 1000 ? Math.round(Number(ms) / 1000) + ' с' : Math.round(Number(ms)) + ' мс'
    const result = await withTimeout(promise, ms, () => Object.assign(
      new Error(what + ': нет ответа за ' + human), { ccTimeout: true },
    ))
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e), timedOut: !!(e && e.ccTimeout) }
  }
}
