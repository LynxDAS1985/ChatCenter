// v0.97.0 (Phase 1 M1.5): OpenAI / DeepSeek adapter для tool use.
//
// DeepSeek полностью OpenAI-compatible — тот же код.
// API doc: https://platform.openai.com/docs/guides/function-calling
// Endpoint: POST https://api.openai.com/v1/chat/completions
//          POST https://api.deepseek.com/v1/chat/completions

/**
 * Конвертировать tool schemas в OpenAI format.
 *
 * @param {Array<{id, description, inputSchema}>} schemas
 * @returns {Array<{type, function: {name, description, parameters, strict}}>}
 */
export function toOpenAITools(schemas) {
  if (!Array.isArray(schemas)) return []
  return schemas.map(s => ({
    type: 'function',
    function: {
      name: s.id,
      description: s.description || '',
      parameters: s.inputSchema,
      strict: true,
    },
  }))
}

/**
 * Парсить response от OpenAI / DeepSeek — извлечь tool_calls.
 *
 * @param {object} response
 * @returns {Array<{id, name, input}>}
 */
export function parseOpenAIToolCalls(response) {
  const message = response?.choices?.[0]?.message
  if (!message || !Array.isArray(message.tool_calls)) return []
  return message.tool_calls
    .filter(tc => tc && tc.type === 'function' && tc.function)
    .map(tc => {
      let input = {}
      try {
        input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {}
      } catch (_) { input = {} }
      return {
        id: tc.id,
        name: tc.function.name,
        input,
      }
    })
}

/**
 * Извлечь финальный текст AI.
 */
export function parseOpenAIText(response) {
  return response?.choices?.[0]?.message?.content || ''
}

/**
 * Формат message для tool_result обратно в OpenAI.
 *
 * @param {string} toolCallId
 * @param {object} result
 * @returns {object}
 */
export function formatToolResult(toolCallId, result) {
  let content
  if (result?.ok) {
    content = JSON.stringify(result.result ?? {})
  } else {
    content = JSON.stringify({ error: result?.error || 'unknown_error' })
  }
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content,
  }
}

/**
 * finish_reason из OpenAI.
 */
export function getFinishReason(response) {
  return response?.choices?.[0]?.finish_reason || 'unknown'
}
