import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeSystemDiagnostics } from '../utils/systemDiagnostics.js'
import {
  appendDiagnosticsReport,
  buildDiagnosticsSessionReport,
  clearDiagnosticsScreen,
  createInitialDiagnosticsSession,
  diagnosticsSessionToText,
  markDiagnosticsError,
  markDiagnosticsSaved,
  pauseDiagnosticsSession,
  resetDiagnosticsSession,
  resumeDiagnosticsSession,
  startDiagnosticsSession,
  stopDiagnosticsSession,
} from '../utils/diagnosticsSession.js'

const DIAGNOSTICS_TICK_MS = 3000

export default function useDiagnosticsSession({ getRuntimeContext, onRunDeepCheck }) {
  const [session, setSession] = useState(() => createInitialDiagnosticsSession())
  const sessionRef = useRef(session)
  const contextRef = useRef(getRuntimeContext)
  const deepCheckRef = useRef(onRunDeepCheck)

  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { contextRef.current = getRuntimeContext; deepCheckRef.current = onRunDeepCheck }, [getRuntimeContext, onRunDeepCheck])

  const saveReport = useCallback(async (sessionOverride) => {
    const current = sessionOverride || sessionRef.current
    const report = buildDiagnosticsSessionReport(current)
    const saved = await window.api?.invoke('app:diagnostics-save-report', report)
    if (saved?.ok) {
      setSession(prev => markDiagnosticsSaved(prev, saved.path))
      return saved
    }
    if (saved?.error) throw new Error(saved.error)
    throw new Error('diagnostics-save-report returned empty result')
  }, [])

  const refresh = useCallback(async (opts = {}) => {
    const current = sessionRef.current
    if (!current.active || current.paused) return null
    try {
      if ((opts.deep || current.deepWebview) && deepCheckRef.current) await Promise.resolve(deepCheckRef.current())
      const snapshot = await window.api?.invoke('app:diagnostics-snapshot')
      const report = analyzeSystemDiagnostics({ snapshot: snapshot || {}, runtimeContext: contextRef.current?.() || {} })
      setSession(prev => appendDiagnosticsReport(prev, report))
      return report
    } catch (e) {
      setSession(prev => markDiagnosticsError(prev, e))
      return null
    }
  }, [])

  useEffect(() => {
    if (!session.active || session.paused) return undefined
    refresh()
    const timer = setInterval(() => refresh(), DIAGNOSTICS_TICK_MS)
    return () => clearInterval(timer)
  }, [session.active, session.paused, refresh])

  const start = useCallback(() => setSession(prev => startDiagnosticsSession(prev)), [])
  const pause = useCallback(() => setSession(prev => pauseDiagnosticsSession(prev)), [])
  const resume = useCallback(() => setSession(prev => resumeDiagnosticsSession(prev)), [])
  const clear = useCallback(() => setSession(prev => clearDiagnosticsScreen(prev)), [])
  const close = useCallback(async () => {
    const current = sessionRef.current
    if (!current.active && !(current.events || []).length) {
      setSession(() => resetDiagnosticsSession())
      return
    }
    const closing = current.active ? stopDiagnosticsSession(current) : current
    setSession(closing)
    try {
      await saveReport(closing)
      setSession(() => resetDiagnosticsSession())
    } catch (e) {
      setSession(prev => markDiagnosticsError(prev, e))
    }
  }, [saveReport])

  const stop = useCallback(async () => {
    const stopped = stopDiagnosticsSession(sessionRef.current)
    setSession(stopped)
    try { await saveReport(stopped) } catch (e) { setSession(prev => markDiagnosticsError(prev, e)) }
  }, [saveReport])

  const save = useCallback(async () => {
    try { return await saveReport(sessionRef.current) } catch (e) { setSession(prev => markDiagnosticsError(prev, e)); return null }
  }, [saveReport])

  const copy = useCallback(async () => {
    const text = diagnosticsSessionToText(sessionRef.current)
    await navigator.clipboard.writeText(text)
    return text
  }, [])

  return { session, start, pause, resume, stop, save, copy, clear, close, refresh }
}
