// shared/reconnectAttempt.js — v1.2.491
//
// ОДНА ПОПЫТКА поднять страницу мессенджера — вынесена из src/hooks/useWebviewReconnect.js
// (тот стоял 149/170; память проекта велела при следующем росте выносить именно attempt()
// «узлом связей», а не поднимать потолок). Здесь нет React: все связи приходят параметрами,
// поэтому попытка проверяется тестами с поддельной страницей.
//
// ЧТО РЕШАЕТ ПОПЫТКА (в этом порядке):
//   1. страницы ещё нет в окне / адрес пуст → ждём дальше (запись не теряем);
//   2. 🔴 интернета НЕТ (по пульсу) → страницу НЕ ДЁРГАЕМ: перезагрузка бессмысленна и стирает
//      недописанное сообщение; ждём следующий пульс (он придёт «появился» → попытка сразу);
//   3. запись родилась от ПРОБЫ (открытая страница перестала отвечать) → сначала спрашиваем саму
//      страницу коротким запросом: ожила сама (мессенджеры умеют переподключаться внутри) →
//      снимаем экран БЕЗ перезагрузки; не ожила → перезагружаем;
//   4. обычный обрыв загрузки → loadURL; по документации Electron его обещание разрешается при
//      загрузке и отклоняется при неудаче — единственный надёжный признак «получилось».
//
// ЛОВУШКА v1.2.453 сохранена: фаза «идёт попытка» пишется в зеркало записей СИНХРОННО до loadURL,
// иначе отчёт страницы-ошибки успевает снять экран раньше, чем мы узнаем о неудаче.
import { planTrying, planAfterRetryFail, ATTEMPT_TIMEOUT_MS, ATTEMPT_TIMEOUT_CODE } from './reconnectPlan.js'
import { logRestoredLine, logRetryFailLine, logNetDownSkipLine, logSelfHealedLine, logAttemptStartLine, logAttemptTimeoutLine } from './reconnectTexts.js'

/**
 * v1.2.497: ждать ответа страницы не дольше предела. Без этого запись навсегда застревала в фазе
 * «идёт», из которой закрыты все выходы (см. ATTEMPT_TIMEOUT_MS в reconnectPlan.js).
 * Таймер гасится в любом случае (finally) — иначе он бы жил до конца срока после успеха.
 */
function raceWithTimeout(promise, ms, mkError) {
  let timer = null
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(mkError()), ms) })
  return Promise.race([promise, guard]).finally(() => { if (timer) { clearTimeout(timer); timer = null } })
}

/**
 * @param {object} d
 * @param {(id:string) => object|null} d.getEl — элемент страницы мессенджера
 * @param {(id:string) => {name:string,url:string}} d.info — имя и адрес
 * @param {{current:object}} d.stRef — зеркало записей (читается синхронно)
 * @param {(fn:Function) => void} d.setState — обновление состояния React
 * @param {(level:string, message:string) => void} d.log — журнал
 * @param {() => boolean|null} d.isNetOnline — вердикт пульса (null = неизвестно → считаем, что есть)
 * @param {(el:object) => Promise<boolean>} [d.quickProbe] — «страница отвечает?» для записей от пробы
 * @param {() => number} [d.now]
 * @param {(id:string, result:string) => void} [d.onOutcome] — исход каждой попытки (v1.2.492: сводка возврата сети)
 * @param {number} [d.attemptTimeoutMs] — предел ожидания ответа страницы (v1.2.497; параметром — чтобы тест
 *   проверял поведение за миллисекунды, а не подменял часы всему окружению)
 */
export function createAttemptRunner({ getEl, info, stRef, setState, log, isNetOnline, quickProbe, now = () => Date.now(), onOutcome, attemptTimeoutMs = ATTEMPT_TIMEOUT_MS }) {
  const clear = (id) => setState(prev => { if (!prev[id]) return prev; const n = { ...prev }; delete n[id]; return n })
  const postpone = (id, code, url) => setState(prev => (prev[id] ? { ...prev, [id]: planAfterRetryFail(prev[id], { code, url, now: now(), netOnline: isNetOnline() }) } : prev))

  async function run(id) {
    const { name, url } = info(id)
    const el = getEl(id)
    const entry = stRef.current[id]
    if (!el || typeof el.loadURL !== 'function' || !url) { postpone(id, (entry && entry.code) || 0, url); return 'no-element' }

    // 2. Интернета нет — не дёргаем. Пульс «появился» двинет попытку на «сейчас» сам.
    if (isNetOnline() === false) {
      log('INFO', logNetDownSkipLine(name))
      postpone(id, (entry && entry.code) || 0, url)
      return 'net-down'
    }

    const trying = planTrying(entry, now())
    stRef.current = { ...stRef.current, [id]: trying }
    setState(prev => (prev[id] ? { ...prev, [id]: trying } : prev))

    // 3. Запись от пробы: спросить страницу, не ожила ли она сама.
    if (trying.origin === 'probe' && typeof quickProbe === 'function') {
      let alive = false
      try { alive = await quickProbe(el) } catch (_) { alive = false }
      if (alive) { log('INFO', logSelfHealedLine(name, trying, now())); clear(id); return 'self-healed' }
    }

    // 4. Перезагрузка (не дольше предела ожидания — v1.2.497).
    log('INFO', logAttemptStartLine(name, trying))
    try {
      await raceWithTimeout(el.loadURL(url), attemptTimeoutMs,
        () => Object.assign(new Error('attempt timeout'), { errno: ATTEMPT_TIMEOUT_CODE, ccTimeout: true }))
      log('INFO', logRestoredLine(name, stRef.current[id], now()))
      clear(id)
      return 'restored'
    } catch (e) {
      const timedOut = !!(e && e.ccTimeout) // v1.2.497: страница не ответила за ATTEMPT_TIMEOUT_MS
      const code = (e && e.errno) || (stRef.current[id] && stRef.current[id].code) || 0
      setState(prev => {
        if (!prev[id]) return prev
        const next = planAfterRetryFail(prev[id], { code, url, now: now(), netOnline: isNetOnline() })
        log('WARN', timedOut ? logAttemptTimeoutLine(name, next) : logRetryFailLine(name, next))
        return { ...prev, [id]: next }
      })
      return 'failed'
    }
  }
  return async function attempt(id) {
    const result = await run(id)
    try { if (typeof onOutcome === 'function') onOutcome(id, result) } catch (_) {}
    return result
  }
}
