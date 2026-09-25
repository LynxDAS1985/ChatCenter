// shared/ozonTabPoll.js — v1.2.504
//
// Опрос готового числа новых со вкладки страницы Ozon: когда спрашивать, чему верить и когда
// вернуться к прежнему подсчёту строк. Сам скрипт чтения и разбор ответа — в shared/ozonTabCount.js.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. Во-первых, по образцу соседа shared/ozonBgFailWatch.js: решение живёт в
// общей папке и проверяется тестами, а в src/utils/ozonBgWatcher.js остаётся только обвязка.
// Во-вторых, из-за бюджета строк экранов (ADR-044): правка в renderer вывела бы общий счёт за
// планку, а поднимать планку вместо разгрузки в этом проекте нельзя.
//
// ЗАЧЕМ ВООБЩЕ. Счётчик «Отзывы» показывал 5 при 13 новых: считались строки, которые Ozon успел
// нарисовать, а список отдаётся порциями (внизу «Показать ещё») — невидимую страницу никто не
// листает. Разбор: features.md v1.2.502-504.

import { OZON_TAB_COUNT_SCRIPT, TAB_COUNT_TIMEOUT_MS, pickOzonTabCount, formatOzonTabs } from './ozonTabCount.js'
import { withTimeout } from './withTimeout.js'
import { ozonHereAlready } from './ozonSections.js'

/** Как часто переспрашивать у страницы готовое число (мс). Чтение подписей — работа на миллисекунды. */
export const TAB_POLL_MS = 30000

/** Сколько опросов подряд без числа терпим, прежде чем вернуться к подсчёту строк. */
export const TAB_MISS_LIMIT = 3

/**
 * Это страница «Отзывы»?
 * 🔴 Путь разбираем общей `ozonHereAlready`, а не подстрокой: `/app/reviews` целиком входит в
 * `/app/reviews/questions`, и наивная проверка приняла бы «Вопросы» за «Отзывы» (ловушка v1.2.500).
 */
export function isOzonReviewsPage(url) {
  try { return ozonHereAlready(new URL(String(url)).pathname, 'rv') } catch (_) { return false }
}

/**
 * Создать опрос вкладок для одной фоновой страницы.
 *
 * @param {object} io
 * @param {(code: string) => Promise<any>} io.exec — выполнить скрипт в странице
 * @param {() => string} io.getUrl — адрес страницы сейчас
 * @param {() => boolean} io.isAlive — страница ещё на месте
 * @param {() => boolean} io.isOnline — есть ли интернет (без него спрашивать нечего)
 * @param {(n: number) => void} io.setCount — положить точное число в счётчик «Отзывы»
 * @param {(level: string, message: string) => void} io.log
 * @returns {{ ask: () => void, isExact: () => boolean, stop: () => void }}
 *   `isExact()` — есть ли точное число; пока оно есть, подсчёту строк верить не надо.
 */
export function createOzonTabPoll(io) {
  const { exec, getUrl, isAlive, isOnline, setCount, log } = io || {}
  let exact = false      // получено ли точное число со страницы
  let miss = 0           // сколько опросов подряд число не нашлось
  let timer = null
  const said = {}        // что уже писали в журнал — чтобы опрос раз в 30 с не спамил

  const say = (key, level, message) => {
    if (said[key] === message) return
    said[key] = message
    try { log && log(level, message) } catch (_) {}
  }

  const ask = () => {
    if (!isAlive || !isAlive()) { stop(); return }
    if (typeof exec !== 'function') return
    if (isOnline && !isOnline()) return
    withTimeout(Promise.resolve(exec(OZON_TAB_COUNT_SCRIPT)), TAB_COUNT_TIMEOUT_MS,
      () => new Error('опрос вкладок Ozon: страница не ответила'))
      .then((res) => {
        const url = getUrl ? getUrl() : ''
        if (!isOzonReviewsPage(url)) {
          // Другие разделы: число в счётчик НЕ ставим. У «Вопросов» вкладка «Новое» означает
          // «не просмотрено», а значок показывает «без ответа» — это разные вещи, подменять нельзя.
          // В журнал пишем, чтобы решение по ним принималось по фактам, а не на глаз.
          say('other', 'INFO', '[ozon-tab] ' + ((res && res.path) || url) + ': ' + formatOzonTabs(res))
          return
        }
        const got = pickOzonTabCount(res)
        if (!got) {
          miss++
          if (exact && miss >= TAB_MISS_LIMIT) {
            exact = false // вёрстка Ozon изменилась → возвращаемся к подсчёту строк (хуже, но не молчим)
            say('lost', 'WARN', '[ozon-tab] число со вкладки не читается ' + miss + ' раза подряд → снова считаем строки: ' + formatOzonTabs(res))
          }
          return
        }
        miss = 0
        exact = true
        try { setCount && setCount(got.n) } catch (_) {}
        say('got', 'INFO', '[ozon-tab] точное число со страницы: «' + got.label + '» = ' + got.n + ' → ⭐')
      })
      .catch((e) => { say('err', 'WARN', '[ozon-tab] опрос не удался: ' + ((e && e.message) || e)) })
  }

  function stop() { if (timer) { clearInterval(timer); timer = null } }

  return {
    ask,
    isExact: () => exact,
    /** Запустить повторяющийся опрос (идемпотентно — второй таймер не заводим). */
    start: () => { if (!timer) timer = setInterval(ask, TAB_POLL_MS) },
    stop,
  }
}
