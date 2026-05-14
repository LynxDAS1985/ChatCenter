// v0.87.103: вынесено из telegramChats.js — все IPC handlers (~250 строк).
// В telegramChats.js остались только утилиты (mapping, кэш, аватарки, rescan).
// Содержит: tg:get-cached-chats, tg:mark-read, tg:pin, tg:rescan-unread,
// tg:get-pinned, tg:refresh-avatar, tg:set-typing, tg:health-check, tg:get-chats,
// tg:get-cleanup-stats, tg:remove-account, tg:set-mute.
// v0.88.x: forum-topics handlers (tg:get-forum-topics, tg:mark-topic-read) +
// helpers cacheCustomEmojiDocument вынесены в telegramForumTopicsIpc.js
// (этот файл уже был за лимитом 500 строк).
import { ipcMain } from 'electron'
import path from 'node:path'
import { state, chatEntityMap, markReadMaxSent, log, emit, Api, getClientForChat, unregisterAccount } from './telegramState.js'
import { collectCleanupStats, performFullWipe } from './telegramCleanup.js'
import {
  mapDialog, saveChatsCache, loadRestPagesAsync, loadAvatarsAsync, fetchAllUnreadUpdates,
} from './telegramChats.js'

const startupLog = (msg) => log(`[startup-tg] ${msg}`)

export function initChatsHandlers() {
  // v0.87.127: snapshot current accounts for renderer.
  // Prevents event-only restore races when tg:account-update was emitted before UI subscribed.
  ipcMain.handle('tg:get-accounts', async () => {
    try {
      const accounts = Array.from(state.accounts.values())
      return {
        ok: true,
        accounts,
        activeAccountId: state.activeAccountId || accounts[0]?.id || null,
      }
    } catch (e) {
      return { ok: false, error: e.message, accounts: [], activeAccountId: null }
    }
  })

  // Lightweight connection health probe for the "Connections" panel.
  // It intentionally does not load chats, unread counters, avatars or cache.
  ipcMain.handle('tg:health-check', async (_, args) => {
    const requestedAccountId = args?.accountId || null
    const accountIds = requestedAccountId
      ? [requestedAccountId]
      : Array.from(state.clients.keys())

    if (!accountIds.length) {
      return { ok: false, error: 'Нет подключённых аккаунтов', accountStats: [] }
    }

    const accountStats = await Promise.all(accountIds.map(async (accountId) => {
      const startedAt = Date.now()
      const client = state.clients.get(accountId)
      if (!client) {
        return { accountId, ok: false, ms: Date.now() - startedAt, error: 'Клиент не подключен' }
      }
      try {
        await client.getMe()
        return { accountId, ok: true, ms: Date.now() - startedAt }
      } catch (e) {
        return { accountId, ok: false, ms: Date.now() - startedAt, error: e.message }
      }
    }))

    return {
      ok: accountStats.every(s => s.ok),
      accountStats,
    }
  })

  // v0.87.105 (ADR-016): кэш per-account — tg-cache-{id}.json. Читаем все.
  ipcMain.handle('tg:get-cached-chats', async () => {
    try {
      if (!state.cachePath) return { ok: true, chats: [] }
      const dir = path.dirname(state.cachePath)
      const allChats = []

      // Все per-account кэши
      try {
        const files = fs.readdirSync(dir).filter(f => /^tg-cache-tg_\d+\.json$/.test(f))
        for (const f of files) {
          try {
            const raw = fs.readFileSync(path.join(dir, f), 'utf8')
            const data = JSON.parse(raw)
            const chats = (data.chats || []).map(c => enrichChatWithAvatar(c))
            allChats.push(...chats)
          } catch (e) { log(`cache read ${f} err: ${e.message}`) }
        }
      } catch(_) {}

      // Backward-compat: legacy общий tg-cache.json (если ещё не мигрировали)
      if (allChats.length === 0 && fs.existsSync(state.cachePath)) {
        try {
          const raw = fs.readFileSync(state.cachePath, 'utf8')
          const data = JSON.parse(raw)
          const chats = (data.chats || []).map(c => enrichChatWithAvatar(c))
          allChats.push(...chats)
        } catch(_) {}
      }

      log(`tg:get-cached-chats: ${allChats.length} чатов из кэша`)
      return { ok: true, chats: allChats }
    } catch (e) { return { ok: false, error: e.message, chats: [] } }
  })

  function enrichChatWithAvatar(c) {
    const cleaned = { ...c, unreadCount: 0 }  // v0.87.45: всегда unreadCount=0 из кэша
    if (cleaned.avatar) return cleaned
    const rawId = c.rawId || String(c.id).split(':').pop()
    const avatarFile = path.join(state.avatarsDir, `${rawId}.jpg`)
    if (fs.existsSync(avatarFile)) {
      return { ...cleaned, avatar: 'file:///' + encodeURI(avatarFile.replace(/\\/g, '/')) }
    }
    return cleaned
  }

  // v0.87.14: пометить чат прочитанным
  // v0.87.37: GUARD — НИКОГДА не уменьшаем maxId! Если отправить markAsRead
  // с maxId меньше предыдущего → сервер СБРАСЫВАЕТ watermark назад →
  // все сообщения после этого id становятся "непрочитанными" → бейдж растёт.
  // Это случалось при скролле к старым сообщениям (IntersectionObserver видел
  // старые msg → readByVisibility → markRead с маленьким maxId).
  ipcMain.handle('tg:mark-read', async (_, { chatId, maxId, readInboxMaxId }) => {
    try {
      // v0.87.105 (ADR-016): client по chatId — multi-account
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, error: 'Не подключён' }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false, error: 'Чат не найден в кэше' }
      const numMaxId = maxId ? Number(maxId) : 0
      const readCursor = Number(readInboxMaxId || 0)
      if (readCursor > 0 && numMaxId > 0 && numMaxId <= readCursor) {
        log(`mark-read SKIP: chat=${chatId} maxId=${numMaxId} <= readInboxMaxId=${readCursor}`)
        return { ok: true, skipped: true, reason: 'before-read-cursor' }
      }
      // Guard: не уменьшаем watermark
      let prev = markReadMaxSent.get(chatId) || 0
      if (readCursor > 0 && prev > readCursor) {
        log(`mark-read guard reset by server cursor: chat=${chatId} prev=${prev} readInboxMaxId=${readCursor}`)
        prev = readCursor
        markReadMaxSent.set(chatId, readCursor)
      }
      if (numMaxId > 0 && numMaxId < prev) {
        log(`mark-read SKIP: chat=${chatId} maxId=${numMaxId} < prev=${prev} (не сбрасываем watermark)`)
        return { ok: true, skipped: true }
      }
      if (numMaxId > prev) markReadMaxSent.set(chatId, numMaxId)
      try {
        await client.markAsRead(entity, numMaxId > 0 ? numMaxId : undefined)
        log(`mark-read OK: ${chatId} maxId=${numMaxId || 'all'}`)
      } catch (e1) {
        if (entity.className === 'InputPeerChannel' || entity.channelId) {
          await client.invoke(new Api.channels.ReadHistory({ channel: entity, maxId: Number(maxId) || 0 }))
          log(`mark-read через channels.ReadHistory: ${chatId}`)
        } else throw e1
      }
      // v0.87.22: запрашиваем РЕАЛЬНЫЙ unreadCount через getDialogs с нашим peer и emit
      // чтобы UI синхронизировался с тем что реально в Telegram
      setTimeout(async () => {
        try {
          const dialog = await client.invoke(new Api.messages.GetPeerDialogs({ peers: [new Api.InputDialogPeer({ peer: entity })] }))
          const d = dialog.dialogs?.[0]
          if (d) {
            const telegramUnread = d.unreadCount || 0
            emit('tg:chat-unread-sync', { chatId, unreadCount: telegramUnread })
            log(`═══ UNREAD SYNC ═══ chat=${chatId} Telegram сервер=${telegramUnread} unreadMentions=${d.unreadMentionsCount || 0} unreadReactions=${d.unreadReactionsCount || 0}`)
          } else {
            log(`unread-sync: диалог не найден в ответе для ${chatId}`)
          }
        } catch (e) { log('unread-sync err: ' + e.message) }
      }, 800)
      return { ok: true }
    } catch (e) {
      log('mark-read error: ' + e.message)
      return { ok: false, error: e.message }
    }
  })

  // tg:mark-topic-read — см. telegramForumTopicsIpc.js (вынесено в v0.88.x).

  ipcMain.handle('tg:pin', async (_, { chatId, messageId, unpin = false }) => {
    log(`pin: chat=${chatId} msg=${messageId} unpin=${unpin}`)
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, error: 'Не подключён' }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      if (unpin) {
        await client.unpinMessage(entity, Number(messageId))
        log('pin: unpin OK')
      } else {
        await client.pinMessage(entity, Number(messageId), { notify: false, pmOneside: false })
        log('pin: OK')
      }
      return { ok: true }
    } catch (e) {
      log('pin err: ' + e.message)
      // CHAT_ADMIN_REQUIRED — в канале нужны права админа
      if (/CHAT_ADMIN_REQUIRED/i.test(e.message)) {
        return { ok: false, error: 'Нет прав админа для закрепления в этом чате' }
      }
      return { ok: false, error: e.message }
    }
  })

  // v0.87.51: удалён IPC tg:recompute-grouped-unread. UI теперь показывает серверный
  // unreadCount как есть (альбом=N фото). Это то что возвращает Telegram API.

  // v0.87.24: manual sync unread (вызывается из renderer при window.focus)
  // v0.87.26: используем fetchAllUnreadUpdates с пагинацией — раньше было 100 чатов
  ipcMain.handle('tg:rescan-unread', async () => {
    try {
      if (!state.client) return { ok: false }
      const { updates, accountStats } = await fetchAllUnreadUpdates()
      emit('tg:unread-bulk-sync', { accountId: state.currentAccount?.id, updates })
      const withUnread = updates.filter(u => u.unreadCount > 0).length
      log(`manual rescan: ${updates.length} чатов (${withUnread} с непрочитанным)`)
      return { ok: true, count: updates.length, accountStats }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.17: получить закреплённое сообщение
  ipcMain.handle('tg:get-pinned', async (_, { chatId }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, message: null }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const res = await client.invoke(new Api.messages.Search({
        peer: entity,
        q: '',
        filter: new Api.InputMessagesFilterPinned(),
        minDate: 0, maxDate: 0, offsetId: 0, addOffset: 0, limit: 1, maxId: 0, minId: 0, hash: 0,
      }))
      const msgs = (res.messages || []).filter(m => m.className !== 'MessageEmpty')
      if (!msgs[0]) return { ok: true, message: null }
      return { ok: true, message: mapMessage(msgs[0], chatId) }
    } catch (e) { return { ok: false, error: e.message, message: null } }
  })

  // tg:get-forum-topics — см. telegramForumTopicsIpc.js (вынесено в v0.88.x).

  // v0.87.17: дозагрузка photo для конкретной entity (для каналов без photo в getDialogs)
  ipcMain.handle('tg:refresh-avatar', async (_, { chatId }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false, error: 'нет entity' }
      const rawId = String(chatId).split(':').pop()
      const avatarPath = path.join(state.avatarsDir, `${rawId}.jpg`)
      if (fs.existsSync(avatarPath)) {
        emit('tg:chat-avatar', { chatId, avatarPath: `cc-media://avatars/${encodeURIComponent(path.basename(avatarPath))}` })
        return { ok: true }
      }
      const buffer = await client.downloadProfilePhoto(entity, { isBig: false })
      if (!buffer) { log(`refresh-avatar ${chatId}: нет photo`); return { ok: false, error: 'нет фото' } }
      fs.writeFileSync(avatarPath, buffer)
      emit('tg:chat-avatar', { chatId, avatarPath: `cc-media://avatars/${encodeURIComponent(path.basename(avatarPath))}` })
      log(`refresh-avatar ${chatId}: скачано`)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.14: отправка "печатает..." индикатора
  ipcMain.handle('tg:set-typing', async (_, { chatId }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false }
      await client.invoke(new Api.messages.SetTyping({
        peer: entity,
        action: new Api.SendMessageTypingAction(),
      }))
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.105 (ADR-016): tg:get-chats теперь принимает accountId.
  // Если передан — загружаем чаты ОДНОГО аккаунта.
  // Если нет — загружаем для ВСЕХ аккаунтов (multi-account default).
  ipcMain.handle('tg:get-chats', async (_, args) => {
    const startedAt = Date.now()
    try {
      const requestedAccountId = args?.accountId || null
      const accountIds = requestedAccountId
        ? [requestedAccountId]
        : Array.from(state.clients.keys())

      if (accountIds.length === 0) return { ok: false, error: 'Нет подключённых аккаунтов', chats: [] }
      log(`get-chats: старт для ${accountIds.length} аккаунт(ов)`)
      startupLog(`get-chats start requested=${requestedAccountId || 'all'} accounts=${accountIds.join(',')} count=${accountIds.length}`)

      const allFirstChats = []
      const accountStats = []
      for (const accountId of accountIds) {
        const client = state.clients.get(accountId)
        if (!client) continue
        const accountStartedAt = Date.now()
        try {
          await loadChatsForAccount(client, accountId, allFirstChats)
          accountStats.push({ accountId, ok: true, ms: Date.now() - accountStartedAt })
        } catch (e) {
          accountStats.push({ accountId, ok: false, ms: Date.now() - accountStartedAt, error: e.message })
          log(`get-chats(${accountId}) err: ${e.message}`)
        }
      }

      startupLog(`get-chats done requested=${requestedAccountId || 'all'} firstChats=${allFirstChats.length} ms=${Date.now() - startedAt}`)
      return { ok: true, chats: allFirstChats, hasMore: allFirstChats.length > 50, accountStats }
    } catch (e) {
      log('get-chats error: ' + e.message)
      startupLog(`get-chats failed ms=${Date.now() - startedAt} err="${e.message}"`)
      return { ok: false, error: e.message, chats: [] }
    }
  })

  // v0.87.105: загрузка чатов для одного аккаунта — выделено для использования в multi-itetrate
  async function loadChatsForAccount(client, accountId, allFirstChats) {
    const startedAt = Date.now()
    const account = state.accounts.get(accountId)
    if (!account) return
    startupLog(`loadChatsForAccount start account=${accountId} name="${account.name}"`)
    const PAGE = 200
    const firstPage = await client.getDialogs({ limit: PAGE, folder: 0 })
    const unreadCount = firstPage.reduce((sum, d) => sum + (d.unreadCount || 0), 0)
    const withUnread = firstPage.filter(d => d.unreadCount > 0).length
    log(`═══ ДИАЛОГИ АКТИВНЫЕ (${account.name}) ═══`)
    log(`загружено: ${firstPage.length} чатов, непрочит. чатов=${withUnread} сообщ=${unreadCount}`)
    // Архивные параллельно
    ;(async () => {
      try {
        const archived = await client.getDialogs({ limit: PAGE, folder: 1 })
        if (archived.length) {
          const archivedChats = archived.map(d => ({ ...mapDialog(d, accountId), archived: true }))
          emit('tg:chats', { accountId, chats: archivedChats, append: true })
          loadAvatarsAsync(archived, accountId)
        }
      } catch (e) { log(`archived(${account.name}) err: ${e.message}`) }
    })()
    const firstChats = firstPage.map(d => mapDialog(d, accountId))
    emit('tg:chats', { accountId, chats: firstChats, append: false })
    saveChatsCache(firstChats, accountId)
    startupLog(`loadChatsForAccount firstPage account=${accountId} chats=${firstPage.length} unreadChats=${withUnread} unreadMsgs=${unreadCount} ms=${Date.now() - startedAt}`)
    loadAvatarsAsync(firstPage, accountId)
    if (firstPage.length > 50) {
      loadRestPagesAsync(firstPage, client, accountId)
    }
    if (allFirstChats) allFirstChats.push(...firstChats)
    startupLog(`loadChatsForAccount done account=${accountId} returned=${firstChats.length} ms=${Date.now() - startedAt}`)
  }

  // v0.87.95: подсчёт что будет удалено (для предпросмотра в UI до подтверждения)
  ipcMain.handle('tg:get-cleanup-stats', async () => {
    try {
      const stats = collectCleanupStats()
      return { ok: true, ...stats }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // v0.87.105 (ADR-016): logout одного аккаунта или всех (если accountId не передан)
  ipcMain.handle('tg:remove-account', async (_, args) => {
    try {
      const requestedId = args?.accountId || null
      // Если не передан — для backward-compat — удаляем АКТИВНЫЙ
      const targetIds = requestedId
        ? [requestedId]
        : (state.activeAccountId ? [state.activeAccountId] : [])

      if (!targetIds.length) return { ok: false, error: 'Нет аккаунта для удаления' }

      const results = []
      for (const accountId of targetIds) {
        const client = state.clients.get(accountId)
        const account = state.accounts.get(accountId)
        const oldUsername = account?.username || ''

        if (client) { try { await client.disconnect() } catch(_) {} }

        // Удаляем из Maps (state.client / state.currentAccount обновятся автоматом)
        unregisterAccount(accountId)

        // v0.87.105: per-account wipe — удаляем только сессию ЭТОГО аккаунта.
        // Общие файлы (avatars, cache) трогаем только если это БЫЛ ПОСЛЕДНИЙ аккаунт.
        const isLast = state.clients.size === 0
        const before = collectCleanupStats()
        const result = isLast ? performFullWipe() : performAccountWipe(accountId)
        log(`logout(${accountId}): removed ${result.totalFiles} files, ${(result.totalBytes / 1024 / 1024).toFixed(1)} MB${isLast ? ' (FULL)' : ' (per-account)'}`)

        emit('tg:account-update', {
          id: accountId,
          username: oldUsername,
          status: 'disconnected',
          removed: true,
          wipeStats: { totalFiles: result.totalFiles, totalBytes: result.totalBytes, before, isLast },
        })
        results.push({ accountId, totalFiles: result.totalFiles, totalBytes: result.totalBytes, isLast })
      }
      return { ok: true, results }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // v0.87.109: заглушить / включить уведомления чата
  // muteUntil=0 → включить; 2147483647 → навсегда; иначе unix timestamp
  ipcMain.handle('tg:set-mute', async (_, { chatId, muteUntil }) => {
    try {
      const client = getClientForChat(chatId)
      if (!client) return { ok: false, error: 'Не подключён' }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false, error: 'Чат не найден' }
      await client.invoke(new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer: entity }),
        settings: new Api.InputPeerNotifySettings({
          muteUntil: muteUntil || 0,
          showPreviews: true,
          silent: false,
        }),
      }))
      log(`set-mute: chat=${chatId} muteUntil=${muteUntil}`)
      return { ok: true }
    } catch (e) {
      log('set-mute err: ' + e.message)
      return { ok: false, error: e.message }
    }
  })
}

// v0.87.105: удалить только файлы конкретного аккаунта (когда есть другие активные)
function performAccountWipe(accountId) {
  const result = { totalFiles: 0, totalBytes: 0, byCategory: {} }
  try {
    const sessionFile = path.join(state.sessionsDir, `${accountId}.txt`)
    if (fs.existsSync(sessionFile)) {
      const size = fs.statSync(sessionFile).size
      fs.unlinkSync(sessionFile)
      result.totalFiles++
      result.totalBytes += size
      result.byCategory.session = { files: 1, bytes: size }
    }
  } catch(e) { log('per-account wipe err: ' + e.message) }
  return result
}
