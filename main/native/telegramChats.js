// v0.87.85: dialog mapping + FLOOD_WAIT throttle + кэш + аватарки + rescan.
// Извлечён из telegramHandler.js (Шаг 7/7 разбиения).
// v0.87.103: IPC handlers вынесены в telegramChatsIpc.js (~250 строк).
// Оставшиеся утилиты экспортируются и используются как из telegramChatsIpc.js так и из telegramMessages.js.
// КРИТИЧНО: loadAvatarsAsync содержит throttle 200мс между GetFull* запросами +
// FLOOD_WAIT handler (v0.87.55). НЕ упрощать — иначе вернётся бан Telegram на 26 сек.
import fs from 'node:fs'
import path from 'node:path'
import { state, chatEntityMap, log, emit, Api } from './telegramState.js'
import { messagePreview } from './telegramMessages.js'

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
// v0.87.105 (ADR-016): accountId передаётся явно (multi-account).
// Backward-compat: без второго аргумента — берём активного аккаунта.
export function mapDialog(d, accountId) {
  const entity = d.entity || {}
  const type = d.isUser ? 'user' : d.isGroup ? 'group' : d.isChannel ? 'channel' : 'user'
  const aid = accountId || state.currentAccount?.id
  const id = `${aid}:${String(d.id)}`
  // v0.87.14: сохраняем entity для markAsRead / sendMessage — без entity GramJS не знает куда слать
  chatEntityMap.set(id, d.inputEntity || d.entity || d.id)
  return {
    id,
    accountId: aid,
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
// v0.87.105 (ADR-016): per-account кэш — tg-cache-{accountId}.json вместо одного файла.
// Backward-compat: без accountId — пишем в общий tg-cache.json (legacy).
export function saveChatsCache(chats, accountId) {
  try {
    const aid = accountId || state.currentAccount?.id
    if (!aid) return
    const cachePath = path.join(path.dirname(state.cachePath), `tg-cache-${aid}.json`)
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
    fs.writeFileSync(cachePath, JSON.stringify({ accountId: aid, chats: enriched, updatedAt: Date.now() }), 'utf8')
  } catch (e) { log('saveChatsCache err: ' + e.message) }
}

// v0.87.12: фоновая загрузка остальных страниц — emit с append: true
// v0.87.105 (ADR-016): client + accountId передаются явно (multi-account)
export async function loadRestPagesAsync(firstPage, client, accountId) {
  try {
    const tgClient = client || state.client
    const aid = accountId || state.currentAccount?.id
    if (!tgClient || !aid) return
    const PAGE = 200
    let last = firstPage[firstPage.length - 1]
    let offsetDate = last.message?.date || 0
    let offsetId = last.message?.id || 0
    let offsetPeer = last.inputEntity || last.entity
    // v0.87.13: стоп ТОЛЬКО когда пустая страница (не по < PAGE — GramJS часто возвращает меньше)
    for (let i = 0; i < 30; i++) {
      const page = await tgClient.getDialogs({ limit: PAGE, offsetDate, offsetId, offsetPeer })
      if (!page.length) { log(`пустая страница на итерации ${i+1}, стоп`); break }
      const chats = page.map(d => mapDialog(d, aid))
      emit('tg:chats', { accountId: aid, chats, append: true })
      loadAvatarsAsync(page, aid) // v0.87.18: ВСЕ чаты страницы
      last = page[page.length - 1]
      offsetDate = last.message?.date || 0
      offsetId = last.message?.id || 0
      offsetPeer = last.inputEntity || last.entity
    }
    log(`все страницы загружены (${aid})`)
  } catch (e) { log('loadRestPages err: ' + e.message) }
}

// v0.87.11: асинхронная загрузка аватарок для чатов — не блокирует UI.
// v0.87.105 (ADR-016): client + accountId передаются явно (multi-account).
// Если не переданы — берём активного (backward-compat).
// Аватарки кешируются в %APPDATA%/ЦентрЧатов/tg-avatars/{chatId}.jpg.
// КРИТИЧНО: throttle 200мс между GetFull* + handler FLOOD_WAIT.
export async function loadAvatarsAsync(dialogs, accountId) {
  const aid = accountId || state.currentAccount?.id
  const tgClient = state.clients.get(aid) || state.client
  if (!tgClient || !state.avatarsDir || !aid) return
  const stats = { total: dialogs.length, hasPhoto: 0, noPhoto: 0, downloaded: 0, cached: 0, failed: 0, fetched: 0, floodWaits: 0 }

  // v0.87.55: throttle helper — не чаще раза в 200мс + обработка FLOOD_WAIT ошибок.
  let lastReqTs = 0
  const THROTTLE_MS = 200
  async function throttledInvoke(reqFactory) {
    const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastReqTs))
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastReqTs = Date.now()
    try {
      return await tgClient.invoke(reqFactory())
    } catch (e) {
      const match = String(e?.message || '').match(/FLOOD_WAIT.*?(\d+)/)
      if (match) {
        const seconds = Number(match[1]) || 30
        stats.floodWaits++
        log(`FLOOD_WAIT ${seconds}s — ждём и продолжаем`)
        await new Promise(r => setTimeout(r, (seconds + 1) * 1000))
        lastReqTs = Date.now()
        return await tgClient.invoke(reqFactory())
      }
      throw e
    }
  }

  // v0.87.19: для чатов БЕЗ photo в entity — запрашиваем GetFullChannel/GetFullChat/GetFullUser
  for (const d of dialogs) {
    try {
      let entity = d.entity
      const chatId = `${aid}:${String(d.id)}`
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
      const buffer = await tgClient.downloadProfilePhoto(entity, { isBig: false })
      if (!buffer) { stats.failed++; continue }
      fs.writeFileSync(avatarPath, buffer)
      stats.downloaded++
      emit('tg:chat-avatar', { chatId, avatarPath: `cc-media://avatars/${encodeURIComponent(path.basename(avatarPath))}` })
    } catch (e) { stats.failed++; log(`avatar err для ${d.title}: ${e.message}`) }
  }
  log(`аватарки(${aid}): total=${stats.total} hasPhoto=${stats.hasPhoto} downloaded=${stats.downloaded} cached=${stats.cached} failed=${stats.failed}`)
}

// v0.87.24: периодический rescan unread (часть Комбо D вариант A)
// v0.87.26: ФИКС — пагинация до 500 чатов вместо фикса 50.
// v0.87.105 (ADR-016): итерируем по ВСЕМ зарегистрированным аккаунтам.
export async function fetchAllUnreadUpdates(maxPages = 5, pageSize = 100) {
  if (state.clients.size === 0) return []
  const updates = []
  for (const [accountId, client] of state.clients.entries()) {
    let offsetDate, offsetId, offsetPeer
    for (let i = 0; i < maxPages; i++) {
      try {
        const page = await client.getDialogs({ limit: pageSize, offsetDate, offsetId, offsetPeer })
        if (!page.length) break
        for (const d of page) {
          updates.push({
            id: `${accountId}:${String(d.id)}`,
            unreadCount: d.unreadCount || 0,
          })
        }
        if (page.length < pageSize) break
        const last = page[page.length - 1]
        offsetDate = last.date
        offsetId = last.message?.id
        offsetPeer = last.inputEntity
      } catch (e) { log(`rescan page err (${accountId}): ${e.message}`); break }
    }
  }
  return updates
}

// v0.87.24+: периодический rescan unread (immediate + каждые 15 сек)
// v0.87.105 (ADR-016): rescan по ВСЕМ аккаунтам, emit без accountId (id уже в каждом update)
export function startUnreadRescan() {
  if (state.unreadRescanTimer) clearInterval(state.unreadRescanTimer)
  let lastRescanUnread = -1
  const doRescan = async () => {
    if (state.clients.size === 0) return
    try {
      const updates = await fetchAllUnreadUpdates()
      // emit без конкретного accountId — каждый update содержит свой id с префиксом
      emit('tg:unread-bulk-sync', { updates })
      const withUnread = updates.filter(u => u.unreadCount > 0).length
      if (withUnread !== lastRescanUnread) {
        log(`unread rescan: ${updates.length} чатов (${withUnread} с непрочитанным) для ${state.clients.size} аккаунт(ов)`)
        lastRescanUnread = withUnread
      }
    } catch (e) { log('rescan err: ' + e.message) }
  }
  setTimeout(doRescan, 1500)
  state.unreadRescanTimer = setInterval(doRescan, 15000)
  log('periodic unread rescan запущен (15 сек + immediate)')
}
