// v0.97.0 (Phase 1 M1.3): handler для get_chat_history tool.
//
// AI читает последние N сообщений чата для контекста.
// Permission: auto (read-only).
//
// Context: ожидается context = { getMessages } — async function которая возвращает
// массив сообщений из store. На main-стороне это вызывает TDLib.

import { getChatHistorySchema } from '../toolSchemas.js'

const TEXT_PREVIEW_LIMIT = 500

export async function getChatHistoryHandler(_source, args, context) {
  if (!args || !args.chatId) {
    return { ok: false, error: 'missing_chatId' }
  }
  const limit = Math.max(1, Math.min(args.limit || 20, 100))

  if (typeof context?.getMessages !== 'function') {
    return { ok: false, error: 'no_getMessages_in_context' }
  }

  try {
    const messages = await context.getMessages({
      chatId: args.chatId,
      limit,
      beforeMessageId: args.beforeMessageId || null,
    })

    if (!Array.isArray(messages)) {
      return { ok: false, error: 'invalid_messages_response' }
    }

    // Сериализуем для AI — без лишних полей, обрезаем текст
    const serialized = messages.map(m => ({
      id: String(m.id),
      senderId: m.senderId ? String(m.senderId) : null,
      senderName: m.senderName || '',
      text: (m.text || '').slice(0, TEXT_PREVIEW_LIMIT),
      timestamp: m.timestamp || 0,
      isOutgoing: !!m.isOutgoing,
      mediaType: m.mediaType || null,
      replyToId: m.replyToId ? String(m.replyToId) : null,
    }))

    return {
      ok: true,
      result: {
        chatId: args.chatId,
        count: serialized.length,
        messages: serialized,
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'getMessages_failed' }
  }
}

export const getChatHistoryTool = {
  id: getChatHistorySchema.id,
  schema: getChatHistorySchema.inputSchema,
  permission: getChatHistorySchema.permission,
  description: getChatHistorySchema.description,
  category: getChatHistorySchema.category,
  revertable: getChatHistorySchema.revertable,
  handler: getChatHistoryHandler,
}
