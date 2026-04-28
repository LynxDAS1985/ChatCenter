// v0.87.103: вынесено из telegramChats.js — все IPC handlers (~250 строк).
// В telegramChats.js остались только утилиты (mapping, кэш, аватарки, rescan).
// Содержит: tg:get-cached-chats, tg:mark-read, tg:pin, tg:rescan-unread,
// tg:get-pinned, tg:refresh-avatar, tg:set-typing, tg:get-chats,
// tg:get-cleanup-stats, tg:remove-account.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { state, chatEntityMap, markReadMaxSent, log, emit, Api } from './telegramState.js'
import { mapMessage } from './telegramMessages.js'
import { collectCleanupStats, performFullWipe } from './telegramCleanup.js'
import {
  mapDialog, saveChatsCache, loadRestPagesAsync, loadAvatarsAsync, fetchAllUnreadUpdates,
} from './telegramChats.js'

export function initChatsHandlers() {
  ipcMain.handle('tg:get-cached-chats', async () => {
    try {
      if (!state.cachePath || !fs.existsSync(state.cachePath)) return { ok: true, chats: [] }
      const raw = fs.readFileSync(state.cachePath, 'utf8')
      const data = JSON.parse(raw)
      // v0.87.16: подставляем avatar из файлов если в кэше был undefined
      // v0.87.45: всегда unreadCount=0 из кэша (источник неточности). Точные цифры
      // придут через tg:unread-bulk-sync и tg:grouped-unread после первого rescan.
      const chats = (data.chats || []).map(c => {
        const cleaned = { ...c, unreadCount: 0 }
        if (cleaned.avatar) return cleaned
        const rawId = c.rawId || String(c.id).split(':').pop()
        const avatarFile = path.join(state.avatarsDir, `${rawId}.jpg`)
        if (fs.existsSync(avatarFile)) {
          return { ...cleaned, avatar: 'file:///' + encodeURI(avatarFile.replace(/\\/g, '/')) }
        }
        return cleaned
      })
      log(`tg:get-cached-chats: ${chats.length} чатов, с аватарками: ${chats.filter(c => c.avatar).length}`)
      return { ok: true, chats }
    } catch (e) { return { ok: false, error: e.message, chats: [] } }
  })

  // v0.87.14: пометить чат прочитанным
  // v0.87.37: GUARD — НИКОГДА не уменьшаем maxId! Если отправить markAsRead
  // с maxId меньше предыдущего → сервер СБРАСЫВАЕТ watermark назад →
  // все сообщения после этого id становятся "непрочитанными" → бейдж растёт.
  // Это случалось при скролле к старым сообщениям (IntersectionObserver видел
  // старые msg → readByVisibility → markRead с маленьким maxId).
  ipcMain.handle('tg:mark-read', async (_, { chatId, maxId }) => {
    try {
      if (!state.client) return { ok: false, error: 'Не подключён' }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false, error: 'Чат не найден в кэше' }
      const numMaxId = maxId ? Number(maxId) : 0
      // Guard: не уменьшаем watermark
      const prev = markReadMaxSent.get(chatId) || 0
      if (numMaxId > 0 && numMaxId < prev) {
        log(`mark-read SKIP: chat=${chatId} maxId=${numMaxId} < prev=${prev} (не сбрасываем watermark)`)
        return { ok: true, skipped: true }
      }
      if (numMaxId > prev) markReadMaxSent.set(chatId, numMaxId)
      try {
        await state.client.markAsRead(entity, numMaxId > 0 ? numMaxId : undefined)
        log(`mark-read OK: ${chatId} maxId=${numMaxId || 'all'}`)
      } catch (e1) {
        if (entity.className === 'InputPeerChannel' || entity.channelId) {
          await state.client.invoke(new Api.channels.ReadHistory({ channel: entity, maxId: Number(maxId) || 0 }))
          log(`mark-read через channels.ReadHistory: ${chatId}`)
        } else throw e1
      }
      // v0.87.22: запрашиваем РЕАЛЬНЫЙ unreadCount через getDialogs с нашим peer и emit
      // чтобы UI синхронизировался с тем что реально в Telegram
      setTimeout(async () => {
        try {
          const dialog = await state.client.invoke(new Api.messages.GetPeerDialogs({ peers: [new Api.InputDialogPeer({ peer: entity })] }))
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

  ipcMain.handle('tg:pin', async (_, { chatId, messageId, unpin = false }) => {
    log(`pin: chat=${chatId} msg=${messageId} unpin=${unpin}`)
    try {
      if (!state.client) return { ok: false, error: 'Не подключён' }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      if (unpin) {
        await state.client.unpinMessage(entity, Number(messageId))
        log('pin: unpin OK')
      } else {
        await state.client.pinMessage(entity, Number(messageId), { notify: false, pmOneside: false })
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
      const updates = await fetchAllUnreadUpdates()
      emit('tg:unread-bulk-sync', { accountId: state.currentAccount?.id, updates })
      const withUnread = updates.filter(u => u.unreadCount > 0).length
      log(`manual rescan: ${updates.length} чатов (${withUnread} с непрочитанным)`)
      return { ok: true, count: updates.length }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.17: получить закреплённое сообщение
  ipcMain.handle('tg:get-pinned', async (_, { chatId }) => {
    try {
      if (!state.client) return { ok: false, message: null }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const res = await state.client.invoke(new Api.messages.Search({
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

  // v0.87.17: дозагрузка photo для конкретной entity (для каналов без photo в getDialogs)
  ipcMain.handle('tg:refresh-avatar', async (_, { chatId }) => {
    try {
      if (!state.client) return { ok: false }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false, error: 'нет entity' }
      const rawId = String(chatId).split(':').pop()
      const avatarPath = path.join(state.avatarsDir, `${rawId}.jpg`)
      if (fs.existsSync(avatarPath)) {
        emit('tg:chat-avatar', { chatId, avatarPath: `cc-media://avatars/${encodeURIComponent(path.basename(avatarPath))}` })
        return { ok: true }
      }
      const buffer = await state.client.downloadProfilePhoto(entity, { isBig: false })
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
      if (!state.client) return { ok: false }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false }
      await state.client.invoke(new Api.messages.SetTyping({
        peer: entity,
        action: new Api.SendMessageTypingAction(),
      }))
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('tg:get-chats', async () => {
    try {
      if (!state.client) return { ok: false, error: 'Не подключён', chats: [] }
      log('get-chats: старт')
      const PAGE = 200
      const firstPage = await state.client.getDialogs({ limit: PAGE, folder: 0 })
      // v0.87.23: подробный лог количества
      const unreadCount = firstPage.reduce((sum, d) => sum + (d.unreadCount || 0), 0)
      const withUnread = firstPage.filter(d => d.unreadCount > 0).length
      log(`═══ ДИАЛОГИ АКТИВНЫЕ ═══`)
      log(`загружено: ${firstPage.length} чатов`)
      log(`непрочитанных чатов: ${withUnread}`)
      log(`всего непрочитанных сообщений: ${unreadCount}`)
      log(`═══════════════════════════`)
      // Параллельно асинхронно запросим архив (folderId=1)
      ;(async () => {
        try {
          const archived = await state.client.getDialogs({ limit: PAGE, folder: 1 })
          if (archived.length) {
            const archivedChats = archived.map(d => ({ ...mapDialog(d), archived: true }))
            emit('tg:chats', { accountId: state.currentAccount?.id, chats: archivedChats, append: true })
            const archUnread = archived.reduce((sum, d) => sum + (d.unreadCount || 0), 0)
            log(`═══ АРХИВНЫЕ ═══ загружено=${archived.length}, непрочитанных=${archUnread}`)
            loadAvatarsAsync(archived)
          } else {
            log(`архивных чатов: 0`)
          }
        } catch (e) { log('archived err: ' + e.message) }
      })()
      const firstChats = firstPage.map(mapDialog)
      emit('tg:chats', { accountId: state.currentAccount?.id, chats: firstChats, append: false })
      saveChatsCache(firstChats)  // v0.87.14: кэш для мгновенного старта
      loadAvatarsAsync(firstPage) // v0.87.18: ВСЕ чаты, не только 50

      // v0.87.13: ВСЕГДА пробуем подгрузить ещё страницу (GramJS часто возвращает меньше limit)
      if (firstPage.length > 50) {
        loadRestPagesAsync(firstPage)
      }
      return { ok: true, chats: firstChats, hasMore: firstPage.length > 50 }
    } catch (e) {
      log('get-chats error: ' + e.message)
      return { ok: false, error: e.message, chats: [] }
    }
  })

  // v0.87.95: подсчёт что будет удалено (для предпросмотра в UI до подтверждения)
  ipcMain.handle('tg:get-cleanup-stats', async () => {
    try {
      const stats = collectCleanupStats()
      return { ok: true, ...stats }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('tg:remove-account', async () => {
    try {
      // v0.87.95: запоминаем oldId ДО обнуления — для правильного emit
      const oldId = state.currentAccount?.id || null
      const oldUsername = state.currentAccount?.username || ''

      if (state.client) { try { await state.client.disconnect() } catch(_) {} state.client = null }
      state.currentAccount = null

      // v0.87.95: полная уборка с подсчётом — отчёт в журнал.
      const before = collectCleanupStats()
      const result = performFullWipe()
      log(`logout: removed ${result.totalFiles} files, ${(result.totalBytes / 1024 / 1024).toFixed(1)} MB. Details: ${JSON.stringify(result.byCategory)}`)

      // Проверка что всё реально стёрлось (post-wipe verification)
      const after = collectCleanupStats()
      if (after.totalFiles > 0) {
        log(`logout WARNING: ${after.totalFiles} files left undeleted (locked?). Details: ${JSON.stringify(after.byCategory)}`)
      } else {
        log('logout verification: all clean ✓')
      }

      // v0.87.95: emit с ПРАВИЛЬНЫМ id + детали для toast
      emit('tg:account-update', {
        id: oldId || 'unknown',
        username: oldUsername,
        status: 'disconnected',
        removed: true,
        wipeStats: { totalFiles: result.totalFiles, totalBytes: result.totalBytes, before },
      })
      return { ok: true, totalFiles: result.totalFiles, totalBytes: result.totalBytes }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
}
