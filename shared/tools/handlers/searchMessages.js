// v0.97.0 (Phase 1 M1.3): handler для search_messages tool.
//
// AI делает поиск по тексту сообщений.
// Permission: auto (read-only).

import { searchMessagesSchema } from '../toolSchemas.js'

const TEXT_PREVIEW_LIMIT = 300

export async function searchMessagesHandler(_source, args, context) {
  if (!args || !args.query || args.query.length < 2) {
    return { ok: false, error: 'invalid_query' }
  }
  const limit = Math.max(1, Math.min(args.limit || 20, 50))

  if (typeof context?.searchMessages !== 'function') {
    return { ok: false, error: 'no_searchMessages_in_context' }
  }

  try {
    const matches = await context.searchMessages({
      query: args.query,
      chatId: args.chatId || null,
      accountId: args.accountId || null,
      limit,
    })

    if (!Array.isArray(matches)) {
      return { ok: false, error: 'invalid_matches_response' }
    }

    const serialized = matches.map(m => ({
      id: String(m.id),
      chatId: m.chatId ? String(m.chatId) : null,
      senderName: m.senderName || '',
      text: (m.text || '').slice(0, TEXT_PREVIEW_LIMIT),
      timestamp: m.timestamp || 0,
      isOutgoing: !!m.isOutgoing,
    }))

    return {
      ok: true,
      result: {
        query: args.query,
        count: serialized.length,
        matches: serialized,
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'searchMessages_failed' }
  }
}

export const searchMessagesTool = {
  id: searchMessagesSchema.id,
  schema: searchMessagesSchema.inputSchema,
  permission: searchMessagesSchema.permission,
  description: searchMessagesSchema.description,
  category: searchMessagesSchema.category,
  revertable: searchMessagesSchema.revertable,
  handler: searchMessagesHandler,
}
