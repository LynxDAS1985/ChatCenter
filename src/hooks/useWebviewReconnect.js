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
  isNetworkError, planAfterFail, planTrying, planAfterRetryFail, dueIds, nextWakeMs, bringAllForward,
  logFailLine, logSkipLine, logRetryFailLine, logRestoredLine, logManualLine, logNetLine,
  shouldAcceptLoaded, touchFailedAt, logEchoLine, messengerInfo,
} from '../../shared/reconnectPlan.js'

const log = (level, message) => { try { window.api?.send?.('app:log', { level, message }) } catch (_) {} }

export default function useWebviewReconnect(webviewRefs, messengersRef) {
  const [state, setState] = useState({})   // { [id]: { attempt, phase, dueAt, pauseMs, code, since } }
  const stRef = useRef(state)              // зеркало для таймера и обработчиков (как activeIdRef в App.jsx)
  const timerRef = useRef(null)
  useEffect(() => { stRef.current = state }, [state])

  const info = useCallback((id) => messengerInfo(messengersRef.current, id), [messengersRef])

  // Одна попытка: зовём loadURL и по его обещанию решаем — снять экран или ждать дальше.
  const attempt = useCallback((id) => {
    const { name, url } = info(id)
    const el = webviewRefs.current?.[id]
    const now = Date.now()
    if (!el || typeof el.loadURL !== 'function' || !url) {
      // Страницы ещё нет в окне (или адрес пуст) — не теряем запись, попробуем позже.
      setState(prev => (prev[id] ? { ...prev, [id]: planAfterRetryFail(prev[id], { code: prev[id].code, url, now }) } : prev))
      return
    }
    // 🔴 v1.2.453 (находка ревью): помечаем «идёт попытка» СРАЗУ и в зеркале записей.
    // Экран перерисовывает setState, но он применяется не мгновенно, а события страницы
    // (в том числе отчёт её страницы-ошибки) могут прийти раньше — и обработчик «загрузилась»
    // увидел бы прежнюю фазу и снял экран. Зеркало stRef обработчики читают синхронно,
    // поэтому порядок перестаёт иметь значение. Нового хранилища не добавляем (stRef уже есть):
    // добавление хука в работающее приложение ломает горячую перезагрузку.
    const trying = planTrying(stRef.current[id], now)
    stRef.current = { ...stRef.current, [id]: trying }
    setState(prev => (prev[id] ? { ...prev, [id]: trying } : prev))
    el.loadURL(url).then(() => {
      const entry = stRef.current[id]
      log('INFO', logRestoredLine(name, entry, Date.now()))
      setState(prev => { const n = { ...prev }; delete n[id]; return n })
    }).catch((e) => {
      const code = (e && e.errno) || (stRef.current[id] && stRef.current[id].code) || 0
      setState(prev => {
        if (!prev[id]) return prev
        const next = planAfterRetryFail(prev[id], { code, url, now: Date.now() })
        log('WARN', logRetryFailLine(name, next))
        return { ...prev, [id]: next }
      })
    })
  }, [info, webviewRefs])

  // Страница упала. Повторяем ТОЛЬКО на сетевых кодах: перезагрузка стирает недописанное
  // сообщение, поэтому дёргать живую страницу «на всякий случай» нельзя.
  const onFail = useCallback((id, code) => {
    if (!id) return
    const { name, url } = info(id)
    if (!isNetworkError(code)) {
      if (Number(code) !== -3) log('INFO', logSkipLine(name, code)) // -3 = обычная отмена, не шумим
      return
    }
    setState(prev => {
      // Попытка уже идёт → вторую не плодим, но метку сбоя освежаем (см. touchFailedAt).
      if (prev[id] && prev[id].phase === 'trying') return { ...prev, [id]: touchFailedAt(prev[id], Date.now()) }
      const next = planAfterFail(prev[id] || null, { code, url, now: Date.now() })
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
    if (!shouldAcceptLoaded(entry, Date.now())) { log('TRACE', logEchoLine(info(id).name)); return }
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
    attempt(id)
  }, [attempt, info])

  return { offlineState: state, retryNow, bindReconnect }
}
