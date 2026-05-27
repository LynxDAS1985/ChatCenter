// v0.89.0 — Stage 4 / Этап 2.4: TDLib messages API
//
// Чистые обёртки над client.invoke() для основных операций с сообщениями.
// Каждая функция принимает client (TDLib клиент или mock) первым параметром,
// возвращает Promise<{ ok, ..., error? }> совместимо с GramJS-форматом.
//
// Что покрыто:
//   getChatHistory(client, chatId, opts)       → messages.getChatHistory
//   sendTextMessage(client, chatId, text, ...)  → messages.sendMessage с inputMessageText
//   editMessageText(client, chatId, msgId, text) → messages.editMessageText
//   deleteMessages(client, chatId, ids, forAll) → messages.deleteMessages
//   viewMessages(client, chatId, ids)            → messages.viewMessages (mark-read)
//   getMessage(client, chatId, msgId)            → messages.getMessage (для pinned/reply)
//
// chatId здесь — TDLib chat_id (целое число), не наш составной accountId:rawId.
// Конвертация делается на уровне tdlibBackend перед вызовом этих функций.
//
// Документация: https://core.telegram.org/tdlib/docs/td__api_8h.html

import { mapMessage } from './tdlibMapper.js'
// v0.89.34: sendFile вынесен в tdlibSend.js (был ~120 строк, держал файл 475/500).
// Re-export для обратной совместимости — потребители продолжают импортировать
// sendFile из './tdlibMessages.js' без изменений.
export { sendFile } from './tdlibSend.js'

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Конвертирует invoke-ошибку в наш { ok: false, error, code? } формат.
 * TDLib ошибки имеют вид { '@type': 'error', code, message } или tdl кидает
 * TDLibError с .code и .message. v0.89.2 — сохраняем `code` чтобы потребители
 * могли различать (например, 404 для loadChats — конец списка, не ошибка).
 */
function wrapError(err) {
  if (err && typeof err === 'object') {
    if (err['@type'] === 'error') return { ok: false, error: err.message || String(err.code || ''), code: err.code }
    if (err.message) return { ok: false, error: err.message, code: err.code }
  }
  return { ok: false, error: String(err) }
}

/**
 * Строит inputMessageText из text + entities.
 * Если entities пуст — TDLib сам распарсит ссылки/hashtags/mentions
 * (через clear_draft + текст). Но для надёжности оставляем явные entities=[].
 */
function buildInputMessageText(text) {
  return {
    '@type': 'inputMessageText',
    text: {
      '@type': 'formattedText',
      text: String(text || ''),
      entities: [],
    },
    link_preview_options: { '@type': 'linkPreviewOptions', is_disabled: false },
    clear_draft: true,
  }
}

// ──────────────────────────────────────────────────────────────────────
// getChatHistory
// ──────────────────────────────────────────────────────────────────────

/**
 * Загружает историю чата.
 *
 * Маппинг GramJS параметров → TDLib:
 *   limit            → limit (1-100)
 *   offsetId / aroundId → from_message_id (TDLib грузит сообщения СТАРШЕ этого id)
 *   addOffset         → offset (отрицательный смещает к новым сообщениям)
 *
 * TDLib возвращает массив messages в порядке от новых к старым. Маппим в наш формат
 * и `.reverse()` — UI ждёт старые сверху, новые снизу.
 *
 * @param {object} client
 * @param {string|number} chatId — TDLib chat_id (число)
 * @param {object} opts — { limit, fromMessageId, offset, chatIdStr, extras }
 *   chatIdStr — наш составной id для mapMessage (например 'tg_1:-1001')
 *   extras    — { getSenderName(senderId), getSenderAvatar(senderId) }
 * @returns {Promise<{ ok, messages: NativeMessage[], hasMore: boolean, error? }>}
 */
export async function getChatHistory(client, chatId, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready', messages: [], hasMore: false }
  const numLimit = Number(opts.limit) || 50
  try {
    const result = await client.invoke({
      '@type': 'getChatHistory',
      chat_id: Number(chatId),
      from_message_id: Number(opts.fromMessageId) || 0,
      offset: Number(opts.offset) || 0,
      limit: numLimit,
      only_local: false,
    })
    const tdMessages = result?.messages || []
    const chatIdStr = String(opts.chatIdStr || chatId)
    const mapped = tdMessages.map((m) => {
      const senderId = m.sender_id
      let senderName = ''
      let senderAvatar = null
      if (opts.extras?.getSenderName && senderId) {
        senderName = opts.extras.getSenderName(senderId) || ''
      }
      if (opts.extras?.getSenderAvatar && senderId) {
        senderAvatar = opts.extras.getSenderAvatar(senderId) || null
      }
      return mapMessage(m, chatIdStr, { senderName, senderAvatar })
    }).filter(Boolean).reverse()
    return {
      ok: true,
      messages: mapped,
      // hasMore: TDLib возвращает столько сколько есть; если меньше limit — конец истории
      hasMore: tdMessages.length >= numLimit,
    }
  } catch (e) {
    const w = wrapError(e)
    return { ok: false, error: w.error, messages: [], hasMore: false }
  }
}

// ──────────────────────────────────────────────────────────────────────
// computeHistoryParams (v0.95.1)
// ──────────────────────────────────────────────────────────────────────

/**
 * Вычисляет { fromMessageId, offset } для getChatHistory по направлению загрузки.
 *
 * - load-newer (afterId): грузим СЛЕДУЮЩУЮ страницу НОВЕЕ afterId — непрерывно.
 *   TDLib: отрицательный offset грузит новее from_message_id; правило `limit >= -offset`
 *   (https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html).
 *   offset = -(limit-1) → ~(limit-1) сообщений новее afterId + сам afterId (dup, отсеивается
 *   дедупом в store). limit >= limit-1 — всегда валидно.
 * - initial (aroundId) / load-older (offsetId): from_message_id + addOffset как есть.
 *
 * РАНЬШЕ (баг до v0.95.1): afterId не использовался → from_message_id=0 → TDLib грузил
 * последние сообщения (низ чата), а не страницу после afterId → РАЗРЫВ в загруженном
 * списке при большом числе непрочитанных (окно стояло на первом непрочитанном).
 *
 * @param {object} p — { afterId, aroundId, offsetId, addOffset, limit }
 * @returns {{ fromMessageId: number, offset: number }}
 */
export function computeHistoryParams({ afterId, aroundId, offsetId, addOffset, limit } = {}) {
  const lim = Number(limit) || 50
  const after = Number(afterId || 0)
  if (after > 0) {
    return { fromMessageId: after, offset: -(lim - 1) }
  }
  return {
    fromMessageId: Number(aroundId || offsetId || 0),
    offset: Number(addOffset || 0),
  }
}

// ──────────────────────────────────────────────────────────────────────
// sendTextMessage
// ──────────────────────────────────────────────────────────────────────

/**
 * Отправляет текстовое сообщение.
 *
 * @param {object} client
 * @param {string|number} chatId — TDLib chat_id
 * @param {string} text
 * @param {object} [opts] — { replyTo (TDLib message_id), chatIdStr, extras }
 * @returns {Promise<{ ok, messageId?: string, message?: NativeMessage, error? }>}
 */
export async function sendTextMessage(client, chatId, text, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  if (!text || !String(text).trim()) return { ok: false, error: 'empty text' }
  try {
    const request = {
      '@type': 'sendMessage',
      chat_id: Number(chatId),
      input_message_content: buildInputMessageText(text),
    }
    if (opts.replyTo) {
      request.reply_to = {
        '@type': 'inputMessageReplyToMessage',
        message_id: Number(opts.replyTo),
      }
    }
    const result = await client.invoke(request)
    // TDLib возвращает Message объект сразу (provisional), окончательное id
    // придёт через updateMessageSendSucceeded потом.
    const chatIdStr = String(opts.chatIdStr || chatId)
    const message = result ? mapMessage(result, chatIdStr, opts.extras || {}) : null
    return {
      ok: true,
      messageId: result?.id != null ? String(result.id) : null,
      message,
    }
  } catch (e) {
    return wrapError(e)
  }
}

// ──────────────────────────────────────────────────────────────────────
// editMessageText
// ──────────────────────────────────────────────────────────────────────

export async function editMessageText(client, chatId, messageId, newText) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  try {
    await client.invoke({
      '@type': 'editMessageText',
      chat_id: Number(chatId),
      message_id: Number(messageId),
      input_message_content: buildInputMessageText(newText),
    })
    return { ok: true }
  } catch (e) {
    return wrapError(e)
  }
}

// ──────────────────────────────────────────────────────────────────────
// deleteMessages
// ──────────────────────────────────────────────────────────────────────

/**
 * Удаляет сообщения.
 *
 * @param {object} client
 * @param {string|number} chatId
 * @param {Array<string|number>} messageIds
 * @param {boolean} [forAll=true] — revoke (удалить у всех собеседников)
 */
export async function deleteMessages(client, chatId, messageIds, forAll = true) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  const ids = (Array.isArray(messageIds) ? messageIds : [messageIds]).map(Number).filter(Boolean)
  if (!ids.length) return { ok: false, error: 'no messageIds' }
  try {
    await client.invoke({
      '@type': 'deleteMessages',
      chat_id: Number(chatId),
      message_ids: ids,
      revoke: !!forAll,
    })
    return { ok: true }
  } catch (e) {
    return wrapError(e)
  }
}

// ──────────────────────────────────────────────────────────────────────
// viewMessages (mark-read)
// ──────────────────────────────────────────────────────────────────────

/**
 * Помечает сообщения как просмотренные (TDLib эквивалент markRead).
 * force_read=true заставляет TDLib обновить readInboxMaxId даже если
 * чат не открыт у юзера.
 */
export async function viewMessages(client, chatId, messageIds, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  const ids = (Array.isArray(messageIds) ? messageIds : [messageIds]).map(Number).filter(Boolean)
  if (!ids.length) return { ok: false, error: 'no messageIds' }
  try {
    await client.invoke({
      '@type': 'viewMessages',
      chat_id: Number(chatId),
      message_ids: ids,
      force_read: opts.forceRead !== false,
      source: opts.source ? { '@type': 'messageSourceChatHistory' } : undefined,
    })
    return { ok: true }
  } catch (e) {
    return wrapError(e)
  }
}

// ──────────────────────────────────────────────────────────────────────
// getMessage (single)
// ──────────────────────────────────────────────────────────────────────

/**
 * Возвращает одно сообщение по id (для pinned, reply preview).
 *
 * @returns {Promise<{ ok, message?: NativeMessage, error? }>}
 */
export async function getMessage(client, chatId, messageId, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  try {
    const result = await client.invoke({
      '@type': 'getMessage',
      chat_id: Number(chatId),
      message_id: Number(messageId),
    })
    const chatIdStr = String(opts.chatIdStr || chatId)
    const mapped = result ? mapMessage(result, chatIdStr, opts.extras || {}) : null
    return { ok: true, message: mapped }
  } catch (e) {
    return wrapError(e)
  }
}

// ──────────────────────────────────────────────────────────────────────
// getChatPinnedMessage
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
// forwardMessages
// ──────────────────────────────────────────────────────────────────────

/**
 * Пересылает одно или несколько сообщений из одного чата в другой.
 *
 * Документация: https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forward_messages.html
 *
 * @param {object} client
 * @param {string|number} fromChatId — TDLib chat_id источника
 * @param {string|number} toChatId — TDLib chat_id назначения
 * @param {Array<string|number>|string|number} messageIds — id одного или массив
 * @param {object} [opts] — { sendCopy, removeCaption }
 */
export async function forwardMessages(client, fromChatId, toChatId, messageIds, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  const ids = (Array.isArray(messageIds) ? messageIds : [messageIds]).map(Number).filter(Boolean)
  if (!ids.length) return { ok: false, error: 'no messageIds' }
  try {
    // v0.89.2: TDLib forwardMessages.options — `MessageSendOptions|null`.
    // По спеке «pass null to use default options». Раньше передавали пустой
    // {'@type':'messageSendOptions'} — формально валидно, но необязательно.
    await client.invoke({
      '@type': 'forwardMessages',
      chat_id: Number(toChatId),
      from_chat_id: Number(fromChatId),
      message_ids: ids,
      send_copy: !!opts.sendCopy,
      remove_caption: !!opts.removeCaption,
    })
    return { ok: true }
  } catch (e) {
    if (e && typeof e === 'object' && e['@type'] === 'error') {
      return { ok: false, error: e.message || String(e.code), code: e.code }
    }
    return { ok: false, error: e?.message || String(e), code: e?.code }
  }
}

// v0.89.3: pin/unpin СООБЩЕНИЯ через TDLib pinChatMessage / unpinChatMessage
// (раньше IPC tg:pin переключал чат в Main-list — регрессия от GramJS контракта).
// docs: https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1pin_chat_message.html

export async function pinMessage(client, chatId, messageId, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  const msgId = Number(messageId)
  if (!msgId) return { ok: false, error: 'no messageId' }
  try {
    await client.invoke({
      '@type': 'pinChatMessage',
      chat_id: Number(chatId),
      message_id: msgId,
      disable_notification: opts.disableNotification !== false,
      only_for_self: !!opts.onlyForSelf,
    })
    return { ok: true }
  } catch (e) { return wrapError(e) }
}

export async function unpinMessage(client, chatId, messageId) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  const msgId = Number(messageId)
  if (!msgId) return { ok: false, error: 'no messageId' }
  try {
    await client.invoke({ '@type': 'unpinChatMessage', chat_id: Number(chatId), message_id: msgId })
    return { ok: true }
  } catch (e) { return wrapError(e) }
}

export async function getChatPinnedMessage(client, chatId, opts = {}) {
  if (!client?.invoke) return { ok: false, error: 'client not ready' }
  try {
    const result = await client.invoke({
      '@type': 'getChatPinnedMessage',
      chat_id: Number(chatId),
    })
    if (!result) return { ok: true, message: null }
    const chatIdStr = String(opts.chatIdStr || chatId)
    return { ok: true, message: mapMessage(result, chatIdStr, opts.extras || {}) }
  } catch (e) {
    // Если pinned нет — TDLib возвращает error "Pinned message not found".
    // Это не критическая ошибка, отдаём { ok: true, message: null }.
    const w = wrapError(e)
    if (/pinned message not found/i.test(w.error || '')) return { ok: true, message: null }
    return w
  }
}
