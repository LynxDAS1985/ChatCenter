// v0.97.0 (Phase 1 M1.6): ГигаЧат (Сбер) adapter для function calling.
//
// ГигаЧат использует СТАРЫЙ OpenAI format (functions, не tools).
// API doc: https://developers.sber.ru/docs/ru/gigachat/api/function-calling
//
// ВАЖНО: streaming для function_call НЕстабилен. Tool use доступен только
// в non-streaming режиме (см. .memory-bank/ai-agent-plan/providers.md).

/**
 * Конвертировать schemas в ГигаЧат functions format.
 *
 * @param {Array<{id, description, inputSchema}>} schemas
 * @returns {Array<{name, description, parameters}>}
 */
export function toGigaChatFunctions(schemas) {
  if (!Array.isArray(schemas)) return []
  return schemas.map(s => ({
    name: s.id,
    description: s.description || '',
    parameters: s.inputSchema,
  }))
}

/**
 * Парсить response от ГигаЧат — извлечь function_call.
 * ГигаЧат возвращает максимум ОДИН function_call за раз (не parallel как OpenAI).
 *
 * @param {object} response
 * @returns {Array<{id, name, input}>}
 */
export function parseGigaChatFunctionCall(response) {
  const message = response?.choices?.[0]?.message
  if (!message) return []

  const fc = message.function_call
  if (!fc || !fc.name) return []

  let input = {}
  try {
    input = fc.arguments ? JSON.parse(fc.arguments) : {}
  } catch (_) { input = {} }

  // ГигаЧат не возвращает id — генерируем свой
  const id = `gc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return [{ id, name: fc.name, input }]
}

/**
 * Извлечь финальный текст.
 */
export function parseGigaChatText(response) {
  return response?.choices?.[0]?.message?.content || ''
}

/**
 * Формат для tool_result обратно в ГигаЧат.
 * ГигаЧат использует role='function' (старый OpenAI).
 *
 * @param {string} _functionId — игнорируется (ГигаЧат не использует id)
 * @param {string} functionName
 * @param {object} result
 * @returns {object}
 */
export function formatFunctionResult(_functionId, functionName, result) {
  let content
  if (result?.ok) {
    content = JSON.stringify(result.result ?? {})
  } else {
    content = JSON.stringify({ error: result?.error || 'unknown_error' })
  }
  return {
    role: 'function',
    name: functionName,
    content,
  }
}

export function getFinishReason(response) {
  return response?.choices?.[0]?.finish_reason || 'unknown'
}
