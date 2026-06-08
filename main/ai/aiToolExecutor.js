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

const DEFAULT_MAX_ITERATIONS = 10

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
    iterations++

    let response
    try {
      response = await callProvider({ messages, tools, provider })
    } catch (e) {
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
      // Permission: deny → error
      if (def.permission === 'deny') {
        audit.push({ toolUseId: tc.id, name: tc.name, result: { ok: false, error: 'permission_denied' } })
        return { id: tc.id, name: tc.name, result: { ok: false, error: 'permission_denied' } }
      }
      // Phase 1: confirm tier пока не реализован (UI confirmation в Phase 2).
      // Если AI пытается вызвать confirm-tool — возвращаем ошибку.
      if (def.permission === 'confirm') {
        audit.push({ toolUseId: tc.id, name: tc.name, result: { ok: false, error: 'confirm_not_implemented_in_phase1' } })
        return { id: tc.id, name: tc.name, result: { ok: false, error: 'confirm_not_implemented_in_phase1' } }
      }

      onStep?.({ type: 'tool_call', name: tc.name, input: tc.input })

      try {
        const result = await def.handler(source, tc.input, handlerContext)
        audit.push({ toolUseId: tc.id, name: tc.name, result })
        onStep?.({ type: 'tool_result', name: tc.name, result })
        return { id: tc.id, name: tc.name, result }
      } catch (e) {
        const errResult = { ok: false, error: e?.message || 'handler_threw' }
        audit.push({ toolUseId: tc.id, name: tc.name, result: errResult })
        return { id: tc.id, name: tc.name, result: errResult }
      }
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
