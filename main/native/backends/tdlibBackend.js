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
  viewMessages, getMessage, getChatPinnedMessage,
} from './tdlibMessages.js'
import {
  downloadFile, cancelDownload, extractMediaFileId, getCachedFilePath,
  getStorageStatistics, optimizeStorage,
} from './tdlibMedia.js'
import { TdlibAuthFlow } from './tdlibAuth.js'
import { userDisplayName } from './tdlibClient.js'

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

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
 * @param {object} [opts.tdlibParameters] — для нового логина
 * @param {() => object} [opts.makeClientParams] — функция возвращающая параметры
 *   для clientFactory (apiId, apiHash, tdlibParameters) при создании нового аккаунта
 * @returns {import('../messengerBackend.js').MessengerBackend}
 */
export function createTdlibBackend(opts = {}) {
  const { manager, tdlibParameters, makeClientParams } = opts
  if (!manager) throw new Error('TdlibClientManager required')

  // Состояние одного активного login (TDLib линейный). dispose() после завершения.
  let _authFlow = null
  let _pendingAccountId = null

  // Получает user info через getMe и переименовывает аккаунт tg_pending_X → tg_<userId>.
  // Также эмитит account:update event для UI sidebar (через event bridge → tg:account-update).
  // Вызывается ПОСЛЕ успешного login (step === 'success' или success: true).
  const _finalizePending = async () => {
    if (!_pendingAccountId) return
    const client = manager.getClient(_pendingAccountId)
    if (!client?.invoke) return
    try {
      const me = await client.invoke({ '@type': 'getMe' })
      const userId = me?.id
      if (!userId) return
      const newAccountId = `tg_${userId}`
      const renamed = manager._renameAccount(_pendingAccountId, newAccountId)
      const fullName = `${me.first_name || ''} ${me.last_name || ''}`.trim()
      const username = me.usernames?.active_usernames?.[0] || ''
      manager.emit('account:update', {
        id: renamed ? newAccountId : _pendingAccountId,
        messenger: 'telegram',
        status: 'connected',
        name: fullName || (username ? `@${username}` : ''),
        phone: me.phone_number ? `+${me.phone_number}` : '',
        username,
        userId: String(userId),
      })
      _pendingAccountId = renamed ? newAccountId : _pendingAccountId
    } catch (_) { /* TDLib мог упасть на getMe — не критично, аккаунт остаётся под pending */ }
  }

  return {
    name: 'tdlib',
    _manager: manager,

    auth: {
      async startLogin(phone) {
        if (!phone) return { ok: false, error: 'phone required' }
        // Создаём временный accountId — после авторизации переименуем по getMe().
        _pendingAccountId = 'tg_pending_' + Date.now()
        const params = makeClientParams ? makeClientParams() : { apiId: 0, apiHash: '' }
        manager.createAccount(_pendingAccountId, params)
        _authFlow = new TdlibAuthFlow({
          manager, accountId: _pendingAccountId, tdlibParameters,
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
        // На Этапе 2.6: TDLib сам поддерживает список чатов в cache через
        // updateNewChat / updateChatPosition. manager.getAccountChats возвращает
        // их в Chat-формате.
        // Для refresh из сервера: client.invoke({'@type': 'loadChats', limit}).
        if (accountId) {
          const client = manager.getClient(accountId)
          if (client?.invoke) {
            try {
              await client.invoke({
                '@type': 'loadChats',
                chat_list: { '@type': 'chatListMain' },
                limit: 100,
              })
            } catch (_) { /* ignore — может быть уже всё загружено */ }
          }
          return { ok: true, chats: manager.getAccountChats(accountId) }
        }
        // Без accountId — собираем со всех аккаунтов
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
        const result = {}
        for (const accountId of manager.listAccounts()) {
          const client = manager.getClient(accountId)
          if (!client?.invoke) { result[accountId] = { ms: -1, error: 'no client' }; continue }
          const t0 = Date.now()
          try {
            await client.invoke({ '@type': 'getOption', name: 'version' })
            result[accountId] = { ms: Date.now() - t0 }
          } catch (e) {
            result[accountId] = { ms: Date.now() - t0, error: e?.message || String(e) }
          }
        }
        return { ok: true, perAccount: result }
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
      async getTopic(_params) {
        // Forum topics — отдельная задача. На Этапе 2.6 пропускаем
        // (см. group-topic-investigation.md). UI пока не разрешает отправку в темы.
        return { ok: false, error: 'forum topics not implemented in tdlib backend yet', messages: [] }
      },
      async send(chatId, text, replyTo) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return sendTextMessage(ctx.client, ctx.rawId, text, {
          replyTo, chatIdStr: chatId, extras: makeExtras(manager, ctx.accountId),
        })
      },
      async sendFile(_chatId, _filePath, _caption) {
        // Использует inputMessageDocument/Photo — отдельная функция в tdlibMessages.
        // На Этапе 2.6 пропускаем, чтобы не разрастаться.
        return { ok: false, error: 'sendFile not implemented in tdlib backend yet' }
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
      async forwardMessage(_fromChatId, _toChatId, _msgId) {
        return { ok: false, error: 'forwardMessage not implemented in tdlib backend yet' }
      },
      async markRead(chatId, maxId) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        // viewMessages в TDLib не принимает maxId — нужен массив id. Простая
        // реализация: помечаем виденым один последний msg id, TDLib сама
        // отметит всё ниже. Этого достаточно для UI-level mark-read.
        return viewMessages(ctx.client, ctx.rawId, [maxId])
      },
      async markTopicRead(_chatId, _topicId, _maxId) {
        return { ok: false, error: 'markTopicRead not implemented yet' }
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
      async getTopics(_chatId, _limit) {
        return { ok: false, error: 'forum.getTopics not implemented yet', isForum: false, topics: [] }
      },
      async getTopicMessages(_params) {
        return { ok: false, error: 'forum.getTopicMessages not implemented yet', messages: [] }
      },
    },

    // Helper для внешних слушателей событий manager (на Этапе 3 IPC handlers
    // будут подписываться через _manager.on('message:new', ...) etc).
    _cancelDownload: (params) => cancelDownload({ manager, ...params }),
  }
}
