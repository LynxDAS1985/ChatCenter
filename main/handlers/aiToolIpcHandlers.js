// v0.97.0 (Phase 1 M1.9): IPC bridge для AI tool execution.
//
// Renderer вызывает `ai:agent:run` → main process запускает agent loop.
// Renderer слушает `ai:agent:step` для streaming UI updates.
// Renderer может вызвать `ai:agent:cancel` для остановки.
//
// Этот handler — оркестратор. Сам callProvider реализован в aiHandlers.js
// (renderer-side через main IPC) или внутри main-process.

import { ipcMain } from 'electron'
import { runAgentLoop } from '../ai/aiToolExecutor.js'
import { buildAgentContext } from '../ai/aiContextBuilder.js'
import { validateNotificationSource } from '../../src/shared/notificationSource.js'

// Регистр activeRuns — для возможности cancel.
const activeRuns = new Map()  // requestId → { abortController }

/**
 * Инициализация IPC handlers.
 *
 * @param {object} deps
 *   - getRegistry: () => ToolRegistry — функция получения current registry
 *   - getHandlerContext: () => object — context для tool handlers (store, dispatchUI, etc)
 *   - getCallProvider: () => function — callProvider функция для конкретного provider
 */
export function initAiToolIpcHandlers(deps) {
  const { getRegistry, getHandlerContext, getCallProvider } = deps || {}

  ipcMain.handle('ai:agent:run', async (event, params) => {
    const { requestId, source, provider, model, recentMessages, extraInstructions } = params || {}

    if (!requestId) return { ok: false, error: 'missing_requestId' }

    // Source validation
    const validation = validateNotificationSource(source)
    if (!validation.valid) {
      return { ok: false, error: 'invalid_source', details: validation.errors }
    }
    if (!provider) {
      return { ok: false, error: 'missing_provider' }
    }

    // Get dependencies
    const registry = getRegistry?.()
    if (!registry) return { ok: false, error: 'no_registry_available' }
    const handlerContext = getHandlerContext?.() || {}
    const callProvider = getCallProvider?.(provider, model)
    if (typeof callProvider !== 'function') {
      return { ok: false, error: `provider_not_available: ${provider}` }
    }

    // Build context
    let initialMessages
    try {
      const ctx = buildAgentContext({ source, recentMessages, extraInstructions })
      // System prompt по-разному передаётся в разные provider:
      //   - Anthropic: отдельный параметр `system` в API request
      //   - OpenAI / DeepSeek / ГигаЧат: первое messages с role='system'
      // Делегируем это callProvider.
      initialMessages = [
        { role: 'system', content: ctx.systemPrompt },
        ...ctx.messages,
      ]
    } catch (e) {
      return { ok: false, error: `context_build_failed: ${e?.message || e}` }
    }

    // Регистр для cancel
    const abortController = new AbortController()
    activeRuns.set(requestId, { abortController })

    try {
      // onStep callback — стримит прогресс в renderer
      const onStep = (step) => {
        try {
          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send('ai:agent:step', { requestId, step })
          }
        } catch (_) { /* renderer закрылся — silent */ }
      }

      const result = await runAgentLoop({
        source,
        provider,
        registry,
        callProvider,
        handlerContext,
        initialMessages,
        onStep,
      })

      return result
    } catch (e) {
      return { ok: false, error: `agent_loop_failed: ${e?.message || e}` }
    } finally {
      activeRuns.delete(requestId)
    }
  })

  ipcMain.on('ai:agent:cancel', (_event, params) => {
    const { requestId } = params || {}
    const run = activeRuns.get(requestId)
    if (run) {
      try { run.abortController.abort() } catch (_) {}
      activeRuns.delete(requestId)
    }
  })
}

/**
 * Внутренний API — для тестов / отладки.
 */
export const _internal = { activeRuns }
