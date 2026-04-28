// v0.87.85: IPC handlers по чатам + dialog mapping + FLOOD_WAIT throttle.
// Извлечён из telegramHandler.js (Шаг 7/7 разбиения).
// КРИТИЧНО: loadAvatarsAsync содержит throttle 200мс между GetFull* запросами +
// FLOOD_WAIT handler (v0.87.55). НЕ упрощать — иначе вернётся бан Telegram на 26 сек.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { state, chatEntityMap, markReadMaxSent, log, emit, Api } from './telegramState.js'
import { mapMessage, messagePreview } from './telegramMessages.js'
import { collectCleanupStats, performFullWipe } from './telegramCleanup.js'

// v0.87.23: маппер entities MTProto → наш формат (для inline mapDialog при необходимости)
export function mapEntities(entities) {
  if (!Array.isArray(entities)) return []
  return entities.map(e => ({
    type: (e.className || '').replace(/^MessageEntity/, '').toLowerCase(),
    offset: e.offset || 0,
    length: e.length || 0,
    url: e.url || null,
    userId: e.userId ? String(e.userId) : null,
    language: e.language || null,
  }))
}

// v0.87.12: единый маппер dialog → наш формат
export function mapDialog(d) {
  const entity = d.entity || {}
  const type = d.isUser ? 'user' : d.isGroup ? 'group' : d.isChannel ? 'channel' : 'user'
  const id = `${state.currentAccount?.id}:${String(d.id)}`
  // v0.87.14: сохраняем entity для markAsRead / sendMessage — без entity GramJS не знает куда слать
  chatEntityMap.set(id, d.inputEntity || d.entity || d.id)
  return {
    id,
    accountId: state.currentAccount?.id,
    title: d.title || d.name || 'Без названия',
    type,
    // v0.87.28: если нет текста — показываем тип медиа/action, не пустую строку
    lastMessage: messagePreview(d.message),
    lastMessageTs: d.message?.date ? d.message.date * 1000 : 0,
    unreadCount: d.unreadCount || 0,
    rawId: String(d.id),
    hasPhoto: !!(entity.photo && !entity.photo.photoEmpty),
    isOnline: type === 'user' && entity.status?.className === 'UserStatusOnline',
    isBot: !!entity.bot,
    verified: !!entity.verified,
  }
}

// v0.87.14: сохранить кэш чатов на диск — мгновенный старт следующего запуска
// v0.87.16: добавляем avatar пути из существующих файлов — чтобы сразу отображались из кэша
export function saveChatsCache(chats) {
  try {
    if (!state.cachePath) return
    // v0.87.45: НЕ сохраняем unreadCount в кэш (даёт устаревшие цифры после перезапуска).
    // При следующем запуске unreadCount будет 0 до ответа сервера через recomputeGroupedUnread.
    const enriched = chats.map(c => {
      const cleaned = { ...c, unreadCount: 0 }  // счётчик всегда получаем свежий с сервера
      if (cleaned.avatar) return cleaned
      const rawId = c.rawId || String(c.id).split(':').pop()
      const avatarFile = path.join(state.avatarsDir, `${rawId}.jpg`)
      if (fs.existsSync(avatarFile)) {
        return { ...cleaned, avatar: 'file:///' + encodeURI(avatarFile.replace(/\\/g, '/')) }
      }
      return cleaned
    })
    fs.writeFileSync(state.cachePath, JSON.stringify({ accountId: state.currentAccount?.id, chats: enriched, updatedAt: Date.now() }), 'utf8')
  } catch (e) { log('saveChatsCache err: ' + e.message) }
}

// v0.87.12: фоновая загрузка остальных страниц — emit с append: true
export async function loadRestPagesAsync(firstPage) {
  try {
    const PAGE = 200
    let last = firstPage[firstPage.length - 1]
    let offsetDate = last.message?.date || 0
    let offsetId = last.message?.id || 0
    let offsetPeer = last.inputEntity || last.entity
    // v0.87.13: стоп ТОЛЬКО когда пустая страница (не по < PAGE — GramJS часто возвращает меньше)
    for (let i = 0; i < 30; i++) {
      const page = await state.client.getDialogs({ limit: PAGE, offsetDate, offsetId, offsetPeer })
      if (!page.length) { log(`пустая страница на итерации ${i+1}, стоп`); break }
      const chats = page.map(mapDialog)
      emit('tg:chats', { accountId: state.currentAccount?.id, chats, append: true })
      loadAvatarsAsync(page) // v0.87.18: ВСЕ чаты страницы
      last = page[page.length - 1]
      offsetDate = last.message?.date || 0
      offsetId = last.message?.id || 0
      offsetPeer = last.inputEntity || last.entity
    }
    log('все страницы загружены')
  } catch (e) { log('loadRestPages err: ' + e.message) }
}

// v0.87.11: асинхронная загрузка аватарок для чатов — не блокирует UI.
// Аватарки кешируются в %APPDATA%/ЦентрЧатов/tg-avatars/{chatId}.jpg.
// По готовности emit tg:chat-avatar { chatId, avatarPath } — renderer обновит.
// v0.87.55: добавлен throttle 200мс между GetFull* запросами + handler FLOOD_WAIT.
// Раньше при 196 чатах уходило 196 запросов подряд → Telegram банил на 26 секунд.
// КРИТИЧНО: НЕ упрощать throttle и FLOOD_WAIT handler (см. mistakes/electron-core.md).
export async function loadAvatarsAsync(dialogs) {
  if (!state.client || !state.avatarsDir) return
  const stats = { total: dialogs.length, hasPhoto: 0, noPhoto: 0, downloaded: 0, cached: 0, failed: 0, fetched: 0, floodWaits: 0 }

  // v0.87.55: throttle helper — не чаще раза в 200мс + обработка FLOOD_WAIT ошибок.
  let lastReqTs = 0
  const THROTTLE_MS = 200
  async function throttledInvoke(reqFactory) {
    const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastReqTs))
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastReqTs = Date.now()
    try {
      return await state.client.invoke(reqFactory())
    } catch (e) {
      const match = String(e?.message || '').match(/FLOOD_WAIT.*?(\d+)/)
      if (match) {
        const seconds = Number(match[1]) || 30
        stats.floodWaits++
        log(`FLOOD_WAIT ${seconds}s — ждём и продолжаем`)
        await new Promise(r => setTimeout(r, (seconds + 1) * 1000))
        lastReqTs = Date.now()
        return await state.client.invoke(reqFactory())
      }
      throw e
    }
  }

  // v0.87.19: для чатов БЕЗ photo в entity — запрашиваем GetFullChannel/GetFullChat/GetFullUser
  // многие каналы в getDialogs возвращаются без photo, только через Full-запросы
  for (const d of dialogs) {
    try {
      let entity = d.entity
      const chatId = `${state.currentAccount?.id}:${String(d.id)}`
      const avatarPath = path.join(state.avatarsDir, `${String(d.id)}.jpg`)
      if (fs.existsSync(avatarPath)) {
        stats.cached++
        emit('tg:chat-avatar', { chatId, avatarPath: `cc-media://avatars/${encodeURIComponent(path.basename(avatarPath))}` })
        continue
      }
      // v0.87.19: если у entity нет photo — догружаем через GetFull* (throttled)
      if (!entity?.photo || entity.photo.photoEmpty) {
        try {
          if (d.isChannel || d.isGroup) {
            const full = await throttledInvoke(() => new Api.channels.GetFullChannel({ channel: entity || d.inputEntity }))
            const chatWithPhoto = full.chats?.find(c => c.id?.toString() === entity?.id?.toString()) || full.chats?.[0]
            if (chatWithPhoto?.photo && !chatWithPhoto.photo.photoEmpty) {
              entity = chatWithPhoto
              stats.fetched++
            } else { stats.noPhoto++; continue }
          } else if (d.isUser) {
            const full = await throttledInvoke(() => new Api.users.GetFullUser({ id: entity || d.inputEntity }))
            const userWithPhoto = full.users?.find(u => u.id?.toString() === entity?.id?.toString()) || full.users?.[0]
            if (userWithPhoto?.photo && !userWithPhoto.photo.photoEmpty) {
              entity = userWithPhoto
              stats.fetched++
            } else { stats.noPhoto++; continue }
          } else { stats.noPhoto++; continue }
        } catch(fetchErr) { stats.noPhoto++; continue }
      }
      stats.hasPhoto++
      const buffer = await state.client.downloadProfilePhoto(entity, { isBig: false })
      if (!buffer) { stats.failed++; continue }
      fs.writeFileSync(avatarPath, buffer)
      stats.downloaded++
      emit('tg:chat-avatar', { chatId, avatarPath: `cc-media://avatars/${encodeURIComponent(path.basename(avatarPath))}` })
    } catch (e) { stats.failed++; log(`avatar err для ${d.title}: ${e.message}`) }
  }
  log(`аватарки: total=${stats.total} hasPhoto=${stats.hasPhoto} noPhoto=${stats.noPhoto} fetched=${stats.fetched} downloaded=${stats.downloaded} cached=${stats.cached} failed=${stats.failed} floodWaits=${stats.floodWaits}`)
}

// v0.87.24: периодический rescan unread (часть Комбо D вариант A)
// v0.87.26: ФИКС — пагинация до 500 чатов вместо фикса 50.
export async function fetchAllUnreadUpdates(maxPages = 5, pageSize = 100) {
  if (!state.client || !state.currentAccount) return []
  const updates = []
  let offsetDate, offsetId, offsetPeer
  for (let i = 0; i < maxPages; i++) {
    try {
      const page = await state.client.getDialogs({ limit: pageSize, offsetDate, offsetId, offsetPeer })
      if (!page.length) break
      for (const d of page) {
        updates.push({
          id: `${state.currentAccount.id}:${String(d.id)}`,
          unreadCount: d.unreadCount || 0,
        })
      }
      if (page.length < pageSize) break
      const last = page[page.length - 1]
      offsetDate = last.date
      offsetId = last.message?.id
      offsetPeer = last.inputEntity
    } catch (e) { log('rescan page err: ' + e.message); break }
  }
  return updates
}

// v0.87.24+: периодический rescan unread (immediate + каждые 15 сек)
export function startUnreadRescan() {
  if (state.unreadRescanTimer) clearInterval(state.unreadRescanTimer)
  // v0.87.35: immediate rescan при старте чтобы списочные счётчики сразу были точными
  // v0.87.39: логируем rescan только при ИЗМЕНЕНИИ (раньше спамил каждые 15 сек)
  let lastRescanUnread = -1
  const doRescan = async () => {
    if (!state.client || !state.currentAccount) return
    try {
      const updates = await fetchAllUnreadUpdates()
      emit('tg:unread-bulk-sync', { accountId: state.currentAccount.id, updates })
      const withUnread = updates.filter(u => u.unreadCount > 0).length
      if (withUnread !== lastRescanUnread) {
        log(`unread rescan: ${updates.length} чатов (${withUnread} с непрочитанным)`)
        lastRescanUnread = withUnread
      }
    } catch (e) { log('rescan err: ' + e.message) }
  }
  setTimeout(doRescan, 1500)  // immediate sync через 1.5 сек после старта
  state.unreadRescanTimer = setInterval(doRescan, 15000)  // v0.87.35: 15 сек (было 30)
  log('periodic unread rescan запущен (15 сек + immediate)')
}

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
