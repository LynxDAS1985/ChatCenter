// v0.99.0 (Phase 3 M3.2): useAIAgent hook — UI обёртка над main-side agent loop.
//
// Запускает агента через IPC ai:agent:run, слушает streaming через ai:agent:step,
// показывает confirmation modal для confirm-tier tools, возвращает финальный ответ.
//
// Использование:
//   const { state, start, cancel, confirmStep, cancelStep } = useAIAgent()
//   await start({ source, provider, recentMessages })
//   state.isRunning / state.steps / state.finalAnswer / state.pendingConfirm

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * @returns {{
 *   state: object,
 *   start: (params) => Promise<void>,
 *   cancel: () => void,
 *   confirmStep: (updatedArgs?: object) => void,
 *   cancelStep: () => void,
 * }}
 */
export default function useAIAgent() {
  const [state, setState] = useState({
    isRunning: false,
    requestId: null,
    steps: [],          // [{ type, name?, input?, result?, iteration? }]
    finalAnswer: null,
    error: null,
    pendingConfirm: null, // { toolId, source, args, resolve } — ожидается решение юзера
  })

  const requestIdRef = useRef(null)
  const confirmResolveRef = useRef(null)

  // Слушатель streaming событий
  useEffect(() => {
    if (!window.api?.on) return undefined
    const unsub = window.api.on('ai:agent:step', ({ requestId, step }) => {
      if (requestId !== requestIdRef.current) return
      setState(s => ({
        ...s,
        steps: [...s.steps, step],
      }))
    })
    return unsub
  }, [])

  // Слушатель запроса подтверждения (main → renderer)
  useEffect(() => {
    if (!window.api?.on) return undefined
    const unsub = window.api.on('ai:agent:confirm-request', ({ requestId, ...payload }) => {
      if (requestId !== requestIdRef.current) return
      setState(s => ({
        ...s,
        pendingConfirm: { ...payload },
      }))
    })
    return unsub
  }, [])

  const start = useCallback(async (params) => {
    if (!window.api?.invoke) {
      setState(s => ({ ...s, error: 'no_ipc' }))
      return
    }
    const requestId = `ai_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    requestIdRef.current = requestId

    setState({
      isRunning: true,
      requestId,
      steps: [],
      finalAnswer: null,
      error: null,
      pendingConfirm: null,
    })

    try {
      const result = await window.api.invoke('ai:agent:run', {
        ...params,
        requestId,
      })

      setState(s => ({
        ...s,
        isRunning: false,
        finalAnswer: result?.finalAnswer || null,
        error: result?.ok ? null : (result?.error || 'unknown_error'),
      }))
    } catch (e) {
      setState(s => ({
        ...s,
        isRunning: false,
        error: e?.message || 'invoke_failed',
      }))
    }
  }, [])

  const cancel = useCallback(() => {
    const requestId = requestIdRef.current
    if (!requestId) return
    if (window.api?.invoke) {
      window.api.invoke('ai:agent:cancel', { requestId }).catch(() => {})
    }
    setState(s => ({ ...s, isRunning: false }))
    requestIdRef.current = null
  }, [])

  const confirmStep = useCallback((updatedArgs) => {
    const requestId = requestIdRef.current
    if (!requestId) return
    if (window.api?.invoke) {
      window.api.invoke('ai:agent:confirm-response', {
        requestId,
        confirmed: true,
        updatedArgs,
      }).catch(() => {})
    }
    setState(s => ({ ...s, pendingConfirm: null }))
  }, [])

  const cancelStep = useCallback(() => {
    const requestId = requestIdRef.current
    if (!requestId) return
    if (window.api?.invoke) {
      window.api.invoke('ai:agent:confirm-response', {
        requestId,
        confirmed: false,
      }).catch(() => {})
    }
    setState(s => ({ ...s, pendingConfirm: null }))
  }, [])

  const reset = useCallback(() => {
    requestIdRef.current = null
    setState({
      isRunning: false,
      requestId: null,
      steps: [],
      finalAnswer: null,
      error: null,
      pendingConfirm: null,
    })
  }, [])

  return { state, start, cancel, confirmStep, cancelStep, reset }
}
