// v0.98.0 (Phase 2 M2.2): handler для mark_as_read tool.
//
// Permission: confirm (юзер настраивает — можно auto).
//
// Context: ожидается context = { markAsRead } — async function которая отмечает
// сообщения прочитанными до указанного messageId.
//
// Scope: только native_* messengerId.

/**
 * @param {object} source — NotificationSource
 * @param {object} args — { upToMessageId? } — если не указан, берётся source.messageId
 * @param {object} context — { markAsRead({accountId, chatId, upToMessageId}) → {ok, error?} }
 */
export async function markAsReadHandler(source, args, context) {
  if (!source || !source.accountId || !source.chatId) {
    return { ok: false, error: 'invalid_source' }
  }

  const upToMessageId = (args && args.upToMessageId) || source.messageId
  if (!upToMessageId) {
    return { ok: false, error: 'missing_upToMessageId' }
  }

  if (typeof context?.markAsRead !== 'function') {
    return { ok: false, error: 'no_markAsRead_in_context' }
  }

  try {
    const result = await context.markAsRead({
      accountId: source.accountId,
      chatId: source.chatId,
      upToMessageId: String(upToMessageId),
    })

    if (!result || !result.ok) {
      return { ok: false, error: result?.error || 'markAsRead_failed' }
    }

    return {
      ok: true,
      result: {
        marked: true,
        upToMessageId: String(upToMessageId),
        chatId: source.chatId,
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'markAsRead_threw' }
  }
}

export const markAsReadTool = {
  id: 'mark_as_read',
  permission: 'confirm',
  category: 'writing',
  revertable: true,
  description: 'Отметить сообщения как прочитанные до указанного messageId',
  schema: {
    type: 'object',
    required: ['source'],
    properties: {
      source: { type: 'object' },
      upToMessageId: { type: 'string' },
    },
  },
  handler: markAsReadHandler,
}
