// v0.97.0 (Phase 1 M1.7): aiToolExecutor — main-side agent loop.
//
// Принимает source + provider + context, делает запрос к LLM, парсит tool_use,
// исполняет tools через registry, возвращает результат AI и продолжает loop пока:
//   - AI вернёт final answer (нет tool_use в response)
//   - Не превышен maxIterations
//   - Не возникла ошибка
//
// Этот модуль ДОМЕНный — не подключается к UI напрямую. Renderer вызывает
// через IPC bridge (см. aiToolIpcHandlers.js).
//
// См. .memory-bank/ai-agent-plan/architecture.md (Tool Use flow)

import * as anthropic from './adapters/anthropicAdapter.js'
import * as openai from './adapters/openaiAdapter.js'
import * as gigachat from './adapters/gigachatAdapter.js'
import { checkPermission } from './aiPermissionGuard.js'

const DEFAULT_MAX_ITERATIONS = 10
// v1.0.4: defaults для AI стабильности.
const DEFAULT_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000  // 5 минут — если юзер не реагирует, auto-deny
const DEFAULT_READ_RETRY_COUNT = 1  // read-only tools — 1 ретрай при throw (read-only безопасно ретраить)

/**
 * Сводный список adapters по provider id.
 */
const ADAPTERS = {
  anthropic: {
    toTools: anthropic.toAnthropicTools,
    parseToolCalls: anthropic.parseAnthropicToolUse,
    parseText: anthropic.parseAnthropicText,
    formatToolResult: anthropic.formatToolResult,
    stopReason: anthropic.getStopReason,
    // stop_reason === 'tool_use' → continue loop
    shouldContinue: (r) => anthropic.getStopReason(r) === 'tool_use',
  },
  openai: {
    toTools: openai.toOpenAITools,
    parseToolCalls: openai.parseOpenAIToolCalls,
    parseText: openai.parseOpenAIText,
    formatToolResult: openai.formatToolResult,
    stopReason: openai.getFinishReason,
    shouldContinue: (r) => openai.getFinishReason(r) === 'tool_calls',
  },
  deepseek: {
    // DeepSeek OpenAI-compatible — те же функции
    toTools: openai.toOpenAITools,
    parseToolCalls: openai.parseOpenAIToolCalls,
    parseText: openai.parseOpenAIText,
    formatToolResult: openai.formatToolResult,
    stopReason: openai.getFinishReason,
    shouldContinue: (r) => openai.getFinishReason(r) === 'tool_calls',
  },
  gigachat: {
    toTools: gigachat.toGigaChatFunctions,
    parseToolCalls: gigachat.parseGigaChatFunctionCall,
    parseText: gigachat.parseGigaChatText,
    // ГигаЧат formatFunctionResult требует name — обёртка ниже
    formatToolResult: null,
    stopReason: gigachat.getFinishReason,
    shouldContinue: (r) => gigachat.getFinishReason(r) === 'function_call',
  },
}

/**
 * Получить adapter для provider. Возвращает null если provider неизвестен.
 */
export function getAdapter(provider) {
  return ADAPTERS[provider] || null
}

/**
 * Главный agent loop.
 *
 * @param {object} params
 *   - source: NotificationSource — паспорт сообщения
 *   - provider: 'anthropic' | 'openai' | 'deepseek' | 'gigachat'
 *   - registry: ToolRegistry — реестр доступных tools
 *   - callProvider: async function ({ messages, tools, model }) → response
 *     — функция вызова API провайдера (renderer side / main side)
 *   - handlerContext: object — context для tool handlers (store, dispatchUI, etc)
 *   - initialMessages: array — стартовые сообщения (system + user)
 *   - maxIterations: number — лимит итераций (default 10)
 *   - onStep: (step) => void — callback для streaming UI updates (опционально)
 * @returns {Promise<{ok, finalAnswer?, error?, iterations, audit}>}
 */
export async function runAgentLoop(params) {
  const {
    source,
    provider,
    registry,
    callProvider,
    handlerContext,
    initialMessages,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    onStep,
    // v1.0.4: новые опции
    signal,  // AbortSignal — если aborted, выходим из цикла
    confirmTimeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS,
    readRetryCount = DEFAULT_READ_RETRY_COUNT,
  } = params

  if (!provider) return { ok: false, error: 'missing_provider', iterations: 0 }
  if (!registry) return { ok: false, error: 'missing_registry', iterations: 0 }
  if (typeof callProvider !== 'function') {
    return { ok: false, error: 'missing_callProvider', iterations: 0 }
  }

  const adapter = getAdapter(provider)
  if (!adapter) return { ok: false, error: `unknown_provider: ${provider}`, iterations: 0 }

  const schemas = registry.schemas()
  const tools = adapter.toTools(schemas)
  const audit = []

  // Копируем messages чтобы не мутировать оригинал
  const messages = Array.isArray(initialMessages) ? [...initialMessages] : []
  let iterations = 0

  while (iterations < maxIterations) {
    // v1.0.4: проверка abort signal на каждой итерации
    if (signal?.aborted) {
      return { ok: false, error: 'aborted', iterations, audit }
    }
    iterations++

    let response
    try {
      response = await callProvider({ messages, tools, provider, signal })
    } catch (e) {
      // v1.0.4: AbortError — отдельный кейс (не path → выходим тихо)
      if (e?.name === 'AbortError' || signal?.aborted) {
        return { ok: false, error: 'aborted', iterations, audit }
      }
      return { ok: false, error: `provider_call_failed: ${e?.message || e}`, iterations, audit }
    }

    onStep?.({ type: 'response', iteration: iterations, response })

    const toolCalls = adapter.parseToolCalls(response)
    if (toolCalls.length === 0) {
      // Финальный ответ — нет tool_use
      const finalAnswer = adapter.parseText(response)
      return { ok: true, finalAnswer, iterations, audit }
    }

    // Сохранить assistant message (с tool_use) — для multi-turn
    if (provider === 'anthropic' && response.content) {
      messages.push({ role: 'assistant', content: response.content })
    } else if (response?.choices?.[0]?.message) {
      messages.push(response.choices[0].message)
    }

    // Исполнить tool_calls — параллельно
    const results = await Promise.all(toolCalls.map(async (tc) => {
      const def = registry.lookup(tc.name)
      if (!def) {
        audit.push({ toolUseId: tc.id, name: tc.name, result: { ok: false, error: 'unknown_tool' } })
        return { id: tc.id, name: tc.name, result: { ok: false, error: 'unknown_tool' } }
      }
      // v0.98.0 (Phase 2): Permission Guard вместо def.permission.
      // Учитывает hardcoded confirm/deny + user overrides + scope (только native_*).
      const userSettings = params.userSettings || {}
      const permCheck = checkPermission(tc.name, source, tc.input, userSettings)
      if (!permCheck.allowed) {
        const err = { ok: false, error: 'permission_denied', reason: permCheck.reason }
        audit.push({ toolUseId: tc.id, name: tc.name, result: err, permissionResult: 'denied' })
        return { id: tc.id, name: tc.name, result: err }
      }
      if (permCheck.requiresConfirm) {
        // Phase 2: запрос подтверждения у юзера через onConfirmRequest callback.
        if (typeof params.onConfirmRequest === 'function') {
          // v1.0.4: confirm timeout — auto-deny если юзер не среагировал за N мс.
          // Защита от зависшего агента (юзер ушёл, модалка висит — loop держит ресурсы).
          const confirmResult = await runWithTimeout(
            () => params.onConfirmRequest({
              toolId: tc.name,
              source,
              args: tc.input,
              tier: permCheck.tier,
              signal,
            }),
            confirmTimeoutMs,
            'confirm_timeout',
            signal,
          )
          if (!confirmResult || !confirmResult.confirmed) {
            const reason = confirmResult?.error === 'confirm_timeout' ? 'confirm_timeout' : 'denied_by_user'
            const err = { ok: false, error: reason }
            audit.push({ toolUseId: tc.id, name: tc.name, result: err, permissionResult: reason })
            return { id: tc.id, name: tc.name, result: err }
          }
          // Юзер мог отредактировать args (например текст ответа)
          if (confirmResult.updatedArgs) {
            tc.input = confirmResult.updatedArgs
          }
        } else {
          const err = { ok: false, error: 'confirm_required_no_handler' }
          audit.push({ toolUseId: tc.id, name: tc.name, result: err, permissionResult: 'no_handler' })
          return { id: tc.id, name: tc.name, result: err }
        }
      }

      onStep?.({ type: 'tool_call', name: tc.name, input: tc.input })

      // v1.0.4: re-try только для read-only tools (idempotent). Write tools
      // (reply/markAsRead) НЕ ретраить — риск дубля сообщения / повторной отметки.
      const isRetryable = def.category === 'reading' && readRetryCount > 0
      const maxAttempts = isRetryable ? 1 + readRetryCount : 1
      let result, lastErr
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal?.aborted) {
          result = { ok: false, error: 'aborted' }
          break
        }
        try {
          result = await def.handler(source, tc.input, handlerContext)
          if (result?.ok || !isRetryable) break  // успех или не retry-able → выходим
          lastErr = result
        } catch (e) {
          lastErr = { ok: false, error: e?.message || 'handler_threw' }
          if (attempt === maxAttempts) result = lastErr
        }
      }
      if (!result) result = lastErr || { ok: false, error: 'unknown_handler_failure' }
      audit.push({ toolUseId: tc.id, name: tc.name, result, attempts: maxAttempts })
      onStep?.({ type: 'tool_result', name: tc.name, result })
      return { id: tc.id, name: tc.name, result }
    }))

    // Сформировать tool_result messages для AI
    if (provider === 'anthropic') {
      // Anthropic — один user message с массивом tool_result
      const toolResultContent = results.map(r => {
        const formatted = adapter.formatToolResult(r.id, r.result)
        return formatted.content[0]  // вытащить tool_result block
      })
      messages.push({ role: 'user', content: toolResultContent })
    } else if (provider === 'gigachat') {
      // ГигаЧат — один function message за раз (нет parallel)
      for (const r of results) {
        messages.push(gigachat.formatFunctionResult(r.id, r.name, r.result))
      }
    } else {
      // OpenAI / DeepSeek — отдельный tool message per call
      for (const r of results) {
        messages.push(adapter.formatToolResult(r.id, r.result))
      }
    }
  }

  return { ok: false, error: 'max_iterations_reached', iterations, audit }
}

/**
 * v1.0.4: Promise.race с таймаутом + поддержкой AbortSignal.
 * @returns {Promise} либо результат fnPromise(), либо `{confirmed: false, error: timeoutError}`.
 */
async function runWithTimeout(fn, timeoutMs, timeoutError, signal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    // Без timeout — обычный await
    try { return await fn() } catch (e) { return { confirmed: false, error: e?.message || 'threw' } }
  }
  let timer
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ confirmed: false, error: timeoutError }), timeoutMs)
  })
  const abortPromise = signal
    ? new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ confirmed: false, error: 'aborted' }), { once: true })
      })
    : null
  const racers = [
    Promise.resolve()
      .then(() => fn())
      .catch((e) => ({ confirmed: false, error: e?.message || 'threw' })),
    timeoutPromise,
  ]
  if (abortPromise) racers.push(abortPromise)
  try {
    return await Promise.race(racers)
  } finally {
    clearTimeout(timer)
  }
}

export const _internal = { runWithTimeout, DEFAULT_CONFIRM_TIMEOUT_MS, DEFAULT_READ_RETRY_COUNT }
