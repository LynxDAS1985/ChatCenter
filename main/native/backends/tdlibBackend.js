// v0.89.0 — Stage 4 / Этап 2.6: TDLib backend — реальная реализация
//
// Соединяет tdlibClient + tdlibAuth + tdlibMessages + tdlibMedia в единый
// MessengerBackend, который удовлетворяет интерфейс messengerBackend.js.
//
// АРХИТЕКТУРА:
//   - createTdlibBackend({ manager, tdlibParameters }) → MessengerBackend
//   - manager — экземпляр TdlibClientManager (создаётся ОДИН раз на процесс)
//   - tdlibParameters — результат buildTdlibParameters(), используется при login нового аккаунта
//
// chatId в наших методах — наш составной формат '{accountId}:{rawId}'.
// Внутри парсим accountId, получаем client через manager.getClient(accountId),
// rawId передаём в tdlibMessages как TDLib chat_id (число).
//
// AUTH FLOW: хранит state одного активного логина (login в TDLib линейный — нельзя
// параллельно). При завершении flow.dispose(). Создание следующего аккаунта =
// new TdlibAuthFlow для нового tempAccountId.

import {
  getChatHistory, sendTextMessage, editMessageText, deleteMessages,
  viewMessages, getMessage, getChatPinnedMessage, sendFile, forwardMessages,
} from './tdlibMessages.js'
import {
  downloadFile, cancelDownload, extractMediaFileId, getCachedFilePath,
  getStorageStatistics, optimizeStorage,
} from './tdlibMedia.js'
import { TdlibAuthFlow } from './tdlibAuth.js'
import { userDisplayName } from './tdlibClient.js'
import { mapMessage as tdlibMapMessageDirect } from './tdlibMapper.js'
import { setMute as setMuteRaw, togglePin as togglePinRaw, getCleanupStats as getCleanupStatsRaw } from './tdlibChatActions.js'

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

// Wrapper для invoke который возвращает { ok, result?, error?, code? } вместо throw.
// TDLib шлёт {'@type':'error', code, message} как rejected promise (tdl выкидывает
// TDLibError с .code и .message). Особый случай: error code=404 для loadChats
// означает «список закончился» (это норма, см. loadChats цикл ниже).
// v0.89.2: сохраняем `code` как есть (undefined вместо фейкового 0) — позволяет
// различать «список закончился» (404) от «другая ошибка» в потребителях.
async function safeInvoke(client, request) {
  try {
    const r = await client.invoke(request)
    return { ok: true, result: r }
  } catch (e) {
    return { ok: false, error: e?.message || String(e), code: e?.code }
  }
}

/** Парсит наш составной id 'accountId:rawId' → { accountId, rawId (число) } */
function parseChatId(chatId) {
  const s = String(chatId || '')
  const colon = s.indexOf(':')
  if (colon < 0) return { accountId: null, rawId: null }
  return { accountId: s.slice(0, colon), rawId: Number(s.slice(colon + 1)) }
}

/**
 * Возвращает client для chatId или null + готовый error-ответ.
 */
function getClientForChat(manager, chatId) {
  const { accountId, rawId } = parseChatId(chatId)
  if (!accountId) return { error: { ok: false, error: 'invalid chatId' } }
  const client = manager.getClient(accountId)
  if (!client) return { error: { ok: false, error: 'account not found: ' + accountId } }
  return { accountId, rawId, client }
}

/**
 * Создаёт extras для mapMessage — резолвит senderName/senderAvatar из cache.
 * accountId нужен чтобы знать в каком cache искать (multi-account).
 */
function makeExtras(manager, accountId) {
  return {
    getSenderName: (senderId) => {
      if (!senderId) return ''
      if (senderId['@type'] === 'messageSenderUser') {
        const user = manager.getUserCached(accountId, senderId.user_id)
        return userDisplayName(user)
      }
      if (senderId['@type'] === 'messageSenderChat') {
        const chat = manager.getChatCached(accountId, senderId.chat_id)
        return chat?.title || ''
      }
      return ''
    },
    getSenderAvatar: (_senderId) => {
      // На Этапе 2.6 senderAvatar пока null. В Этапе 3 (интеграция) накатим
      // через downloadFile для profile_photo + cc-media:// URL.
      return null
    },
  }
}

// ──────────────────────────────────────────────────────────────────────
// MAIN FACTORY
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object} opts.manager — TdlibClientManager (обязательно)
 * @param {(accountSubdir?: string) => object} [opts.makeClientParams] — функция
 *   возвращающая параметры для clientFactory (apiId, apiHash, tdlibParameters,
 *   accountSubdir) при создании нового аккаунта.
 * @returns {import('../messengerBackend.js').MessengerBackend}
 */
export function createTdlibBackend(opts = {}) {
  const { manager, makeClientParams } = opts
  if (!manager) throw new Error('TdlibClientManager required')

  // Состояние одного активного login (TDLib линейный). dispose() после завершения.
  let _authFlow = null
  let _pendingAccountId = null

  // v0.89.2: единая точка финализации — manager.finalizeAccount (в tdlibClient.js).
  // Раньше тут жила копия логики getMe → rename → emit account:update, но без
  // phone-fallback на имя и без auto-download своей profile_photo. Это давало
  // расхождение между manual-login (без fallback) и auto-restore (с fallback).
  // Теперь оба пути зовут одну функцию.
  const _finalizePending = async () => {
    if (!_pendingAccountId) return
    const r = await manager.finalizeAccount(_pendingAccountId)
    if (r?.ok && r.newAccountId) _pendingAccountId = r.newAccountId
  }

  return {
    name: 'tdlib',
    _manager: manager,

    auth: {
      async startLogin(phone) {
        if (!phone) return { ok: false, error: 'phone required' }
        // Создаём временный accountId — после авторизации переименуем по getMe().
        _pendingAccountId = 'tg_pending_' + Date.now()
        const params = makeClientParams
          ? makeClientParams(_pendingAccountId)
          : { apiId: 0, apiHash: '' }
        manager.createAccount(_pendingAccountId, params)
        _authFlow = new TdlibAuthFlow({
          manager, accountId: _pendingAccountId,
        })
        const r = await _authFlow.startLogin(phone)
        // Если login без 2FA прошёл сразу (step === 'success') — финализируем.
        if (r?.ok && (r.step === 'success' || r.success)) await _finalizePending()
        return r
      },
      async submitCode(code) {
        if (!_authFlow) return { ok: false, error: 'no login in progress' }
        const r = await _authFlow.submitCode(code)
        if (r?.ok && (r.step === 'success' || r.success)) await _finalizePending()
        return r
      },
      async submitPassword(password) {
        if (!_authFlow) return { ok: false, error: 'no login in progress' }
        const r = await _authFlow.submitPassword(password)
        if (r?.ok && (r.step === 'success' || r.success)) await _finalizePending()
        return r
      },
      async cancelLogin() {
        if (!_authFlow) return { ok: true }
        const r = await _authFlow.cancelLogin()
        _authFlow = null
        if (_pendingAccountId) {
          await manager.removeAccount(_pendingAccountId).catch(() => {})
          _pendingAccountId = null
        }
        return r
      },
      async autoRestoreSessions() {
        // На Этапе 2.6 noop. Реальная реализация (на Этапе 3): прочитать
        // папку tdlib-sessions/, для каждой создать manager.createAccount().
        return
      },
      async removeAccount(accountId) {
        const ok = await manager.removeAccount(accountId)
        return { ok }
      },
    },

    chats: {
      async getChats(accountId) {
        // v0.89.0 / Этап 3.11: правильная пагинация TDLib loadChats.
        // loadChats({limit:N}) — это команда «загрузи следующие N чатов». TDLib
        // строит список через updateNewChat events АСИНХРОННО. invoke резолвится
        // сразу с Ok или с error code=404 когда чатов больше нет.
        // Чтобы получить ВСЕ чаты (у юзера 600+), вызываем loadChats в цикле
        // пока не получим 404. Между вызовами даём TDLib время на updateNewChat.
        const accountIds = accountId ? [accountId] : manager.listAccounts()
        for (const aid of accountIds) {
          const client = manager.getClient(aid)
          if (!client?.invoke) continue
          // Загружаем Main + Archive lists (юзер может иметь архивные тоже)
          for (const chatList of [
            { '@type': 'chatListMain' },
            { '@type': 'chatListArchive' },
          ]) {
            for (let i = 0; i < 20; i++) {  // макс 20 страниц x 100 = 2000 чатов
              const r = await safeInvoke(client, { '@type': 'loadChats', chat_list: chatList, limit: 100 })
              if (!r.ok) break  // 404 «end of list» или ошибка — выходим
              // Маленькая пауза чтобы updateNewChat events успели прийти
              await new Promise((res) => setTimeout(res, 80))
            }
          }
        }
        // Возвращаем то что накопилось в cache
        if (accountId) return { ok: true, chats: manager.getAccountChats(accountId) }
        const all = []
        for (const aid of manager.listAccounts()) all.push(...manager.getAccountChats(aid))
        return { ok: true, chats: all }
      },
      async getCachedChats(accountId) {
        return { ok: true, chats: manager.getAccountChats(accountId) }
      },
      async rescanUnread() {
        // TDLib сам шлёт updateChatReadInbox при синхронизации — нам не нужно
        // явно делать rescan. Просто возвращаем актуальный snapshot из cache.
        const accountStats = manager.listAccounts().map((accountId) => {
          const chats = manager.getAccountChats(accountId)
          const unreadTotal = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
          return { accountId, chats: chats.length, unreadTotal, ms: 0 }
        })
        return { ok: true, accountStats }
      },
      async healthCheck() {
        // Лёгкий probe: getOption('version') — TDLib обычно отвечает за единицы мс.
        // UI ожидает { ok, accountStats: [{ accountId, ms, ok, error? }] }
        // (см. accountStatById в nativeStore.js:154).
        const accountStats = []
        for (const accountId of manager.listAccounts()) {
          const client = manager.getClient(accountId)
          if (!client?.invoke) { accountStats.push({ accountId, ms: -1, ok: false, error: 'no client' }); continue }
          const t0 = Date.now()
          try {
            await client.invoke({ '@type': 'getOption', name: 'version' })
            // Min 1 мс — getOption отвечает <1ms из кэша TDLib, UI плохо
            // воспринимает 0 (выглядит как «не проверилось»).
            accountStats.push({ accountId, ms: Math.max(1, Date.now() - t0), ok: true })
          } catch (e) {
            accountStats.push({ accountId, ms: Date.now() - t0, ok: false, error: e?.message || String(e) })
          }
        }
        return { ok: true, accountStats }
      },
      // v0.89.2: реализации chat-level admin actions вынесены в tdlibChatActions.js
      // (tdlibBackend.js упёрся в лимит 500 строк после реализации этих методов).
      async setMute(chatId, muteFor) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return setMuteRaw(ctx.client, ctx.rawId, muteFor)
      },
      async togglePin(chatId, isPinned) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return togglePinRaw(ctx.client, ctx.rawId, isPinned)
      },
      async getCleanupStats() {
        return getCleanupStatsRaw(manager)
      },
    },

    messages: {
      async get(params) {
        const ctx = getClientForChat(manager, params?.chatId)
        if (ctx.error) return { ...ctx.error, messages: [], hasMore: false }
        return getChatHistory(ctx.client, ctx.rawId, {
          limit: params.limit,
          fromMessageId: params.aroundId || params.offsetId,
          offset: params.addOffset,
          chatIdStr: params.chatId,
          extras: makeExtras(manager, ctx.accountId),
        })
      },
      // v0.89.0 / Этап 3.10: TDLib getMessageThreadHistory для forum topics
      async getTopic(params) {
        const ctx = getClientForChat(manager, params?.chatId)
        if (ctx.error) return { ...ctx.error, messages: [] }
        const topicId = Number(params?.topicId || params?.topMessageId)
        if (!topicId) return { ok: false, error: 'no topicId', messages: [] }
        const limit = Number(params?.limit) || 50
        try {
          const result = await ctx.client.invoke({
            '@type': 'getMessageThreadHistory',
            chat_id: ctx.rawId,
            message_id: topicId,
            from_message_id: Number(params?.aroundId || params?.offsetId || 0),
            offset: Number(params?.addOffset || 0),
            limit,
          })
          const extras = makeExtras(manager, ctx.accountId)
          const messages = (result?.messages || []).map((m) => {
            const senderId = m.sender_id
            const senderName = extras.getSenderName(senderId)
            const senderAvatar = extras.getSenderAvatar(senderId)
            // mapMessage импорт уже есть в tdlibBackend через tdlibMessages?
            // Нет — mapMessage из tdlibMapper. Импортируем в Stage 3.10.
            return tdlibMapMessageDirect(m, params.chatId, { senderName, senderAvatar })
          }).filter(Boolean).reverse()
          return { ok: true, messages, hasMore: messages.length >= limit }
        } catch (e) {
          return { ok: false, error: e?.message || String(e), messages: [] }
        }
      },
      async send(chatId, text, replyTo) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return sendTextMessage(ctx.client, ctx.rawId, text, {
          replyTo, chatIdStr: chatId, extras: makeExtras(manager, ctx.accountId),
        })
      },
      // v0.89.0 / Этап 3.13: реальная реализация через TDLib inputMessagePhoto/Video/Document
      async sendFile(chatId, filePath, caption) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return sendFile(ctx.client, ctx.rawId, filePath, {
          caption, chatIdStr: chatId,
        })
      },
      async deleteMessage(chatId, msgId, forAll = true) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return deleteMessages(ctx.client, ctx.rawId, [msgId], forAll)
      },
      async editMessage(chatId, msgId, text) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return editMessageText(ctx.client, ctx.rawId, msgId, text)
      },
      // v0.89.0 / Этап 3.13: TDLib forwardMessages
      async forwardMessage(fromChatId, toChatId, msgId) {
        const fromCtx = getClientForChat(manager, fromChatId)
        if (fromCtx.error) return fromCtx.error
        const toCtx = getClientForChat(manager, toChatId)
        if (toCtx.error) return toCtx.error
        // Если перевод между разными аккаунтами — TDLib не поддерживает direct
        // forward. Нужно скачать → переотправить. Пока возвращаем error.
        if (fromCtx.accountId !== toCtx.accountId) {
          return { ok: false, error: 'cross-account forward not supported' }
        }
        return forwardMessages(fromCtx.client, fromCtx.rawId, toCtx.rawId, [msgId])
      },
      async markRead(chatId, maxId) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        // viewMessages в TDLib не принимает maxId — нужен массив id. Простая
        // реализация: помечаем виденым один последний msg id, TDLib сама
        // отметит всё ниже. Этого достаточно для UI-level mark-read.
        return viewMessages(ctx.client, ctx.rawId, [maxId])
      },
      // v0.89.0 / Этап 3.10: TDLib readAllMessageThreadMentions / viewMessages
      // для thread. Простой вариант: viewMessages в самом чате с force_read.
      async markTopicRead(chatId, topicId, maxId) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        try {
          await ctx.client.invoke({
            '@type': 'viewMessages',
            chat_id: ctx.rawId,
            message_ids: [Number(maxId)],
            force_read: true,
          })
          return { ok: true }
        } catch (e) { return { ok: false, error: e?.message || String(e) } }
      },
      async getPinned(chatId) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return getChatPinnedMessage(ctx.client, ctx.rawId, {
          chatIdStr: chatId, extras: makeExtras(manager, ctx.accountId),
        })
      },
    },

    media: {
      async download({ chatId, msgId }) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        // Сначала получаем message чтобы достать file_id
        const msgRes = await getMessage(ctx.client, ctx.rawId, msgId, {
          chatIdStr: chatId, extras: makeExtras(manager, ctx.accountId),
        })
        if (!msgRes.ok) return { ok: false, error: msgRes.error }
        // ВНИМАНИЕ: getMessage возвращает NativeMessage без file_id (mapMessage
        // не пропускает raw TDLib file). Получим raw — отдельным getMessage с
        // synchronous и без mapper.
        let tdMsg
        try {
          tdMsg = await ctx.client.invoke({
            '@type': 'getMessage', chat_id: ctx.rawId, message_id: Number(msgId),
          })
        } catch (e) { return { ok: false, error: e?.message || String(e) } }
        const { fileId } = extractMediaFileId(tdMsg?.content)
        if (!fileId) return { ok: false, error: 'no media file in message' }
        // Проверяем кеш
        const cached = getCachedFilePath(
          tdMsg.content?.photo?.sizes?.[tdMsg.content.photo.sizes.length - 1]?.photo
            || tdMsg.content?.video?.video || tdMsg.content?.document?.document
            || tdMsg.content?.audio?.audio || tdMsg.content?.voice_note?.voice
        )
        if (cached) return { ok: true, path: cached }
        // Запускаем загрузку
        return downloadFile({ manager, accountId: ctx.accountId, fileId, priority: 16 })
      },
      async downloadVideo({ chatId, msgId, onProgress }) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        let tdMsg
        try {
          tdMsg = await ctx.client.invoke({
            '@type': 'getMessage', chat_id: ctx.rawId, message_id: Number(msgId),
          })
        } catch (e) { return { ok: false, error: e?.message || String(e) } }
        const fileId = tdMsg?.content?.video?.video?.id
        if (!fileId) return { ok: false, error: 'no video file' }
        return downloadFile({
          manager, accountId: ctx.accountId, fileId, priority: 24, onProgress,
        })
      },
      async getCacheSize() {
        // Суммируем по всем аккаунтам
        let total = 0
        for (const accountId of manager.listAccounts()) {
          const client = manager.getClient(accountId)
          if (!client) continue
          const r = await getStorageStatistics(client)
          if (r.ok) total += r.bytes
        }
        return { bytes: total }
      },
      async cleanup() {
        let freed = 0
        for (const accountId of manager.listAccounts()) {
          const client = manager.getClient(accountId)
          if (!client) continue
          const r = await optimizeStorage(client)
          if (r.ok) freed += r.freedBytes
        }
        return { ok: true, freedBytes: freed }
      },
    },

    forum: {
      // v0.89.0 / Этап 3.10: TDLib getForumTopics
      async getTopics(chatId, limit = 100) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return { ...ctx.error, isForum: false, topics: [] }
        // Проверим что чат — реально forum (is_forum=true в supergroup)
        const tdChat = manager.getChatCached(ctx.accountId, ctx.rawId)
        const isForum = !!(tdChat?.type?.is_forum)
        if (!isForum) return { ok: true, isForum: false, topics: [] }
        try {
          const result = await ctx.client.invoke({
            '@type': 'getForumTopics',
            chat_id: ctx.rawId,
            query: '',
            offset_date: 0,
            offset_message_id: 0,
            offset_message_thread_id: 0,
            limit: Math.min(100, Number(limit) || 100),
          })
          const topics = (result?.topics || []).map((t) => ({
            id: String(t.info?.message_thread_id || ''),
            topicId: String(t.info?.message_thread_id || ''),
            topMessageId: String(t.info?.message_thread_id || ''),
            title: t.info?.name || '',
            unreadCount: Number(t.unread_count) || 0,
            iconColor: t.info?.icon?.color || 0,
            iconCustomEmojiId: t.info?.icon?.custom_emoji_id ? String(t.info.icon.custom_emoji_id) : null,
            isClosed: !!t.info?.is_closed,
            isPinned: !!t.is_pinned,
            readInboxMaxId: Number(t.last_read_inbox_message_id) || 0,
          }))
          return { ok: true, isForum: true, topics }
        } catch (e) {
          return { ok: false, error: e?.message || String(e), isForum: true, topics: [] }
        }
      },
      // Alias: forum.getTopicMessages → messages.getTopic (UI зовёт messages.getTopic
      // через tg:get-topic-messages, forum.getTopicMessages пока не используется).
      // Возвращаем NOT_IMPL чтобы было ясно если кто-то его дёрнет.
      async getTopicMessages(_params) {
        return { ok: false, error: 'forum.getTopicMessages: use messages.getTopic instead', messages: [] }
      },
    },

    // Helper для внешних слушателей событий manager (на Этапе 3 IPC handlers
    // будут подписываться через _manager.on('message:new', ...) etc).
    _cancelDownload: (params) => cancelDownload({ manager, ...params }),
  }
}
