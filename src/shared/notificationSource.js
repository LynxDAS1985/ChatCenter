// v0.96.0 (Phase 0): NotificationSource — паспорт сообщения.
//
// Неизменяемый объект, описывающий полный контекст сообщения. Создаётся ОДИН
// раз в момент когда сообщение приходит от TDLib (или webview) и несётся БЕЗ
// ИЗМЕНЕНИЙ через все слои — IPC, store, AI tools, audit log.
//
// Гарантирует точность 100% «откуда сообщение / кому отвечать»: TDLib гарантирует
// уникальность тройки (accountId, chatId, messageId).
//
// Использование:
//   import { createNotificationSource } from './notificationSource.js'
//   const source = createNotificationSource({
//     messengerId: 'native_cc',
//     accountId: 'tg_611696632',
//     chatId: '-1001229486988',
//     messageId: '38375784448',
//     senderName: 'Иван',
//     ...
//   })
//
// См. .memory-bank/ai-agent-plan/architecture.md (Уровень 1: Source)

/**
 * Обязательные поля паспорта.
 * Без них невозможно адресовать сообщение.
 */
export const SOURCE_REQUIRED_FIELDS = ['messengerId', 'accountId', 'chatId', 'messageId']

/**
 * Максимальная длина textPreview — privacy-by-default + ограничение размера
 * IPC payload.
 */
const TEXT_PREVIEW_MAX = 200

/**
 * Поля которые поддерживаются паспортом (whitelist).
 * Всё что не в списке — игнорируется.
 */
const KNOWN_FIELDS = [
  ...SOURCE_REQUIRED_FIELDS,
  'threadId',
  'senderId',
  'senderName',
  'chatTitle',
  'timestamp',
  'textPreview',
  'mediaType',
  'replyToId',
  'isOutgoing',
]

/**
 * Создаёт объект-паспорт сообщения.
 *
 * @param {object} input — поля паспорта
 * @returns {object} frozen NotificationSource
 * @throws {Error} если отсутствует обязательное поле
 */
export function createNotificationSource(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('[NotificationSource] input must be an object')
  }

  // Валидация обязательных полей
  for (const field of SOURCE_REQUIRED_FIELDS) {
    if (input[field] == null || input[field] === '') {
      throw new Error(`[NotificationSource] missing required field: ${field}`)
    }
  }

  // Собираем паспорт только из known fields, всё остальное игнорируем
  const source = {}
  for (const field of KNOWN_FIELDS) {
    if (input[field] !== undefined) {
      source[field] = input[field]
    }
  }

  // Нормализация типов — id всегда string (TDLib id могут быть BigInt-like number)
  source.messengerId = String(source.messengerId)
  source.accountId = String(source.accountId)
  source.chatId = String(source.chatId)
  source.messageId = String(source.messageId)
  if (source.threadId != null) source.threadId = String(source.threadId)
  if (source.senderId != null) source.senderId = String(source.senderId)
  if (source.replyToId != null) source.replyToId = String(source.replyToId)

  // textPreview обрезается — privacy + size
  if (typeof source.textPreview === 'string' && source.textPreview.length > TEXT_PREVIEW_MAX) {
    source.textPreview = source.textPreview.slice(0, TEXT_PREVIEW_MAX)
  }

  // Defaults для опциональных
  if (source.threadId === undefined) source.threadId = null
  if (source.mediaType === undefined) source.mediaType = null

  // Object.freeze — invariant. Случайная мутация ломается.
  return Object.freeze(source)
}

/**
 * Валидация существующего объекта — для случаев когда source приходит из IPC.
 *
 * @param {*} source
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateNotificationSource(source) {
  const errors = []
  if (!source || typeof source !== 'object') {
    return { valid: false, errors: ['source must be an object'] }
  }
  for (const field of SOURCE_REQUIRED_FIELDS) {
    if (source[field] == null || source[field] === '') {
      errors.push(`missing required field: ${field}`)
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * Hash-ключ для дедупликации/debounce.
 * Возвращает строку которая уникально идентифицирует source.
 *
 * @param {object} source
 * @returns {string}
 */
export function sourceKey(source) {
  if (!source) return ''
  return `${source.messengerId}|${source.accountId}|${source.chatId}|${source.messageId}`
}
