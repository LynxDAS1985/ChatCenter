// v0.89.0 — Stage 4 / Этап 2.6: TDLib backend — реальная реализация.
// Соединяет tdlibClient + tdlibAuth + tdlibMessages + tdlibMedia в единый
// MessengerBackend (интерфейс messengerBackend.js). chatId в наших методах —
// составной '{accountId}:{rawId}'. AUTH FLOW линейный (TDLib не позволяет
// параллельные login'ы) — хранит state одного активного логина.

import {
  getChatHistory, computeHistoryParams, sendTextMessage, editMessageText, deleteMessages,
  viewMessages, getMessage, getChatPinnedMessage, sendFile, forwardMessages,
  pinMessage as pinMessageRaw, unpinMessage as unpinMessageRaw,
} from './tdlibMessages.js'
import {
  downloadFile, cancelDownload, extractMediaFileId, getCachedFilePath,
  tdlibPathToCcMediaUrl, stabilizeForPlayback, extractThumbnailFileId,
  getStorageStatistics, optimizeStorage,
} from './tdlibMedia.js'
import { TdlibAuthFlow } from './tdlibAuth.js'
import { userDisplayName } from './tdlibClient.js'
import { mapMessage as tdlibMapMessageDirect } from './tdlibMapper.js'
import { setMute as setMuteRaw, getCleanupStats as getCleanupStatsRaw, scanAccountSessionStats, removeAccountSessionFiles } from './tdlibChatActions.js'
import { cleanupTgMedia } from './tgMediaCleanup.js'
import { extractTopicPreview } from './tdlibPreview.js'  // v0.91.4
import { resolveTopicEmojis } from './tdlibForumEmoji.js'  // v0.91.6

// Wrapper для invoke: возвращает { ok, result?, error?, code? } вместо throw.
// `code` сохраняем как есть — потребители различают «404=end-of-list» от других.
async function safeInvoke(client, request) {
  try { return { ok: true, result: await client.invoke(request) } }
  catch (e) { return { ok: false, error: e?.message || String(e), code: e?.code } }
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
    // v0.89.6: из record.userAvatars/chatAvatars cache (раньше hardcoded null,
    // фото шло только через event tg:sender-avatar → race на старте).
    getSenderAvatar: (senderId) => {
      if (!senderId) return null
      const record = manager.accounts.get(accountId)
      if (!record) return null
      if (senderId['@type'] === 'messageSenderUser') return record.userAvatars?.get(Number(senderId.user_id)) || null
      if (senderId['@type'] === 'messageSenderChat') return record.chatAvatars?.get(Number(senderId.chat_id)) || null
      return null
    },
  }
}


/**
 * @param {object} opts
 * @param {object} opts.manager — TdlibClientManager (обязательно)
 * @param {(accountSubdir?: string) => object} [opts.makeClientParams] — функция
 *   возвращающая параметры для clientFactory при создании нового аккаунта.
 * @param {string} [opts.userDataDir] — userData папка (для getCleanupStats fs-скана).
 * @returns {import('../messengerBackend.js').MessengerBackend}
 */
export function createTdlibBackend(opts = {}) {
  const { manager, makeClientParams, userDataDir } = opts
  if (!manager) throw new Error('TdlibClientManager required')

  // Состояние одного активного login (TDLib линейный). dispose() после завершения.
  let _authFlow = null
  let _pendingAccountId = null

  // v0.89.2: единая точка финализации — manager.finalizeAccount (tdlibClient.js).
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
      // v0.89.4: полный logout flow: scan→logOut→close→fs.rmSync→emit removed.
      // Раньше только client.close() — сессия оставалась валидной на серверах,
      // файлы на диске, autoRestore воскрешал «удалённый» аккаунт.
      async removeAccount(accountId) {
        if (!accountId) return { ok: false, error: 'accountId required' }
        const wipeStats = userDataDir ? scanAccountSessionStats(userDataDir, accountId) : { totalFiles: 0, totalBytes: 0 }
        const client = manager.getClient(accountId)
        if (client?.invoke) {
          try { await client.invoke({ '@type': 'logOut' }) } catch (_) { /* best effort */ }
        }
        const ok = await manager.removeAccount(accountId)
        const filesRemoved = (ok && userDataDir) ? removeAccountSessionFiles(userDataDir, accountId) : false
        const isLast = manager.listAccounts().length === 0
        manager.emit('account:update', {
          id: accountId, messenger: 'telegram', status: 'disconnected',
          removed: true, wipeStats: { ...wipeStats, isLast, filesRemoved },
        })
        return { ok, wipeStats: { ...wipeStats, isLast } }
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
      // v0.89.3: setMute принимает muteUntil (Unix timestamp), как шлёт UI MuteMenu.
      // tdlibChatActions.setMute конвертирует в TDLib `mute_for = max(0, muteUntil - now)`.
      async setMute(chatId, muteUntil) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return setMuteRaw(ctx.client, ctx.rawId, muteUntil)
      },
      // v0.89.3: getCleanupStats — fs-скан tdlib-sessions/+tg-avatars/ для AccountContextMenu.
      async getCleanupStats() {
        return getCleanupStatsRaw(manager, userDataDir)
      },
    },

    messages: {
      async get(params) {
        const ctx = getClientForChat(manager, params?.chatId)
        if (ctx.error) return { ...ctx.error, messages: [], hasMore: false }
        const limit = Number(params.limit) || 50
        // v0.95.1: load-newer (afterId) грузит непрерывную страницу НОВЕЕ afterId, а не низ.
        const { fromMessageId, offset } = computeHistoryParams({ afterId: params.afterId, aroundId: params.aroundId, offsetId: params.offsetId, addOffset: params.addOffset, limit })
        const r = await getChatHistory(ctx.client, ctx.rawId, { limit, fromMessageId, offset, chatIdStr: params.chatId, extras: makeExtras(manager, ctx.accountId) })
        // Диагностика (v0.95.1): грузит ли load-newer непрерывно (first ≈ afterId, не низ чата).
        try { const m = r?.messages || []; console.log('[get-msgs] chat=' + params.chatId + ' afterId=' + Number(params.afterId || 0) + ' from=' + fromMessageId + ' offset=' + offset + ' count=' + m.length + ' first=' + (m[0]?.id || '-') + ' last=' + (m[m.length - 1]?.id || '-') + ' hasMore=' + r?.hasMore) } catch (_) {}
        return r
      },
      // v0.95.15: ИТЕРАТИВНЫЙ fetch для jump-to-end-of-chat.
      // КРИТИЧЕСКИ ВАЖНО: TDLib `getChatHistory` намеренно возвращает МЕНЬШЕ чем `limit`
      // («For optimal performance the number of returned messages is chosen by the library»,
      // [official issue #740](https://github.com/tdlib/td/issues/740) — ответ levlam).
      // Официальный паттерн ([getting-started](https://core.telegram.org/tdlib/getting-started#getting-chat-messages)):
      // «To get more messages than can be returned in one response, the Application needs to
      //  pass the identifier of the last message it has received as from_message_id to next request.»
      // Делаем итерации:
      //   - Iter 1: from=0 (TDLib spec: last_message) → получаем какое-то количество свежих
      //   - Iter N: from=oldest_collected.id, offset=0 → ещё older чем оlдест
      // Останавливаемся когда: набрали targetCount ИЛИ untilMessageId уже в collected ИЛИ
      //   пустой ответ ИЛИ достигли maxIterations (защита от бесконечного цикла).
      // См. .memory-bank/jump-to-end-saga.md — полная история 4 итераций v0.95.12-15.
      async getIterativeUntil(params) {
        const ctx = getClientForChat(manager, params?.chatId)
        if (ctx.error) return { ...ctx.error, messages: [], hasMore: false }
        const targetCount = Math.min(Math.max(Number(params.targetCount) || 100, 1), 100)
        const untilMessageId = params?.untilMessageId ? String(params.untilMessageId) : null
        const maxIterations = Math.min(Math.max(Number(params.maxIterations) || 5, 1), 10)
        const extras = makeExtras(manager, ctx.accountId)

        let collected = []
        let cursor = 0  // iter 1: from=0 (TDLib spec → last_message)
        let iterations = 0
        let lastError = null

        for (let i = 0; i < maxIterations; i++) {
          iterations = i + 1
          const r = await getChatHistory(ctx.client, ctx.rawId, {
            limit: 100,
            fromMessageId: cursor,
            offset: 0,
            chatIdStr: params.chatId,
            extras,
          })
          if (!r?.ok) { lastError = r; break }
          const incoming = r.messages || []
          if (incoming.length === 0) break
          // Dedup: фильтруем уже собранные
          const existingIds = new Set(collected.map(m => String(m.id)))
          const newMessages = incoming.filter(m => m?.id && !existingIds.has(String(m.id)))
          if (newMessages.length === 0) break  // все дубли — TDLib не даёт больше
          // Merge + sort по id ASC (от старого к новому, как ожидает UI)
          collected = [...collected, ...newMessages].sort((a, b) => {
            const aId = Number(a.id), bId = Number(b.id)
            return aId - bId
          })
          // v0.95.17: УБРАН early break на untilMessageId. TDLib часто возвращает в
          // iter 1 ТОЛЬКО X (issue #740 quirk), и break на until → возвращали [X]
          // → юзер видит 1 сообщение. Официальный паттерн ivanstepanovftw
          // (https://github.com/tdlib/td/issues/740#comment) — итерировать пока
          // `remaining > 0 && !empty`, untilMessageId НЕ short-circuit'ит.
          // Достаточно? → готово
          if (collected.length >= targetCount) break
          // Следующая итерация: продолжаем от старейшего полученного (older)
          cursor = String(collected[0].id)
        }

        try {
          console.log('[get-msgs-iter] chat=' + params.chatId
            + ' iterations=' + iterations + ' collected=' + collected.length
            + ' target=' + targetCount + ' until=' + (untilMessageId || '-')
            + ' first=' + (collected[0]?.id || '-')
            + ' last=' + (collected[collected.length - 1]?.id || '-'))
        } catch (_) {}

        if (lastError && collected.length === 0) return lastError
        return { ok: true, messages: collected, hasMore: false, iterations }
      },
      // v0.89.30 (ловушка #29): isGeneral → getChatHistory, иначе
      // getMessageThreadHistory(threadMessageId) — РЕАЛЬНЫЙ message_thread_id (int53).
      async getTopic(params) {
        const ctx = getClientForChat(manager, params?.chatId)
        if (ctx.error) return { ...ctx.error, messages: [] }
        const limit = Number(params?.limit) || 50
        const fromMessageId = Number(params?.aroundId || params?.offsetId || 0)
        const offset = Number(params?.addOffset || 0)
        const isGeneral = !!params?.isGeneral
        console.log('[topic-be] getTopic chatId=' + params.chatId + ' isGeneral=' + isGeneral + ' threadMsgId=' + params?.threadMessageId + ' from=' + fromMessageId + ' offset=' + offset + ' limit=' + limit)
        try {
          let result
          if (isGeneral) {
            result = await ctx.client.invoke({ '@type': 'getChatHistory', chat_id: ctx.rawId, from_message_id: fromMessageId, offset, limit, only_local: false })
          } else {
            const threadMessageId = params?.threadMessageId ? Number(params.threadMessageId) : Number(params?.topicId || params?.topMessageId)
            if (!threadMessageId || Number.isNaN(threadMessageId)) {
              console.log('[topic-be] no threadMessageId — empty topic')
              return { ok: true, messages: [], hasMore: false }
            }
            result = await ctx.client.invoke({ '@type': 'getMessageThreadHistory', chat_id: ctx.rawId, message_id: threadMessageId, from_message_id: fromMessageId, offset, limit })
          }
          console.log('[topic-be] invoke result messagesCount=' + (result?.messages?.length || 0))
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
          console.log('[topic-be] invoke ERROR err=' + (e?.message || String(e)))
          return { ok: false, error: e?.message || String(e), messages: [] }
        }
      },
      // v0.95.16: ИТЕРАТИВНЫЙ fetch для jump-to-end в ФОРУМ-ТОПИКЕ.
      // Зеркало messages.getIterativeUntil но через getMessageThreadHistory
      // (для не-General топиков) или getChatHistory (для General).
      // КРИТИЧНО: TDLib `getMessageThreadHistory` имеет ТОТ ЖЕ quirk что getChatHistory:
      // «number of returned messages is chosen by TDLib and can be smaller than limit»
      // ([docs](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_message_thread_history.html)).
      // См. .memory-bank/jump-to-end-saga.md — v0.95.16 расширение на форумы.
      async getIterativeUntilTopic(params) {
        const ctx = getClientForChat(manager, params?.chatId)
        if (ctx.error) return { ...ctx.error, messages: [], hasMore: false }
        const targetCount = Math.min(Math.max(Number(params.targetCount) || 100, 1), 100)
        const untilMessageId = params?.untilMessageId ? String(params.untilMessageId) : null
        const maxIterations = Math.min(Math.max(Number(params.maxIterations) || 5, 1), 10)
        const isGeneral = !!params?.isGeneral
        const threadMessageId = params?.threadMessageId ? Number(params.threadMessageId) : null
        if (!isGeneral && !threadMessageId) {
          return { ok: false, error: 'threadMessageId required for non-General topic', messages: [] }
        }
        const extras = makeExtras(manager, ctx.accountId)
        const chatIdStr = String(params.chatId)

        let collected = []
        let cursor = 0  // iter 1: from=0 → last_message топика
        let iterations = 0
        let lastError = null

        for (let i = 0; i < maxIterations; i++) {
          iterations = i + 1
          try {
            const invokeParams = isGeneral
              ? { '@type': 'getChatHistory', chat_id: ctx.rawId, from_message_id: cursor, offset: 0, limit: 100, only_local: false }
              : { '@type': 'getMessageThreadHistory', chat_id: ctx.rawId, message_id: threadMessageId, from_message_id: cursor, offset: 0, limit: 100 }
            const tdResult = await ctx.client.invoke(invokeParams)
            const tdMessages = tdResult?.messages || []
            if (tdMessages.length === 0) break
            const mapped = tdMessages.map((m) => {
              const senderId = m.sender_id
              const senderName = extras.getSenderName ? extras.getSenderName(senderId) || '' : ''
              const senderAvatar = extras.getSenderAvatar ? extras.getSenderAvatar(senderId) || null : null
              return tdlibMapMessageDirect(m, chatIdStr, { senderName, senderAvatar })
            }).filter(Boolean)
            // Dedup
            const existingIds = new Set(collected.map(m => String(m.id)))
            const newMessages = mapped.filter(m => m?.id && !existingIds.has(String(m.id)))
            if (newMessages.length === 0) break
            // Merge + sort ASC
            collected = [...collected, ...newMessages].sort((a, b) => Number(a.id) - Number(b.id))
            // v0.95.17: УБРАН untilMessageId short-circuit (тот же баг что в getIterativeUntil).
            // TDLib quirk: iter 1 может вернуть только X → break слишком рано.
            if (collected.length >= targetCount) break
            cursor = String(collected[0].id)
          } catch (e) {
            lastError = { ok: false, error: e?.message || String(e), messages: [] }
            break
          }
        }

        try {
          console.log('[topic-iter] chat=' + chatIdStr
            + ' isGeneral=' + isGeneral + ' threadMsgId=' + (threadMessageId || '-')
            + ' iterations=' + iterations + ' collected=' + collected.length
            + ' target=' + targetCount + ' until=' + (untilMessageId || '-')
            + ' first=' + (collected[0]?.id || '-')
            + ' last=' + (collected[collected.length - 1]?.id || '-'))
        } catch (_) {}

        if (lastError && collected.length === 0) return lastError
        return { ok: true, messages: collected, hasMore: false, iterations }
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
      // v0.89.31 (ловушка #30): по TDLib spec viewMessages для форум-топика
      // требует source: messageSourceForumTopicHistory. Без source TDLib
      // угадывает по состоянию чата → в форумах угадывание не обновляет
      // forumTopic.unread_count.
      async markTopicRead(chatId, topicId, maxId) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) {
          console.log('[topic-mark] chatId=' + chatId + ' ctx-error=' + JSON.stringify(ctx.error))
          return ctx.error
        }
        // v0.89.32: diagnostic — фиксируем каждый вызов markTopicRead с источником,
        // чтобы видеть в логе достигает ли TDLib и с каким maxId.
        console.log('[topic-mark] INVOKE chatId=' + chatId + ' rawChat=' + ctx.rawId + ' topicId=' + topicId + ' maxId=' + maxId + ' source=messageSourceForumTopicHistory')
        try {
          await ctx.client.invoke({
            '@type': 'viewMessages',
            chat_id: ctx.rawId,
            message_ids: [Number(maxId)],
            source: { '@type': 'messageSourceForumTopicHistory' },
            force_read: true,
          })
          console.log('[topic-mark] OK chatId=' + chatId + ' maxId=' + maxId)
          return { ok: true }
        } catch (e) {
          console.log('[topic-mark] ERROR chatId=' + chatId + ' maxId=' + maxId + ' err=' + (e?.message || String(e)))
          return { ok: false, error: e?.message || String(e) }
        }
      },
      async getPinned(chatId) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return getChatPinnedMessage(ctx.client, ctx.rawId, {
          chatIdStr: chatId, extras: makeExtras(manager, ctx.accountId),
        })
      },
      // v0.89.3: pin/unpin СООБЩЕНИЯ (TDLib pinChatMessage/unpinChatMessage).
      async pinMessage(chatId, messageId, opts) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return pinMessageRaw(ctx.client, ctx.rawId, messageId, opts)
      },
      async unpinMessage(chatId, messageId) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return ctx.error
        return unpinMessageRaw(ctx.client, ctx.rawId, messageId)
      },
    },

    media: (() => {
      // v0.89.15: ВСЕГДА копируем скачанные файлы в userData/tg-media/.
      // Подробности — см. шапка tdlibMedia.js + mistakes/tdlib-video-player.md.
      const dlAndStabilize = async (accountId, fileId, priority, onProgress) => {
        const r = await downloadFile({ manager, accountId, fileId, priority, onProgress })
        if (r?.ok && r?.file?.local?.path) {
          const stable = stabilizeForPlayback(r.file.local.path, userDataDir, fileId)
          r.path = stable || tdlibPathToCcMediaUrl(r.file.local.path) || r.file.local.path
        }
        return r
      }
      const fetchMessage = async (chatId, msgId) => {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) return { ctx }
        try {
          const tdMsg = await ctx.client.invoke({ '@type': 'getMessage', chat_id: ctx.rawId, message_id: Number(msgId) })
          return { ctx, tdMsg }
        } catch (e) { return { ctx: { error: { ok: false, error: e?.message || String(e) } } } }
      }
      return {
      async download({ chatId, msgId, onProgress }) {
        const { ctx, tdMsg } = await fetchMessage(chatId, msgId)
        if (ctx.error) return ctx.error
        const { fileId } = extractMediaFileId(tdMsg?.content)
        if (!fileId) return { ok: false, error: 'no media file in message' }
        const cached = getCachedFilePath(
          tdMsg.content?.photo?.sizes?.[tdMsg.content.photo.sizes.length - 1]?.photo
            || tdMsg.content?.video?.video || tdMsg.content?.document?.document
            || tdMsg.content?.audio?.audio || tdMsg.content?.voice_note?.voice)
        if (cached) {
          const stable = stabilizeForPlayback(cached, userDataDir, fileId)
          return { ok: true, path: stable || tdlibPathToCcMediaUrl(cached) || cached }
        }
        return dlAndStabilize(ctx.accountId, fileId, 16, onProgress)
      },
      // v0.89.16: качает thumbnail JPEG для постера. См. extractThumbnailFileId.
      async downloadThumbnail({ chatId, msgId, onProgress }) {
        const { ctx, tdMsg } = await fetchMessage(chatId, msgId)
        if (ctx.error) return ctx.error
        const fileId = extractThumbnailFileId(tdMsg?.content)
        if (!fileId) return { ok: false, error: 'no thumbnail' }
        return dlAndStabilize(ctx.accountId, fileId, 8, onProgress)
      },
      async downloadVideo({ chatId, msgId, onProgress }) {
        const { ctx, tdMsg } = await fetchMessage(chatId, msgId)
        if (ctx.error) return ctx.error
        const fileId = tdMsg?.content?.video?.video?.id
        if (!fileId) return { ok: false, error: 'no video file' }
        // v0.89.15: НИКАКОГО progressive — ждём полной загрузки, потом stabilize.
        return dlAndStabilize(ctx.accountId, fileId, 24, onProgress)
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
        // v0.89.17: ручная «Очистить кеш» = удалить ВСЁ в tg-media/.
        freed += cleanupTgMedia(userDataDir, { maxSizeBytes: 0, ttlSeconds: 0 }).freedBytes
        return { ok: true, freedBytes: freed }
      },
      }
    })(),

    forum: {
      // v0.89.0 / Этап 3.10: TDLib getForumTopics
      async getTopics(chatId, limit = 100) {
        const ctx = getClientForChat(manager, chatId)
        if (ctx.error) { console.log('[forum-be] getClientForChat error chatId=' + chatId + ' err=' + JSON.stringify(ctx.error)); return { ...ctx.error, isForum: false, topics: [] } }
        // Проверим что чат — реально forum (is_forum=true в supergroup)
        const tdChat = manager.getChatCached(ctx.accountId, ctx.rawId)
        // v0.89.25 (ловушка #24): is_forum в supergroup, не в chatTypeSupergroup
        const sgId = tdChat?.type?.supergroup_id
        const supergroup = sgId != null ? manager.getSupergroup(ctx.accountId, sgId) : null
        const isForum = !!supergroup?.is_forum
        console.log('[forum-be] chatId=' + chatId + ' sgId=' + sgId + ' sgCached=' + !!supergroup + ' is_fr=' + isForum + ' title=' + JSON.stringify(tdChat?.title || ''))
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
          // v0.89.29: diagnostic первого topic — для отладки структуры TDLib response
          if (result?.topics?.[0]) {
            console.log('[forum-be] sample topic[0] info=' + JSON.stringify(result.topics[0].info) + ' unread=' + result.topics[0].unread_count)
          }
          const topics = (result?.topics || []).map((t) => {
            // v0.89.29 (ловушка #28): forum_topic_id — это UI-id (int32),
            // v0.89.30 (ловушка #29): message_thread_id — это РАЗНОЕ поле,
            // int53, реальный id root-сообщения thread'а. Нужен для
            // getMessageThreadHistory.
            // https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1forum_topic_info.html
            // https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1message.html
            const forumTopicId = t.info?.forum_topic_id ?? t.info?.message_thread_id
            const idStr = forumTopicId !== null && forumTopicId !== undefined ? String(forumTopicId) : ''
            // threadMessageId для getMessageThreadHistory (берём из last_message; null для пустых тем).
            const threadMsgId = t.last_message?.message_thread_id ?? t.last_message?.id ?? null
            return {
              id: idStr,
              topicId: idStr,
              topMessageId: idStr,
              threadMessageId: threadMsgId !== null ? String(threadMsgId) : null,
              title: t.info?.name || '',
              isGeneral: !!t.info?.is_general,
              unreadCount: Number(t.unread_count) || 0,
              iconColor: t.info?.icon?.color || 0,
              iconCustomEmojiId: t.info?.icon?.custom_emoji_id ? String(t.info.icon.custom_emoji_id) : null,
              isClosed: !!t.info?.is_closed,
              isPinned: !!t.is_pinned,
              readInboxMaxId: Number(t.last_read_inbox_message_id) || 0,
              lastMessage: extractTopicPreview(t.last_message), // v0.91.4
              lastMessageTs: Number(t.last_message?.date) || 0, // v0.91.4
              // v0.95.16: id последнего сообщения топика — нужен для jump-to-end
              // в форумах (как chat.lastMessageId для обычных чатов).
              lastMessageId: t.last_message?.id ? String(t.last_message.id) : null,
            }
          })
          // v0.91.4: диагностика chatUnreadCount vs sumTopicUnread (TDLib агрегирует или нет).
          try { const sumUnread = topics.reduce((s, t) => s + (t.unreadCount || 0), 0); console.log('[forum-be] chatId=' + chatId + ' topicsCount=' + topics.length + ' sumTopicUnread=' + sumUnread + ' chatUnreadCount=' + (tdChat?.unread_count || 0)) } catch (_) {}
          // v0.91.6: custom emoji icons (вернули GramJS-feature). Не блокируем основной
          // ответ — если резолв упал, темы вернутся без iconEmojiUrl (UI fallback на cap).
          try { await resolveTopicEmojis(topics, { client: ctx.client, manager, accountId: ctx.accountId, userDataDir }) } catch (_) {}
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
    _cancelDownload: (params) => cancelDownload({ manager, ...params }),
  }
}
