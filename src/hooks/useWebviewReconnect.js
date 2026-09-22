// useWebviewReconnect.js — v1.2.445
//
// Автоматическое переподключение веб-мессенджеров после обрыва связи.
// Вычисления (паузы, коды ошибок, тексты записей) — в shared/reconnectPlan.js.
// Экран для пользователя — components/WebviewOfflineOverlay.jsx. План — .memory-bank/reconnect-plan.md.
//
// КАК РАБОТАЕТ: `bindReconnect(элемент, id)` вешает на страницу мессенджера свои слушатели
// «упало» / «загрузилось». Подключаемся ПРЯМО к элементу, а не через webviewSetup.js: тот файл
// стоит на своём потолке 605 строк, и добавить туда даже две строки нельзя (правило проекта —
// не поднимать потолок, а разделять файл; разделение webviewSetup — отдельная большая задача).
// Дальше по каждому мессенджеру ведём запись «сколько попыток, когда следующая» и в нужный
// момент зовём `loadURL(адрес)`: по доке Electron его обещание разрешается при загрузке и
// отклоняется при неудаче — это и есть надёжный признак «получилось / не вышло».
// Плюс слушаем стандартные события `online`/`offline` — по возврату сети пробуем сразу.
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  isNetworkError, planAfterFail, dueIds, nextWakeMs, bringAllForward,
  shouldAcceptLoaded, touchFailedAt, messengerInfo, PROBE_FAIL_CODE,
} from '../../shared/reconnectPlan.js'
import { logFailLine, logSkipLine, logRestoredLine, logManualLine, logNetLine, logEchoLine, shouldLogEcho, retryButtonLabel } from '../../shared/reconnectTexts.js'
import { createAttemptRunner } from '../../shared/reconnectAttempt.js' // v1.2.491
import { quickProbe } from '../../shared/webviewHealthProbe.js'          // v1.2.491
import { noteOutcome } from '../../shared/netRecoverySummary.js'         // v1.2.492: сводка «ожили сами / перезагружены»
import { netVerdict } from './useOpenPageWatch.js'                       // v1.2.491: вердикт пульса

const log = (level, message) => { try { window.api?.send?.('app:log', { level, message }) } catch (_) {} }

export default function useWebviewReconnect(webviewRefs, messengersRef) {
  const [state, setState] = useState({})   // { [id]: { attempt, phase, dueAt, pauseMs, code, since } }
  const stRef = useRef(state)              // зеркало для таймера и обработчиков (как activeIdRef в App.jsx)
  const timerRef = useRef(null)
  useEffect(() => { stRef.current = state }, [state])

  const info = useCallback((id) => messengerInfo(messengersRef.current, id), [messengersRef])

  // Одна попытка — в shared/reconnectAttempt.js (v1.2.491, вынос по правилу памяти «attempt() —
  // узлом связей, а не поднимать потолок»). Там же: «интернета нет → страницу не дёргаем» и «запись
  // от пробы → сначала спросить страницу, ожила ли сама». Вердикт пульса — window.__ccNetOnline
  // (ставит useOpenPageWatch по событию net:pulse из главного процесса).
  const attempt = useCallback((id) => createAttemptRunner({
    getEl: (i) => webviewRefs.current?.[i], info, stRef, setState, log, isNetOnline: netVerdict, quickProbe, onOutcome: noteOutcome,
  })(id), [info, webviewRefs])

  // Страница упала. Повторяем ТОЛЬКО на сетевых кодах: перезагрузка стирает недописанное
  // сообщение, поэтому дёргать живую страницу «на всякий случай» нельзя.
  // v1.2.491: третий параметр origin — 'probe', когда сюда пришёл присмотр за открытой страницей
  // (useOpenPageWatch); код PROBE_FAIL_CODE не сетевой, поэтому пропускаем его явно.
  const onFail = useCallback((id, code, origin) => {
    if (!id) return
    const { name, url } = info(id)
    if (!isNetworkError(code) && Number(code) !== PROBE_FAIL_CODE) {
      if (Number(code) !== -3) log('INFO', logSkipLine(name, code)) // -3 = обычная отмена, не шумим
      return
    }
    setState(prev => {
      // Попытка уже идёт → вторую не плодим, но метку сбоя освежаем (см. touchFailedAt).
      if (prev[id] && prev[id].phase === 'trying') return { ...prev, [id]: touchFailedAt(prev[id], Date.now()) }
      const next = planAfterFail(prev[id] || null, { code, url, now: Date.now(), netOnline: netVerdict(), origin })
      log('WARN', logFailLine(name, next))
      return { ...prev, [id]: next }
    })
  }, [info])

  // Страница поднялась — снимаем экран (сработает и когда мессенджер восстановился сам).
  // 🔴 Но верить событию можно не всегда: у страницы-ошибки Chromium оно тоже случается.
  // Когда верить, а когда нет — решает shouldAcceptLoaded в shared/reconnectPlan.js
  // (там же причины, найденные по живому журналу).
  const onOk = useCallback((id) => {
    const entry = stRef.current[id]
    if (!id || !entry) return
    if (!shouldAcceptLoaded(entry, Date.now())) { if (shouldLogEcho(entry)) log('TRACE', logEchoLine(info(id).name)); return }
    log('INFO', logRestoredLine(info(id).name, entry, Date.now()))
    setState(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [info])

  // Подключение к элементу страницы. Метка на самом элементе не даёт навесить слушатели
  // дважды при перерисовке (приём проекта: __ccVkPrimaryToastObserver и подобные).
  //
  // 🔴 ВАЖНО: слушатели регистрируем в ТОМ ЖЕ учёте, что webviewSetup — `el._chatcenterListeners`.
  // При удалении вкладки App.jsx проходит этот список и снимает подписки; мимо списка они
  // остались бы навсегда (утечка). Ровно это сторожит тест memoryLeaks.test.cjs.
  const bindReconnect = useCallback((el, id) => {
    if (!el || !id || el.__ccReconnectBound) return
    el.__ccReconnectBound = true
    try {
      const addListener = (type, fn) => { el.addEventListener(type, fn); if (Array.isArray(el._chatcenterListeners)) el._chatcenterListeners.push([type, fn]) }
      // isMainFrame — документированное поле события: у вложенных кадров (реклама, встроенные
      // окна внутри страницы) сбои случаются постоянно, и экран «Нет связи» на них поднимать НЕЛЬЗЯ.
      addListener('did-fail-load', (e) => { if (!e || e.isMainFrame !== false) onFail(id, e && e.errorCode) })
      addListener('did-finish-load', () => onOk(id))
    } catch (_) { el.__ccReconnectBound = false }
  }, [onFail, onOk])

  // Сеть пропала/появилась. По доке Electron «сеть есть» — только подсказка, поэтому она
  // лишь ускоряет ближайшую попытку; решает сама попытка загрузки.
  useEffect(() => {
    const onOffline = () => log('WARN', logNetLine(false, 0))
    const onOnline = () => {
      const { state: moved, moved: n } = bringAllForward(stRef.current, Date.now())
      log('INFO', logNetLine(true, n))
      if (n > 0) setState(moved)
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // Один таймер на всех: просыпаемся ровно к ближайшей попытке (а не тикаем каждую секунду).
  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    // v1.2.491: сколько мессенджеров ждёт — главному процессу: пока ждут, пульс интернета чаще (15 с).
    try { window.__ccReconnectWaiting = Object.keys(state).length; window.api?.send?.('net:pulse-waiting', { count: Object.keys(state).length }) } catch (_) {} // v1.2.493: число ждущих — и сводке
    const ms = nextWakeMs(state, Date.now())
    if (ms === null) return undefined
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      for (const id of dueIds(stRef.current, Date.now())) attempt(id)
    }, ms)
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
  }, [state, attempt])

  const retryNow = useCallback((id) => {
    log('INFO', logManualLine(info(id).name))
    try { window.api?.send?.('net:pulse-now', { reason: 'кнопка «' + retryButtonLabel(null, netVerdict()) + '»' }) } catch (_) {} // v1.2.491, надпись — v1.2.494
    attempt(id)
  }, [attempt, info])

  // v1.2.491: reportFail — вход для присмотра за открытой страницей; stateRef — её зеркало записей.
  return { offlineState: state, retryNow, bindReconnect, reportFail: onFail, stateRef: stRef }
}
