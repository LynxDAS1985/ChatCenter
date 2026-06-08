// v0.97.0 (Phase 1 M1.4): Anthropic Claude adapter для tool use.
//
// Конверсия between universal tool schemas (наш формат) и Anthropic API:
//   - toAnthropicTools(schemas) → массив для request.tools
//   - parseAnthropicToolUse(response) → массив tool_calls
//   - formatToolResult(toolUseId, result) → message для request.messages
//
// API doc: https://docs.anthropic.com/claude/docs/tool-use
// Endpoint: POST https://api.anthropic.com/v1/messages
// Header: anthropic-version: 2023-06-01

/**
 * Конвертировать tool schemas в Anthropic format.
 *
 * @param {Array<{id, description, inputSchema}>} schemas
 * @returns {Array<{name, description, input_schema}>}
 */
export function toAnthropicTools(schemas) {
  if (!Array.isArray(schemas)) return []
  return schemas.map(s => ({
    name: s.id,
    description: s.description || '',
    input_schema: s.inputSchema,
  }))
}

/**
 * Парсить response от Anthropic — извлечь tool_use blocks.
 *
 * @param {object} response — Anthropic API response
 * @returns {Array<{id, name, input}>}
 */
export function parseAnthropicToolUse(response) {
  if (!response || !Array.isArray(response.content)) return []
  return response.content
    .filter(b => b && b.type === 'tool_use')
    .map(b => ({
      id: b.id,
      name: b.name,
      input: b.input || {},
    }))
}

/**
 * Извлечь финальный текст AI (если есть, помимо tool_use).
 *
 * @param {object} response
 * @returns {string}
 */
export function parseAnthropicText(response) {
  if (!response || !Array.isArray(response.content)) return ''
  return response.content
    .filter(b => b && b.type === 'text')
    .map(b => b.text || '')
    .join('\n')
    .trim()
}

/**
 * Формат message для отправки tool_result обратно в Anthropic.
 *
 * @param {string} toolUseId
 * @param {object} result — handler result { ok, result?, error? }
 * @returns {object} — message для request.messages
 */
export function formatToolResult(toolUseId, result) {
  let content
  if (result?.ok) {
    content = JSON.stringify(result.result ?? {})
  } else {
    content = JSON.stringify({ error: result?.error || 'unknown_error' })
  }
  return {
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: toolUseId,
      content,
      // is_error флаг для AI чтобы понять что tool упал
      ...(result?.ok ? {} : { is_error: true }),
    }],
  }
}

/**
 * Получить stop_reason из response.
 *
 * @param {object} response
 * @returns {string} — 'end_turn' | 'tool_use' | 'max_tokens' | etc
 */
export function getStopReason(response) {
  return response?.stop_reason || 'unknown'
}
