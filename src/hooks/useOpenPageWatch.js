// src/hooks/useOpenPageWatch.js — v1.2.491
//
// Две обязанности, обе про «интернет пропал, пока чаты уже открыты»:
//   1. ПРИЁМ ПУЛЬСА. Главный процесс сам щупает интернет (main/handlers/netPulseHandlers.js) и по
//      переходу шлёт `net:pulse`. Здесь вердикт кладётся в window.__ccNetOnline и превращается в
//      СТАНДАРТНОЕ событие окна online/offline — так существующие слушатели (переподключение
//      веб-страниц в useWebviewReconnect, полоса «нет связи» у «Общего чата») оживают без переделки.
//      Зачем подмена: по документации Electron настоящие события online/offline приходят только при
//      физически выдернутом проводе; на машине пользователя за два обрыва они не пришли ни разу.
//   2. ПРИСМОТР ЗА ОТКРЫТОЙ СТРАНИЦЕЙ. Исход каждой «пробы здоровья» (fetch внутри страницы) идёт
//      сюда; правило — shared/openPageWatch.js: два провала подряд → передать механизму повторов
//      (при живом интернете — перезагрузка по лестнице; при мёртвом — экран «Нет интернета» без
//      перезагрузки, пока пульс не скажет «появился»).
// План и причины — .memory-bank/reconnect-plan.md, раздел 4e.
import { useEffect, useRef, useCallback } from 'react'
import { decideProbe, logWatchLine, logStuckLine, logNetDownLine, logRecoveredLine } from '../../shared/openPageWatch.js'
import { PROBE_FAIL_CODE, messengerInfo } from '../../shared/reconnectPlan.js'

const log = (level, message) => { try { window.api?.send?.('app:log', { level, message }) } catch (_) {} }

/** Вердикт пульса: true / false / null (ещё не знаем). */
export function netVerdict() {
  if (typeof window === 'undefined') return null
  return window.__ccNetOnline === false ? false : (window.__ccNetOnline === true ? true : null)
}

/** Пришёл пульс → запомнить и, если вердикт сменился, разослать окну стандартное событие. */
export function applyPulse(p) {
  if (!p || typeof p.online !== 'boolean') return
  const prev = netVerdict()
  window.__ccNetOnline = p.online
  if (prev === p.online) return
  log('INFO', '[net-pulse→окно] интернет ' + (p.online ? 'появился' : 'пропал') + (p.host ? ' (ответил ' + p.host + ')' : ''))
  try { window.dispatchEvent(new Event(p.online ? 'online' : 'offline')) } catch (_) {}
}

/** Проба прошла? outcome — то, что возвращает probeWebviewHealth: {result} | {error} | {timeout}. */
export function probeOk(outcome) {
  if (!outcome) return false
  if (outcome.timeout || outcome.error) return false
  return !(outcome.result && outcome.result.ok === false)
}

export default function useOpenPageWatch({ reportFail, offlineStateRef, messengersRef }) {
  const failsRef = useRef({}) // id → провалов подряд

  useEffect(() => {
    let off = null
    try { off = window.api?.on?.('net:pulse', applyPulse) } catch (_) {}
    // При старте спрашиваем текущее состояние — событие перехода могло уйти до того, как окно открылось.
    try { window.api?.invoke?.('net:pulse-state')?.then?.(applyPulse)?.catch?.(() => {}) } catch (_) {}
    return () => { if (typeof off === 'function') off() }
  }, [])

  const onProbeOutcome = useCallback((id, outcome) => {
    if (!id) return
    const ok = probeOk(outcome)
    const { name } = messengerInfo(messengersRef.current, id)
    const prevFails = failsRef.current[id] || 0
    const fails = ok ? 0 : prevFails + 1
    const verdict = decideProbe({ fails, ok, netOnline: netVerdict(), alreadyWatched: !!(offlineStateRef.current && offlineStateRef.current[id]) })
    failsRef.current[id] = fails
    if (verdict === 'clear' && prevFails > 0) log('INFO', logRecoveredLine(name, prevFails))
    else if (verdict === 'watch') log('WARN', logWatchLine(name, fails))
    else if (verdict === 'stuck') { log('WARN', logStuckLine(name)); reportFail(id, PROBE_FAIL_CODE, 'probe') }
    else if (verdict === 'net-down') { log('WARN', logNetDownLine(name)); reportFail(id, PROBE_FAIL_CODE, 'probe') }
  }, [reportFail, offlineStateRef, messengersRef])

  return { onProbeOutcome }
}
