// v0.97.0 (Phase 1 M1.2): JSON Schema каждого tool.
//
// Single source of truth для structured tool definitions.
// Используется:
//   - AI provider adapters (Anthropic / OpenAI / DeepSeek / ГигаЧат) — для tools param
//   - Tool Registry — для validation tool_call inputs
//   - UI — для генерации hint/help текстов
//
// JSON Schema 2020-12 спецификация.
// Совместимо с tool_use API всех провайдеров.

/**
 * NotificationSource — общий $ref schema. Используется во всех tools которые
 * принимают source как input.
 */
export const notificationSourceSchema = {
  type: 'object',
  description: 'Паспорт сообщения — однозначно адресует сообщение в системе',
  required: ['messengerId', 'accountId', 'chatId', 'messageId'],
  properties: {
    messengerId: { type: 'string', description: 'Идентификатор мессенджера (например "native_cc")' },
    accountId:   { type: 'string', description: 'TDLib account id (например "tg_611696632")' },
    chatId:      { type: 'string', description: 'TDLib chat id' },
    messageId:   { type: 'string', description: 'TDLib message id' },
    threadId:    { type: ['string', 'null'], description: 'Forum topic id (если применимо)' },
    senderId:    { type: 'string', description: 'ID отправителя' },
    senderName:  { type: 'string', description: 'Имя отправителя' },
    chatTitle:   { type: 'string', description: 'Название чата' },
    timestamp:   { type: 'number', description: 'Unix ms момента отправки' },
    textPreview: { type: 'string', description: 'Первые 200 символов текста' },
  },
}

// ──────────────────────────────────────────────────────────────────────────
// Tool schemas (Phase 1 — только read-only)
// ──────────────────────────────────────────────────────────────────────────

/**
 * goto_message — переход к сообщению в UI.
 * Permission: auto (безопасно — просто навигация).
 */
export const gotoMessageSchema = {
  id: 'goto_message',
  description: 'Открыть конкретное сообщение в чате с прокруткой и подсветкой',
  category: 'navigation',
  permission: 'auto',
  revertable: false,
  inputSchema: {
    type: 'object',
    required: ['source'],
    properties: {
      source: notificationSourceSchema,
    },
    additionalProperties: false,
  },
}

/**
 * get_chat_history — прочитать последние N сообщений чата.
 * Permission: auto (read-only).
 */
export const getChatHistorySchema = {
  id: 'get_chat_history',
  description: 'Получить последние N сообщений из чата для анализа контекста',
  category: 'reading',
  permission: 'auto',
  revertable: false,
  inputSchema: {
    type: 'object',
    required: ['chatId'],
    properties: {
      chatId: { type: 'string', description: 'TDLib chat id в формате "accountId:rawChatId"' },
      limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      beforeMessageId: { type: 'string', description: 'Для пагинации — id сообщения до которого читать' },
    },
    additionalProperties: false,
  },
}

/**
 * search_messages — поиск сообщений по тексту.
 * Permission: auto (read-only).
 */
export const searchMessagesSchema = {
  id: 'search_messages',
  description: 'Поиск сообщений по тексту',
  category: 'reading',
  permission: 'auto',
  revertable: false,
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query:     { type: 'string', minLength: 2, description: 'Текст для поиска' },
      chatId:    { type: 'string', description: 'Если не указан — глобальный поиск' },
      accountId: { type: 'string', description: 'TDLib account id (для глобального поиска внутри аккаунта)' },
      limit:     { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      // v1.0.6: тип медиа.
      filter: {
        type: 'string',
        enum: ['empty', 'photo', 'video', 'photo-video', 'document', 'audio', 'voice', 'video-note', 'url', 'mention', 'pinned', 'unread-mention'],
        description: 'Фильтр по типу медиа (default: empty = все)',
      },
      // v1.0.6: пагинация.
      fromMessageId: {
        type: 'string',
        description: 'ID сообщения для продолжения с того места (next_from_message_id из предыдущего ответа)',
      },
      // v1.0.6: fan-out на все аккаунты.
      fanOut: {
        type: 'boolean',
        description: 'Если true и chatId/accountId не указаны — искать по ВСЕМ аккаунтам параллельно',
      },
    },
    additionalProperties: false,
  },
}

// ──────────────────────────────────────────────────────────────────────────
// Список всех Phase 1 schemas
// ──────────────────────────────────────────────────────────────────────────

export const PHASE_1_SCHEMAS = [
  gotoMessageSchema,
  getChatHistorySchema,
  searchMessagesSchema,
]

/**
 * Проверить что schema валидна (структурно, не JSON Schema validation).
 */
export function validateToolSchema(s) {
  const errors = []
  if (!s.id || typeof s.id !== 'string') errors.push('id required')
  if (!s.description || typeof s.description !== 'string') errors.push('description required')
  if (!s.inputSchema || typeof s.inputSchema !== 'object') errors.push('inputSchema required')
  if (s.inputSchema && s.inputSchema.type !== 'object') errors.push('inputSchema.type must be "object"')
  return { valid: errors.length === 0, errors }
}
