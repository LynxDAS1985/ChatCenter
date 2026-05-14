// v0.89.0 — Stage 4 / Этап 2.2: TDLib Client Manager (multi-account)
//
// Управляет жизненным циклом TDLib клиентов, по одному на каждый Telegram-аккаунт.
// Подписывается на обновления TDLib (updateUser, updateChat, updateNewMessage и т.п.),
// поддерживает кэш users/chats, маршрутизирует события наверх через простой EventEmitter.
//
// АРХИТЕКТУРА:
//   - Map<accountId, { client, userCache, chatCache, authState, params }>
//   - userCache: Map<userId, TDLib user>     ← заполняется через updateUser
//   - chatCache: Map<chatId, TDLib chat>     ← заполняется через updateNewChat / updateChatTitle / etc
//   - При updateNewMessage → mapMessage + senderName/avatar из cache → emit 'message:new'
//
// ОСОБЕННОСТЬ TDLIB: messages приходят БЕЗ senderName — TDLib хранит users/chats
// отдельной таблицей и пересылает их через `updateUser` events ещё ДО первого
// сообщения. К моменту прихода updateNewMessage cache уже заполнен.
//
// ТЕСТИРУЕМОСТЬ: clientFactory параметризуется (по умолчанию tdl.createClient).
// В vitest подменяем на mock, чтобы не запускать настоящее TDLib-соединение.

import { EventEmitter } from 'node:events'
import { mapMessage, mapChat } from './tdlibMapper.js'

// ──────────────────────────────────────────────────────────────────────
// USER NAME / AVATAR HELPERS
// ──────────────────────────────────────────────────────────────────────

// TDLib user: { id, first_name, last_name, usernames: { active_usernames }, profile_photo }
export function userDisplayName(user) {
  if (!user) return ''
  const first = user.first_name || ''
  const last = user.last_name || ''
  const composed = `${first} ${last}`.trim()
  if (composed) return composed
  const uname = user.usernames?.active_usernames?.[0]
  return uname ? `@${uname}` : ''
}

// TDLib chat title fallback
export function chatDisplayName(chat) {
  if (!chat) return ''
  return chat.title || ''
}

// ──────────────────────────────────────────────────────────────────────
// CLIENT MANAGER
// ──────────────────────────────────────────────────────────────────────

export class TdlibClientManager extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {(params: object) => object} [opts.clientFactory] — функция-фабрика
   *   клиента (по умолчанию tdl.createClient). Тесты подменяют на mock.
   */
  constructor(opts = {}) {
    super()
    // v0.89.0 / Этап 3.9: каждая параллельная downloadFile подписывается на 'file:update'.
    // При открытии чата с 20 фото — 20 listeners. Default limit 10 → MaxListenersExceededWarning.
    // Не утечка — listeners снимаются после resolve. Просто увеличиваем лимит.
    this.setMaxListeners(opts.maxListeners || 100)
    this.accounts = new Map()
    this.clientFactory = opts.clientFactory || null
    // fileId → { accountId, kind: 'chat'|'user', ownerId } — для аватарок которые
    // в момент updateNewChat ещё не были скачаны, ждут updateFile с completed=true.
    this._pendingAvatars = new Map()
  }

  /**
   * Создаёт аккаунт и подключает event listeners.
   * НЕ запускает login flow — это отдельный этап (Этап 2.3).
   *
   * @param {string} accountId — например 'tg_638454350'
   * @param {object} clientParams — параметры для clientFactory (apiId, apiHash, tdlibParameters, ...)
   * @returns {object} — внутренняя запись аккаунта
   */
  createAccount(accountId, clientParams) {
    if (!accountId) throw new Error('accountId required')
    if (this.accounts.has(accountId)) return this.accounts.get(accountId)
    if (!this.clientFactory) throw new Error('clientFactory not configured')

    const client = this.clientFactory(clientParams)
    const record = {
      accountId,
      client,
      userCache: new Map(),
      chatCache: new Map(),
      authState: null,
      params: clientParams,
    }
    this.accounts.set(accountId, record)
    this._wireClient(record)
    return record
  }

  /**
   * Удаляет аккаунт. Останавливает клиент через client.close().
   */
  async removeAccount(accountId) {
    const record = this.accounts.get(accountId)
    if (!record) return false
    try { await record.client.close?.() } catch (_) {}
    this.accounts.delete(accountId)
    this.emit('account:removed', { accountId })
    return true
  }

  /** @returns {Array<string>} список accountId */
  listAccounts() {
    return Array.from(this.accounts.keys())
  }

  /**
   * Ждёт пока auth state аккаунта станет `authorizationStateReady`.
   * Используется после autoRestore — TDLib читает БД и через несколько мс
   * присылает Ready (если сессия валидна). Если sessions partial/invalid —
   * приходит WaitPhoneNumber/WaitCode/etc → reject с этим состоянием.
   *
   * @param {string} accountId
   * @param {number} [timeoutMs=15000]
   * @returns {Promise<{ok: boolean, state?: string, error?: string}>}
   */
  waitForReady(accountId, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const current = this.getAuthState(accountId)
      if (current === 'authorizationStateReady') return resolve({ ok: true, state: current })
      let done = false
      const handler = (p) => {
        if (done || p.accountId !== accountId) return
        if (p.state === 'authorizationStateReady') {
          done = true
          clearTimeout(timer)
          this.off('account:auth-state', handler)
          resolve({ ok: true, state: p.state })
        } else if (p.state && p.state.startsWith('authorizationStateWait')
                && p.state !== 'authorizationStateWaitTdlibParameters'
                && p.state !== 'authorizationStateWaitEncryptionKey') {
          // Sessions требует повторный login (code/password/phone) — не ready
          done = true
          clearTimeout(timer)
          this.off('account:auth-state', handler)
          resolve({ ok: false, state: p.state, error: 'need-relogin' })
        } else if (p.state === 'authorizationStateClosed' || p.state === 'authorizationStateLoggingOut') {
          done = true
          clearTimeout(timer)
          this.off('account:auth-state', handler)
          resolve({ ok: false, state: p.state, error: 'closed' })
        }
      }
      const timer = setTimeout(() => {
        if (done) return
        done = true
        this.off('account:auth-state', handler)
        resolve({ ok: false, state: this.getAuthState(accountId), error: 'timeout' })
      }, timeoutMs)
      this.on('account:auth-state', handler)
    })
  }

  /**
   * Финализирует залогиненный аккаунт: getMe → rename → emit account:update.
   * Используется после login flow и после autoRestoreSessionsFromDisk
   * (когда session валидна и сразу пришёл Ready).
   *
   * @param {string} accountId — текущий id в Map (обычно 'pending' или 'tg_pending_X')
   * @returns {Promise<{ok: boolean, newAccountId?: string, error?: string}>}
   */
  async finalizeAccount(accountId) {
    const client = this.getClient(accountId)
    if (!client?.invoke) return { ok: false, error: 'no client' }
    try {
      const me = await client.invoke({ '@type': 'getMe' })
      const userId = me?.id
      if (!userId) return { ok: false, error: 'getMe returned no id' }
      const newAccountId = `tg_${userId}`
      const renamed = (newAccountId !== accountId) ? this._renameAccount(accountId, newAccountId) : true
      const finalId = renamed ? newAccountId : accountId
      const fullName = `${me.first_name || ''} ${me.last_name || ''}`.trim()
      const username = me.usernames?.active_usernames?.[0] || ''
      this.emit('account:update', {
        id: finalId,
        messenger: 'telegram',
        status: 'connected',
        name: fullName || (username ? `@${username}` : ''),
        phone: me.phone_number ? `+${me.phone_number}` : '',
        username,
        userId: String(userId),
      })
      return { ok: true, newAccountId: finalId }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) }
    }
  }

  /**
   * Переименовывает аккаунт. Используется после успешного логина:
   * tg_pending_${ts} → tg_${realUserId}. Папка sessions на диске НЕ
   * переименовывается (TDLib держит файлы открытыми), это работает
   * в памяти Map; metadata-файл для autoRestore — задача отдельного этапа.
   *
   * @param {string} oldId
   * @param {string} newId
   * @returns {boolean} — true если rename удался, false если oldId не найден
   */
  _renameAccount(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return false
    const record = this.accounts.get(oldId)
    if (!record) return false
    if (this.accounts.has(newId)) return false  // целевое имя занято
    record.accountId = newId
    this.accounts.delete(oldId)
    this.accounts.set(newId, record)
    this.emit('account:renamed', { oldId, newId })
    return true
  }

  /** @returns {object|null} клиент TDLib для аккаунта */
  getClient(accountId) {
    return this.accounts.get(accountId)?.client || null
  }

  /** Cached user lookup (по accountId + userId TDLib) */
  getUserCached(accountId, userId) {
    if (userId == null) return null
    return this.accounts.get(accountId)?.userCache.get(Number(userId)) || null
  }

  /** Cached chat lookup */
  getChatCached(accountId, chatId) {
    if (chatId == null) return null
    return this.accounts.get(accountId)?.chatCache.get(Number(chatId)) || null
  }

  /** @returns {'waiting'|'ready'|'closed'|null} текущее состояние авторизации */
  getAuthState(accountId) {
    return this.accounts.get(accountId)?.authState || null
  }

  // ──────────────────────────────────────────────────────────────
  // PRIVATE: TDLib event handlers
  // ──────────────────────────────────────────────────────────────

  _wireClient(record) {
    const { client, accountId } = record
    if (!client?.on) return

    client.on('update', (update) => this._handleUpdate(record, update))
    client.on('error', (err) => this.emit('account:error', { accountId, error: err }))
  }

  _handleUpdate(record, update) {
    if (!update || typeof update !== 'object') return
    const type = update['@type']
    const { accountId } = record

    switch (type) {
      case 'updateAuthorizationState':
        this._handleAuthState(record, update.authorization_state)
        return

      case 'updateUser':
        // TDLib пушит User объекты целиком при изменениях. Каждый раз заменяем целиком.
        if (update.user?.id != null) {
          record.userCache.set(Number(update.user.id), update.user)
          // v0.89.0 / Этап 3.9: фоновая загрузка аватарки пользователя
          this._scheduleAvatarDownload(record, 'user', update.user.id, update.user.profile_photo?.small)
        }
        return

      case 'updateNewChat':
        if (update.chat?.id != null) {
          record.chatCache.set(Number(update.chat.id), update.chat)
          // v0.89.0 / Этап 3.9: фоновая загрузка аватарки чата
          this._scheduleAvatarDownload(record, 'chat', update.chat.id, update.chat.photo?.small)
        }
        return

      case 'updateChatTitle':
      case 'updateChatPhoto':
      case 'updateChatPermissions':
      case 'updateChatLastMessage':
      case 'updateChatPosition':
      case 'updateChatReadInbox':
      case 'updateChatReadOutbox':
      case 'updateChatUnreadMentionCount':
      case 'updateChatNotificationSettings':
      case 'updateChatIsMarkedAsUnread':
      case 'updateChatHasScheduledMessages':
        // Patch существующего chat в cache (если есть).
        this._patchChat(record, update)
        return

      case 'updateNewMessage':
        this._handleNewMessage(record, update.message)
        return

      case 'updateMessageEdited': {
        const cached = record.chatCache.get(Number(update.chat_id))
        this.emit('message:edited', {
          accountId, chatId: `${accountId}:${update.chat_id}`,
          messageId: String(update.message_id), editDate: update.edit_date,
          chat: cached,
        })
        return
      }

      case 'updateMessageContent':
        this.emit('message:content-updated', {
          accountId, chatId: `${accountId}:${update.chat_id}`,
          messageId: String(update.message_id),
          newContent: update.new_content,
        })
        return

      case 'updateDeleteMessages':
        if (update.is_permanent) {
          this.emit('message:deleted', {
            accountId, chatId: `${accountId}:${update.chat_id}`,
            messageIds: (update.message_ids || []).map(String),
          })
        }
        return

      case 'updateUserStatus':
        this.emit('user:status', {
          accountId, userId: String(update.user_id),
          status: update.status?.['@type'] || null,
        })
        return

      case 'updateConnectionState':
        this.emit('account:connection', {
          accountId, state: update.state?.['@type'] || null,
        })
        return

      case 'updateFile':
        // TDLib присылает updateFile при изменении статуса файла:
        // - При запуске downloadFile (provisional)
        // - На каждом chunk прогресса (local.downloaded_size растёт)
        // - При завершении (local.is_downloading_completed = true, local.path = реальный путь)
        // tdlibMedia слушает это событие для реализации downloadFile-promise + onProgress.
        this.emit('file:update', { accountId, file: update.file })
        // v0.89.0 / Этап 3.9: если это аватарка из _pendingAvatars и она готова — эмитим
        this._handleAvatarReady(record, update.file)
        return

      default:
        // Прокидываем сырое update — для редких типов и диагностики.
        this.emit('update:raw', { accountId, update })
    }
  }

  _handleAuthState(record, authState) {
    if (!authState) return
    const type = authState['@type'] || null
    record.authState = type
    this.emit('account:auth-state', {
      accountId: record.accountId,
      state: type,
      payload: authState,
    })
  }

  _patchChat(record, update) {
    const chatId = Number(update.chat_id)
    if (!record.chatCache.has(chatId)) return
    const chat = record.chatCache.get(chatId)
    // Применяем patch в зависимости от типа update
    const type = update['@type']
    if (type === 'updateChatTitle') chat.title = update.title
    else if (type === 'updateChatPhoto') chat.photo = update.photo
    else if (type === 'updateChatPermissions') chat.permissions = update.permissions
    else if (type === 'updateChatLastMessage') chat.last_message = update.last_message
    else if (type === 'updateChatReadInbox') {
      chat.last_read_inbox_message_id = update.last_read_inbox_message_id
      chat.unread_count = update.unread_count
    }
    else if (type === 'updateChatReadOutbox') chat.last_read_outbox_message_id = update.last_read_outbox_message_id
    else if (type === 'updateChatNotificationSettings') chat.notification_settings = update.notification_settings
    else if (type === 'updateChatIsMarkedAsUnread') chat.is_marked_as_unread = update.is_marked_as_unread
    else if (type === 'updateChatUnreadMentionCount') chat.unread_mention_count = update.unread_mention_count
    else if (type === 'updateChatHasScheduledMessages') chat.has_scheduled_messages = update.has_scheduled_messages

    record.chatCache.set(chatId, chat)
    // Также эмитим высокоуровневое событие для UI sync
    if (type === 'updateChatReadInbox') {
      this.emit('chat:unread-sync', {
        accountId: record.accountId,
        chatId: `${record.accountId}:${update.chat_id}`,
        unreadCount: update.unread_count,
      })
    }
  }

  // ──────────────────────────────────────────────────────────────
  // AVATARS (chat / user profile photos)
  // ──────────────────────────────────────────────────────────────

  /**
   * Запускает фоновую загрузку аватарки (low priority).
   * Если photo уже скачана (local.is_downloading_completed=true) — мгновенно эмитит.
   * Иначе сохраняет fileId → mapping в _pendingAvatars и ждёт updateFile.
   */
  _scheduleAvatarDownload(record, kind, ownerId, photoFile) {
    if (!photoFile?.id) return
    const fileId = Number(photoFile.id)
    if (photoFile.local?.is_downloading_completed && photoFile.local?.path) {
      this._emitAvatarReady(record, kind, ownerId, photoFile.local.path)
      return
    }
    // Запросить downloadFile (low priority — UI не критичен)
    this._pendingAvatars.set(fileId, { accountId: record.accountId, kind, ownerId: Number(ownerId) })
    if (record.client?.invoke) {
      record.client.invoke({
        '@type': 'downloadFile', file_id: fileId, priority: 1,
        offset: 0, limit: 0, synchronous: false,
      }).then((r) => {
        // Если файл уже был скачан — invoke сразу вернёт complete file
        if (r?.local?.is_downloading_completed && r.local.path) {
          this._handleAvatarReady(record, r)
        }
      }).catch(() => { /* silent — TDLib может вернуть FILE_REFERENCE_INVALID и т.п. */ })
    }
  }

  _handleAvatarReady(record, file) {
    if (!file?.id || !file.local?.is_downloading_completed || !file.local?.path) return
    const pending = this._pendingAvatars.get(Number(file.id))
    if (!pending) return
    if (pending.accountId !== record.accountId) return
    this._pendingAvatars.delete(Number(file.id))
    this._emitAvatarReady(record, pending.kind, pending.ownerId, file.local.path)
  }

  _emitAvatarReady(record, kind, ownerId, absPath) {
    const accountId = record.accountId
    // Используем file:// для UI — Electron security разрешает file: только если webPreferences
    // позволяет, или через custom protocol. У нас уже есть cc-media:// — но он привязан
    // к фиксированным sub-folders. Для TDLib files используем file:// (работает в Electron
    // при настройках по умолчанию для main BrowserWindow). Если не сработает — fallback
    // на cc-media:// с дополнительным sub-protocol в отдельном этапе.
    const url = 'file:///' + encodeURI(absPath.replace(/\\/g, '/'))
    if (kind === 'chat') {
      this.emit('chat:avatar', { accountId, chatId: `${accountId}:${ownerId}`, avatarPath: url })
    } else if (kind === 'user') {
      this.emit('user:avatar', { accountId, userId: String(ownerId), avatarPath: url })
    }
  }

  _handleNewMessage(record, tdMsg) {
    if (!tdMsg) return
    const { accountId } = record
    const chatIdStr = `${accountId}:${tdMsg.chat_id}`

    // Извлекаем senderName / senderAvatar из cache
    const senderId = tdMsg.sender_id
    let senderName = ''
    let senderAvatar = null
    if (senderId?.['@type'] === 'messageSenderUser') {
      const user = record.userCache.get(Number(senderId.user_id))
      senderName = userDisplayName(user)
      // senderAvatar заполнится в Этапе 2.5 (downloadFile через TDLib events)
    } else if (senderId?.['@type'] === 'messageSenderChat') {
      const chat = record.chatCache.get(Number(senderId.chat_id))
      senderName = chatDisplayName(chat)
    }

    const nativeMsg = mapMessage(tdMsg, chatIdStr, { senderName, senderAvatar })
    this.emit('message:new', { accountId, chatId: chatIdStr, message: nativeMsg })
  }

  // ──────────────────────────────────────────────────────────────
  // HELPERS для UI / IPC
  // ──────────────────────────────────────────────────────────────

  /**
   * Возвращает список чатов аккаунта в нашем формате (Chat[]).
   * Без сетевого запроса — из локального кэша TDLib (заполняется через
   * updateNewChat events во время initial sync).
   */
  getAccountChats(accountId) {
    const record = this.accounts.get(accountId)
    if (!record) return []
    const result = []
    for (const tdChat of record.chatCache.values()) {
      const mapped = mapChat(tdChat, accountId)
      if (mapped) result.push(mapped)
    }
    return result
  }
}

// Singleton (одна на процесс) — экспортируется отдельно при инициализации.
let _instance = null

export function getTdlibManager() { return _instance }
export function setTdlibManager(manager) { _instance = manager }
