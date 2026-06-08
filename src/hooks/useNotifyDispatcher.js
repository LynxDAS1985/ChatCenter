// v0.96.0 (Phase 0 M0.2): Action Bus — централизованный диспетчер действий.
//
// React hook который хранит registry actions и маршрутизирует вызовы.
// Используется одинаково:
//   - юзером (клик в UI / уведомлении) → dispatch(actionId, source, args)
//   - AI (tool_call от LLM) → dispatch(actionId, source, args)
//
// Hook монтируется в КОРНЕВОМ App.jsx — всегда работает, не зависит от
// активной вкладки. Это решает cross-tab проблему (см. problems.md P-01).
//
// См. .memory-bank/ai-agent-plan/architecture.md (Уровень 2: Action Bus)

import { useRef, useCallback } from 'react'
import { sourceKey } from '../shared/notificationSource.js'

const DEBOUNCE_MS = 500
const MAX_HISTORY_SIZE = 100

/**
 * Создаёт диспетчер actions.
 * Hook возвращает { registerAction, unregisterAction, dispatch, list }.
 *
 * registerAction(actionId, handler):
 *   handler — async function (source, args) => { ok, result?, error? }
 *
 * dispatch(actionId, source, args):
 *   - Проверяет дубликаты (debounce 500ms по key)
 *   - Вызывает handler
 *   - Возвращает { ok, result?, error?, dropped? }
 *
 * @returns {object}
 */
export function useNotifyDispatcher() {
  const registryRef = useRef(new Map())
  const lastDispatchRef = useRef(new Map())

  const registerAction = useCallback((actionId, handler) => {
    if (!actionId || typeof actionId !== 'string') {
      console.warn('[NotifyDispatcher] registerAction: actionId must be a non-empty string')
      return
    }
    if (typeof handler !== 'function') {
      console.warn(`[NotifyDispatcher] registerAction: handler must be a function (actionId=${actionId})`)
      return
    }
    if (registryRef.current.has(actionId)) {
      console.warn(`[NotifyDispatcher] actionId already registered: ${actionId} (will be overwritten)`)
    }
    registryRef.current.set(actionId, handler)
  }, [])

  const unregisterAction = useCallback((actionId) => {
    registryRef.current.delete(actionId)
  }, [])

  const dispatch = useCallback(async (actionId, source, args) => {
    const handler = registryRef.current.get(actionId)
    if (!handler) {
      console.warn(`[NotifyDispatcher] unknown action: ${actionId}`)
      return { ok: false, error: 'unknown_action' }
    }

    // Debounce — защита от двойных кликов
    const key = `${actionId}|${sourceKey(source)}`
    const now = Date.now()
    const last = lastDispatchRef.current.get(key)
    if (last && (now - last) < DEBOUNCE_MS) {
      return { ok: false, dropped: 'debounce' }
    }
    lastDispatchRef.current.set(key, now)

    // Очистка старых записей в lastDispatch (защита от утечки памяти)
    if (lastDispatchRef.current.size > MAX_HISTORY_SIZE) {
      const oldEntries = Array.from(lastDispatchRef.current.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, MAX_HISTORY_SIZE / 2)
      for (const [k] of oldEntries) lastDispatchRef.current.delete(k)
    }

    try {
      const result = await handler(source, args)
      // handler может вернуть { ok, ... } или undefined → нормализуем
      if (result == null || typeof result !== 'object') {
        return { ok: true, result }
      }
      return result
    } catch (err) {
      console.error(`[NotifyDispatcher] handler error (actionId=${actionId})`, err)
      return { ok: false, error: err?.message || String(err) }
    }
  }, [])

  const list = useCallback(() => {
    return Array.from(registryRef.current.keys())
  }, [])

  return { registerAction, unregisterAction, dispatch, list }
}
