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

/**
 * Ждать обещание не дольше ms; иначе — отказ ошибкой из mkError().
 * Таймер гасится в любом случае (finally) — иначе он жил бы до конца срока даже после успеха.
 *
 * @param {Promise<any>} promise — чего ждём
 * @param {number} ms — предел в миллисекундах; всё, что ≤ 0 или не число, считается «предела нет»
 * @param {() => Error} mkError — какую ошибку бросить по истечении предела
 * @returns {Promise<any>}
 */
export function withTimeout(promise, ms, mkError) {
  const limit = Number(ms)
  if (!Number.isFinite(limit) || limit <= 0) return Promise.resolve(promise)
  let timer = null
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(typeof mkError === 'function' ? mkError() : new Error('timeout')), limit)
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
    const result = await withTimeout(promise, ms, () => Object.assign(
      new Error(what + ': нет ответа за ' + Math.round(Number(ms) / 1000) + ' с'), { ccTimeout: true },
    ))
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e), timedOut: !!(e && e.ccTimeout) }
  }
}
