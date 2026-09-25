// shared/ozonTabPoll.js — v1.2.505
//
// Опрос готового числа новых со вкладки страницы Ozon: когда спрашивать, чему верить и когда
// вернуться к прежнему подсчёту строк. Сам скрипт чтения и разбор ответа — в shared/ozonTabCount.js,
// правило «кто главнее» — в shared/ozonCountMerge.js.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. По образцу соседа shared/ozonBgFailWatch.js: решение живёт в общей папке
// и проверяется тестами, а в src/utils/ozonBgWatcher.js остаётся только обвязка. Плюс бюджет строк
// экранов (ADR-044): правка в renderer вывела бы общий счёт за планку.
//
// 🔴 ЧТО ПОЧИНЕНО В v1.2.505 ПО РЕВЬЮ (все три беды воспроизведены прогонами):
//  1. `exec()` вызывался БЕЗ защиты. У `<webview>` метод выполнения скрипта бросает СИНХРОННО, если
//     страница отвалилась («The WebView must be attached to the DOM…»), и ошибка улетала мимо всех
//     обработчиков прямо из таймера — каждые 30 секунд, без единой строки в журнале. Сосед
//     shared/ozonBgFailWatch.js это уже знал и оборачивал вызов; здесь забыли.
//  2. Уход страницы с раздела «Отзывы» (Ozon выкинул на вход, протухла сессия) НЕ сбрасывал признак
//     «есть точное число». Он оставался навсегда → подсчёт строк был заблокирован навсегда →
//     значок замирал до перезапуска программы.
//  3. Полный отказ молчал: запись «не читается три раза подряд» стояла под условием «раньше
//     находилось». Если вкладка не находилась С САМОГО НАЧАЛА — в журнале не было ни строки, и
//     отличить «Ozon поменял вид» от «код не запустился» было нечем.

import { OZON_TAB_COUNT_SCRIPT, TAB_COUNT_TIMEOUT_MS, pickOzonTabCount, pickOzonTabTotal, formatOzonTabs } from './ozonTabCount.js'
import { withTimeout } from './withTimeout.js'
import { ozonHereAlready } from './ozonSections.js'

/** Как часто переспрашивать у страницы готовое число (мс). Чтение подписей — работа на миллисекунды. */
export const TAB_POLL_MS = 30000

/** Сколько опросов подряд без числа терпим, прежде чем вернуться к подсчёту строк. */
export const TAB_MISS_LIMIT = 3

/**
 * Какой раздел открыт на этой странице: «Отзывы» (rv), «Вопросы» (qa) или чужой (null)?
 * 🔴 Путь разбираем общей `ozonHereAlready`, а не подстрокой: `/app/reviews` целиком входит в
 * `/app/reviews/questions`, и наивная проверка приняла бы «Вопросы» за «Отзывы» (ловушка v1.2.500).
 */
export function ozonTabSectionOf(url) {
  try {
    const path = new URL(String(url)).pathname
    if (ozonHereAlready(path, 'rv')) return 'rv'
    if (ozonHereAlready(path, 'q')) return 'qa'
    return null
  } catch (_) { return null }
}

/**
 * Создать опрос вкладок для одной фоновой страницы.
 *
 * @param {object} io
 * @param {(code: string) => Promise<any>} io.exec — выполнить скрипт в странице
 * @param {() => string} io.getUrl — адрес страницы сейчас
 * @param {() => boolean} io.isAlive — страница ещё на месте
 * @param {() => boolean} io.isOnline — есть ли интернет (без него спрашивать нечего)
 * @param {(n: number, section: 'rv'|'qa') => void} io.setCount — положить ТОЧНОЕ число в счётчик раздела
 * @param {(section: 'rv'|'qa') => void} io.onLost — точное число больше не читается (разрешить подсчёт строк заново)
 * @param {(total: number|null, section: 'rv'|'qa') => void} io.onTotal — сколько записей в разделе всего (вкладка «Все»)
 * @param {(level: string, message: string) => void} io.log
 * @returns {{ ask: () => void, start: () => void, stop: () => void, isExact: () => boolean }}
 */
export function createOzonTabPoll(io) {
  const { exec, getUrl, isAlive, isOnline, setCount, onLost, onTotal, log } = io || {}
  let exact = false      // получено ли точное число со страницы
  let lastSection = 'rv' // раздел, для которого это число было получено (нужен при его потере)
  let miss = 0           // сколько опросов подряд число не нашлось
  let told = false       // сообщали ли уже, что число не читается (чтобы не писать это каждые 30 с)
  let timer = null
  const said = {}        // что уже писали в журнал — чтобы опрос раз в 30 с не спамил

  const say = (key, level, message) => {
    if (said[key] === message) return
    said[key] = message
    try { log && log(level, message) } catch (_) {}
  }

  /** Число со страницы получить не удалось: копим промахи и, дойдя до предела, отдаём счёт обратно подсчёту строк. */
  const onMiss = (why) => {
    miss++
    if (miss < TAB_MISS_LIMIT) return
    if (exact) { forget(why); told = true; return }
    // Ревью v1.2.505: раньше этот случай молчал. Самый вероятный сценарий — Ozon поменял вид
    // страницы, и вкладка не находится С САМОГО НАЧАЛА: в журнале не было ни строки, и отличить
    // это от «код не запустился» было нечем.
    if (!told) {
      told = true
      say('never', 'WARN', '[ozon-tab] число со вкладки не читается ни разу (' + why + ') → счёт идёт по строкам, он занижен')
    }
  }

  const ask = () => {
    // Ревью v1.2.508: раньше при исчезновении страницы опрос просто останавливался, а признак «есть
    // точное число» оставался поднятым — и подсчёт строк был заблокирован до перезапуска программы
    // (значок замирал на старом числе). Теперь отпускаем счёт обратно.
    if (!isAlive || !isAlive()) { forget('страница исчезла'); stop(); return }
    if (typeof exec !== 'function') return
    if (isOnline && !isOnline()) return
    // Ревью v1.2.505: проверяем адрес ДО запроса. Раньше тяжёлый обход страницы выполнялся и на
    // «Вопросах», и на «Сообщениях» каждые 30 секунд, а результат выбрасывался.
    const url = getUrl ? getUrl() : ''
    const section = ozonTabSectionOf(url)
    if (!section) {
      // Страница ушла с раздела со вкладками (Ozon выкинул на вход, сессия протухла). Это тоже
      // промах — иначе признак «есть точное число» застревал навсегда и блокировал подсчёт строк.
      onMiss('страница не на разделе со вкладками: ' + url)
      return
    }
    let started
    // 🔴 Вызов обёрнут: executeJavaScript у отвалившейся страницы бросает СИНХРОННО, и без этого
    // ошибка улетала прямо из таймера мимо журнала (беда №1).
    try { started = Promise.resolve(exec(OZON_TAB_COUNT_SCRIPT)) } catch (e) {
      say('exec', 'WARN', '[ozon-tab] страница не приняла запрос: ' + ((e && e.message) || e))
      onMiss('страница не приняла запрос')
      return
    }
    withTimeout(started, TAB_COUNT_TIMEOUT_MS, () => new Error('опрос вкладок Ozon: страница не ответила'))
      .then((res) => {
        // v1.2.507: у вопросов заодно запоминаем, сколько их ВСЕГО — по этому числу видно, показывает
        // ли Ozon весь список или только первую порцию (тогда к «без ответа» на значке ставится «+»).
        try { onTotal && onTotal(pickOzonTabTotal(res), section) } catch (_) {}
        const got = pickOzonTabCount(res)
        if (!got) { onMiss(formatOzonTabs(res)); return }
        miss = 0
        exact = true
        told = false
        lastSection = section
        try { setCount && setCount(got.n, section) } catch (_) {}
        say('got', 'INFO', '[ozon-tab] ' + (section === 'qa' ? 'Вопросы' : 'Отзывы')
          + ': точное число со страницы «' + got.label + '» = ' + got.n)
      })
      .catch((e) => {
        say('err', 'WARN', '[ozon-tab] опрос не удался: ' + ((e && e.message) || e))
        onMiss('опрос не удался')
      })
  }

  function stop() { if (timer) { clearInterval(timer); timer = null } }

  /** Отпустить счёт обратно подсчёту строк: точного числа у нас больше нет. */
  function forget(why) {
    if (!exact) return
    exact = false
    try { onLost && onLost(lastSection) } catch (_) {}
    say('forget', 'WARN', '[ozon-tab] точное число со страницы больше не читается (' + why + ') → счёт идёт по строкам')
  }

  return {
    ask,
    isExact: () => exact,
    /** Запустить повторяющийся опрос (идемпотентно — второй таймер не заводим). */
    start: () => { if (!timer) timer = setInterval(ask, TAB_POLL_MS) },
    stop,
  }
}
