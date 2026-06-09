// v0.98.0 (Phase 2 M2.2): handler для reply_to_message tool.
//
// Permission: confirm HARDCODED — UI модалка подтверждения обязательна.
//
// Context: ожидается context = { sendMessage } — async function которая отправляет
// сообщение через store (TDLib для native_cc, в будущем — другие native API).
//
// Scope: только native_* messengerId (см. aiPermissionGuard.js).

const TEXT_MAX = 4000

/**
 * @param {object} source — NotificationSource
 * @param {object} args — { text, parseMode?, replyToMessageId? }
 * @param {object} context — { sendMessage(params) → Promise<{id, ok, error?}> }
 * @returns {Promise<{ok, result?, error?}>}
 */
export async function replyToMessageHandler(source, args, context) {
  if (!source || !source.accountId || !source.chatId) {
    return { ok: false, error: 'invalid_source' }
  }
  if (!source.messageId) {
    return { ok: false, error: 'missing_messageId' }
  }
  if (!args || typeof args.text !== 'string' || args.text.length === 0) {
    return { ok: false, error: 'invalid_text' }
  }
  if (args.text.length > TEXT_MAX) {
    return { ok: false, error: `text_too_long: max ${TEXT_MAX} chars` }
  }
  if (typeof context?.sendMessage !== 'function') {
    return { ok: false, error: 'no_sendMessage_in_context' }
  }

  try {
    const result = await context.sendMessage({
      accountId: source.accountId,
      chatId: source.chatId,
      text: args.text,
      replyToMessageId: source.messageId,
      parseMode: args.parseMode || 'plain',
    })

    if (!result || !result.ok) {
      return { ok: false, error: result?.error || 'sendMessage_failed' }
    }

    return {
      ok: true,
      result: {
        sent: true,
        sentMessageId: result.id ? String(result.id) : null,
        replyToMessageId: source.messageId,
        chatId: source.chatId,
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'sendMessage_threw' }
  }
}

export const replyToMessageTool = {
  id: 'reply_to_message',
  permission: 'confirm',
  category: 'writing',
  revertable: false,  // отправленное сообщение можно удалить, но получатель уже видел
  description: 'Отправить ответ на сообщение в чат',
  handler: replyToMessageHandler,
}
