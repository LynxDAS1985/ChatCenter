// v1.0.2: адаптер между tdlibBackend (домены messages.get/send/markRead) и
// плоским интерфейсом который ожидают AI tool handlers (getMessages/sendMessage/
// markAsRead/searchMessages). До v1.0.2 в aiAgentSetup был fallback на пустой
// массив / no_tdlib_backend — потому что setAgentDeps передавал tdlibBackend
// напрямую (без адаптации сигнатур).
//
// chatId — наш составной id 'accountId:rawId' (см. main/native/backends/tdlibBackend.js).
// Source паспорт хранит chatId именно в этом виде, AI tools прокидывают как есть.
//
// Backend handlers возвращают разные формы:
//   - messages.get → { ok, messages: [...], hasMore }
//   - messages.send → { ok, id?, error? }
//   - messages.markRead → { ok, error? }
//   - messages.search → { ok, messages: [...] } (добавлен в v1.0.2)
// Адаптер унифицирует:
//   - getMessages → []  (массив сообщений)
//   - searchMessages → []
//   - sendMessage → { ok, id?, error? }
//   - markAsRead → { ok, error? }

/**
 * @param {object} tdlibBackend — объект с доменами messages/chats/forum/...
 * @returns {object} плоский интерфейс для AI tool handlerContext
 */
export function createAiAgentBackendAdapter(tdlibBackend) {
  if (!tdlibBackend || typeof tdlibBackend !== 'object') {
    return makeEmptyAdapter('no_tdlib_backend')
  }
  const m = tdlibBackend.messages
  if (!m || typeof m !== 'object') {
    return makeEmptyAdapter('no_messages_domain')
  }

  return {
    /**
     * Прочитать историю чата для AI контекста.
     * @returns {Promise<Array>} массив сообщений (пустой при ошибке)
     */
    getMessages: async ({ chatId, limit, beforeMessageId } = {}) => {
      if (!chatId || typeof m.get !== 'function') return []
      try {
        const r = await m.get({
          chatId,
          limit: clampLimit(limit, 20, 100),
          // beforeMessageId → TDLib offset_id (берёт сообщения СТАРШЕ этого id)
          offsetId: beforeMessageId ? String(beforeMessageId) : 0,
        })
        if (!r || r.ok === false) return []
        return Array.isArray(r.messages) ? r.messages : []
      } catch (_) {
        return []
      }
    },

    /**
     * Поиск по тексту сообщений (в чате или глобально).
     * @returns {Promise<Array>}
     */
    searchMessages: async ({ query, chatId, accountId, limit } = {}) => {
      if (!query || typeof m.search !== 'function') return []
      try {
        const r = await m.search({
          query: String(query),
          chatId: chatId || null,
          accountId: accountId || null,
          limit: clampLimit(limit, 20, 50),
        })
        if (!r || r.ok === false) return []
        return Array.isArray(r.messages) ? r.messages : []
      } catch (_) {
        return []
      }
    },

    /**
     * Отправить сообщение (с опциональным reply).
     * tdlibBackend.messages.send → { ok, messageId, message? }. Возвращаем
     * нормализованную форму { ok, id, error? } (handler.replyToMessage читает r.id).
     */
    sendMessage: async ({ chatId, text, replyToMessageId } = {}) => {
      if (!chatId || !text) return { ok: false, error: 'invalid_args' }
      if (typeof m.send !== 'function') return { ok: false, error: 'no_send_in_backend' }
      try {
        const r = await m.send(chatId, text, replyToMessageId ? Number(replyToMessageId) : undefined)
        if (!r) return { ok: false, error: 'no_response' }
        if (r.ok === false) return { ok: false, error: r.error || 'send_failed' }
        return {
          ok: true,
          id: r.messageId ? String(r.messageId) : (r.id ? String(r.id) : (r.message?.id ? String(r.message.id) : null)),
        }
      } catch (e) {
        return { ok: false, error: e?.message || 'send_threw' }
      }
    },

    /**
     * Отметить прочитанным до upToMessageId. TDLib viewMessages — отмечает
     * указанные id и автоматически всё ниже.
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    markAsRead: async ({ chatId, upToMessageId } = {}) => {
      if (!chatId || !upToMessageId) return { ok: false, error: 'invalid_args' }
      if (typeof m.markRead !== 'function') return { ok: false, error: 'no_markRead_in_backend' }
      try {
        const r = await m.markRead(chatId, Number(upToMessageId))
        if (!r) return { ok: true }
        if (r.ok === false) return { ok: false, error: r.error || 'markRead_failed' }
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e?.message || 'markRead_threw' }
      }
    },
  }
}

function makeEmptyAdapter(reason) {
  return {
    getMessages: async () => [],
    searchMessages: async () => [],
    sendMessage: async () => ({ ok: false, error: reason }),
    markAsRead: async () => ({ ok: false, error: reason }),
  }
}

function clampLimit(v, def, max) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 1) return def
  return Math.min(n, max)
}
