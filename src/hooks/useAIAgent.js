// v0.99.0 (Phase 3 M3.2): useAIAgent hook — UI обёртка над main-side agent loop.
//
// Запускает агента через IPC ai:agent:run, слушает streaming через ai:agent:step,
// показывает confirmation modal для confirm-tier tools, возвращает финальный ответ.
//
// Использование (tool-режим — умный AI с действиями):
//   const { state, start, cancel, confirmStep, cancelStep } = useAIAgent()
//   await start({ source, provider, recentMessages })
//   state.isRunning / state.steps / state.finalAnswer / state.pendingConfirm
//
// v1.2.2: добавлен Bridge-режим (простой Q&A без tools, с auto-резервом + Ollama):
//   await start({ source, provider, recentMessages, useBridge: true, settings })
//   — отправит вопрос через AI Bridge с auto-chain. Нет tool calls, только текст.

import { useState, useEffect, useRef, useCallback } from 'react'
import { runAiAgentViaBridge } from '../utils/aiBridge/agentBridgeRunner.js'
import { formatAiAgentBridgeError } from '../utils/aiBridge/agentBridgeErrors.js'

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

    // v1.2.2: Bridge-режим — простой Q&A через AI Bridge с auto-резервом.
    // Не использует tool use (для умных действий — обычный режим).
    if (params?.useBridge) {
      try {
        const result = await runAiAgentViaBridge(params, requestId, setState)
        setState(s => ({
          ...s,
          isRunning: false,
          finalAnswer: result.ok ? result.text : null,
          error: result.ok ? null : formatAiAgentBridgeError(result),
        }))
      } catch (e) {
        setState(s => ({
          ...s,
          isRunning: false,
          error: e?.message || 'bridge_failed',
        }))
      }
      return
    }

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
    if (window.api?.send) {
      window.api.send('ai:agent:cancel', { requestId })
    }
    setState(s => ({ ...s, isRunning: false }))
    requestIdRef.current = null
  }, [])

  const confirmStep = useCallback((updatedArgs) => {
    const requestId = requestIdRef.current
    if (!requestId) return
    if (window.api?.send) {
      window.api.send('ai:agent:confirm-response', {
        requestId,
        confirmed: true,
        updatedArgs,
      })
    }
    setState(s => ({ ...s, pendingConfirm: null }))
  }, [])

  const cancelStep = useCallback(() => {
    const requestId = requestIdRef.current
    if (!requestId) return
    if (window.api?.send) {
      window.api.send('ai:agent:confirm-response', {
        requestId,
        confirmed: false,
      })
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
