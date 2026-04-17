// v0.87.3: Реальный GramJS клиент для Telegram MTProto.
// Авторизация phone → code → password (2FA) через промисифицированные колбеки.
// Session хранится в %APPDATA%/ЦентрЧатов/tg-session.txt (обычный файл пока без шифрования).
// IPC каналы: tg:login-start/code/password/cancel, tg:get-chats, tg:get-messages,
// tg:send-message, tg:remove-account. События: tg:account-update, tg:login-step,
// tg:chats, tg:messages, tg:new-message.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { NewMessage } from 'telegram/events/index.js'
import { Api } from 'telegram'
import { strippedPhotoToJpg } from 'telegram/Utils.js'

// api_id / api_hash зашиты — ChatCenter (Demo33) app на my.telegram.org
const API_ID = 8392940
const API_HASH = '33a9605b6f86a176e240cc141e864bf5'

let client = null
let getMainWindowFn = null
let sessionPath = null
let avatarsDir = null
let cachePath = null      // v0.87.14: JSON-кэш чатов для мгновенного старта
let pendingLogin = null
let currentAccount = null
const chatEntityMap = new Map()  // v0.87.14: chatId → entity (для markAsRead / sendMessage)

const log = (msg) => { try { console.log('[tg]', msg) } catch(_) {} }

// v0.87.5: перевод типичных ошибок GramJS/Telegram на понятный русский
function translateTelegramError(raw) {
  if (!raw) return 'Неизвестная ошибка'
  const s = String(raw)
  const map = [
    [/PHONE_NUMBER_INVALID/i, 'Неверный формат номера. Введите в формате +79001234567'],
    [/PHONE_NUMBER_BANNED/i, 'Этот номер забанен в Telegram. Обратитесь в поддержку Telegram'],
    [/PHONE_NUMBER_FLOOD/i, 'Слишком много попыток с этого номера. Попробуйте через несколько часов'],
    [/PHONE_NUMBER_UNOCCUPIED/i, 'Этот номер не зарегистрирован в Telegram. Сначала создайте аккаунт через приложение Telegram'],
    [/PHONE_CODE_INVALID/i, 'Неверный код. Проверьте что ввели правильно (код из Telegram, не SMS если есть Telegram)'],
    [/PHONE_CODE_EXPIRED/i, 'Срок кода истёк. Нажмите «Отмена» и запросите новый'],
    [/PHONE_CODE_EMPTY/i, 'Код не введён'],
    [/PASSWORD_HASH_INVALID/i, 'Неверный облачный пароль. Проверьте раскладку и Caps Lock'],
    [/SESSION_PASSWORD_NEEDED/i, 'Требуется облачный пароль Telegram (2FA)'],
    // FLOOD_WAIT может приходить в разных форматах от GramJS
    [/FLOOD_WAIT_(\d+)/i, (m) => `⏱ Слишком много попыток. Подождите ${formatSeconds(parseInt(m[1]))} и попробуйте снова.\n\nTelegram временно блокирует новые коды с этого номера, чтобы защитить аккаунт.`],
    [/A wait of (\d+) seconds is required/i, (m) => `⏱ Слишком много попыток. Подождите ${formatSeconds(parseInt(m[1]))} и попробуйте снова.\n\nTelegram временно блокирует новые коды с этого номера, чтобы защитить аккаунт.`],
    [/wait of (\d+) seconds/i, (m) => `⏱ Подождите ${formatSeconds(parseInt(m[1]))} перед следующей попыткой.`],
    [/API_ID_INVALID/i, 'Ошибка приложения ChatCenter. Свяжитесь с разработчиком'],
    [/AUTH_KEY_UNREGISTERED/i, 'Сессия устарела. Нажмите «Отмена» и войдите заново'],
    [/AUTH_KEY_DUPLICATED/i, 'Этот аккаунт используется в другой копии программы'],
    [/NETWORK|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i, 'Нет подключения к серверам Telegram. Проверьте интернет и отключите VPN если есть'],
    [/disconnected|CONNECTION_NOT_INITED/i, 'Соединение с Telegram прервано. Попробуйте ещё раз'],
    [/CODE_HASH_INVALID|PHONE_CODE_HASH_EMPTY/i, 'Ошибка авторизации. Нажмите «Отмена» и начните заново'],
    [/USER_DEACTIVATED/i, 'Аккаунт удалён'],
    [/Отменено пользователем/i, 'Авторизация отменена'],
  ]
  for (const [re, repl] of map) {
    const m = s.match(re)
    if (m) return typeof repl === 'function' ? repl(m) : repl
  }
  return 'Ошибка Telegram: ' + s.slice(0, 200)
}

function formatSeconds(sec) {
  if (sec < 60) return `${sec} секунд`
  if (sec < 3600) return `${Math.round(sec / 60)} минут`
  return `${Math.round(sec / 3600)} часов`
}

export function initTelegramHandler({ getMainWindow, userDataPath }) {
  getMainWindowFn = getMainWindow
  sessionPath = path.join(userDataPath, 'tg-session.txt')
  avatarsDir = path.join(userDataPath, 'tg-avatars')
  cachePath = path.join(userDataPath, 'tg-cache.json')
  try { fs.mkdirSync(avatarsDir, { recursive: true }) } catch(_) {}
  log(`init, session=${sessionPath}, avatars=${avatarsDir}, cache=${cachePath}`)

  // v0.87.27 / v0.87.35: авто-очистка старых медиа при старте — по возрасту + LRU-квоте (2 ГБ)
  try {
    const mediaDir = path.join(userDataPath, 'tg-media')
    if (fs.existsSync(mediaDir)) {
      const MAX_AGE = 30 * 86400000  // 30 дней
      const MAX_BYTES = 2 * 1024 * 1024 * 1024  // 2 ГБ квота
      const cutoff = Date.now() - MAX_AGE
      const entries = []
      for (const f of fs.readdirSync(mediaDir)) {
        const fp = path.join(mediaDir, f)
        try {
          const st = fs.statSync(fp)
          entries.push({ fp, size: st.size, mtime: st.mtimeMs })
        } catch(_) {}
      }
      let removed = 0, freed = 0
      // По возрасту
      for (const e of entries) {
        if (e.mtime < cutoff) {
          try { fs.unlinkSync(e.fp); freed += e.size; removed++; e.deleted = true } catch(_) {}
        }
      }
      // LRU квота
      const rem = entries.filter(e => !e.deleted).sort((a, b) => a.mtime - b.mtime)
      let total = rem.reduce((s, e) => s + e.size, 0)
      for (const e of rem) {
        if (total <= MAX_BYTES) break
        try { fs.unlinkSync(e.fp); total -= e.size; freed += e.size; removed++ } catch(_) {}
      }
      if (removed > 0) log(`auto cleanup: removed=${removed} freed=${(freed/1024/1024).toFixed(1)}MB keep=${(total/1024/1024).toFixed(1)}MB`)
    }
  } catch(_) {}

  // v0.87.12: дожидаемся когда renderer точно готов принять events
  const startRestore = () => {
    const win = getMainWindowFn?.()
    if (!win || win.isDestroyed()) {
      setTimeout(startRestore, 500)
      return
    }
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => {
        setTimeout(() => autoRestoreSession().catch(e => log('autoRestore error: ' + e.message)), 500)
      })
    } else {
      autoRestoreSession().catch(e => log('autoRestore error: ' + e.message))
    }
  }
  setTimeout(startRestore, 1000)

  ipcMain.handle('tg:login-start', async (_, { phone }) => {
    try {
      if (pendingLogin) {
        return { ok: false, error: 'Авторизация уже в процессе. Сначала отмените текущую.' }
      }
      return await startLogin(phone)
    } catch (e) {
      log('login-start error: ' + e.message)
      pendingLogin = null
      emit('tg:login-step', { step: 'phone', error: e.message })
      return { ok: false, error: e.message }
    }
  })

  // v0.87.10: упрощённый IPC — сразу { ok: true } после передачи в pending.
  // Результат (success / 2FA / error) приходит через tg:login-step events.
  ipcMain.handle('tg:login-code', async (_, { code }) => {
    log('IPC tg:login-code')
    if (!pendingLogin?.codeResolve) return { ok: false, error: 'Нет активного шага ввода кода' }
    const resolve = pendingLogin.codeResolve
    pendingLogin.codeResolve = null
    resolve(code)
    return { ok: true }
  })

  ipcMain.handle('tg:login-password', async (_, { password }) => {
    log('IPC tg:login-password')
    if (!pendingLogin?.passwordResolve) return { ok: false, error: 'Нет активного шага 2FA' }
    const resolve = pendingLogin.passwordResolve
    pendingLogin.passwordResolve = null
    resolve(password)
    return { ok: true }
  })

  ipcMain.handle('tg:login-cancel', async () => {
    if (pendingLogin) {
      try { pendingLogin.reject?.(new Error('Отменено пользователем')) } catch(_) {}
      pendingLogin = null
    }
    emit('tg:login-step', null)
    return { ok: true }
  })

  ipcMain.handle('tg:get-cached-chats', async () => {
    try {
      if (!cachePath || !fs.existsSync(cachePath)) return { ok: true, chats: [] }
      const raw = fs.readFileSync(cachePath, 'utf8')
      const data = JSON.parse(raw)
      // v0.87.16: подставляем avatar из файлов если в кэше был undefined
      const chats = (data.chats || []).map(c => {
        if (c.avatar) return c
        const rawId = c.rawId || String(c.id).split(':').pop()
        const avatarFile = path.join(avatarsDir, `${rawId}.jpg`)
        if (fs.existsSync(avatarFile)) {
          return { ...c, avatar: 'file:///' + encodeURI(avatarFile.replace(/\\/g, '/')) }
        }
        return c
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
  const markReadMaxSent = new Map()  // chatId → максимальный отправленный maxId
  ipcMain.handle('tg:mark-read', async (_, { chatId, maxId }) => {
    try {
      if (!client) return { ok: false, error: 'Не подключён' }
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

  // v0.87.16: отправка картинки из буфера обмена (Ctrl+V)
  ipcMain.handle('tg:send-clipboard-image', async (_, { chatId, data, ext }) => {
    log(`send-clipboard-image: chat=${chatId} bytes=${data?.length} ext=${ext}`)
    try {
      if (!client) { log('send-clipboard: client null'); return { ok: false, error: 'Не подключён' } }
      const tmpDir = path.join(path.dirname(cachePath), 'tg-tmp')
      try { fs.mkdirSync(tmpDir, { recursive: true }) } catch(_) {}
      const tmpFile = path.join(tmpDir, `clip_${Date.now()}.${ext}`)
      fs.writeFileSync(tmpFile, Buffer.from(data))
      log(`send-clipboard: saved tmp ${tmpFile}`)
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      await client.sendFile(entity, { file: tmpFile })
      log(`send-clipboard: sent OK`)
      try { fs.unlinkSync(tmpFile) } catch(_) {}
      return { ok: true }
    } catch (e) { log('send-clipboard err: ' + e.message); return { ok: false, error: e.message } }
  })

  ipcMain.handle('tg:send-file', async (_, { chatId, filePath, caption }) => {
    try {
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const result = await client.sendFile(entity, { file: filePath, caption: caption || '' })
      return { ok: true, messageId: String(result.id) }
    } catch (e) {
      log('send-file err: ' + e.message)
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('tg:forward', async (_, { fromChatId, toChatId, messageId }) => {
    log(`forward: ${fromChatId} → ${toChatId} msgId=${messageId}`)
    try {
      if (!client) return { ok: false, error: 'Не подключён' }
      const fromEntity = chatEntityMap.get(fromChatId) || String(fromChatId).split(':').pop()
      const toEntity = chatEntityMap.get(toChatId) || String(toChatId).split(':').pop()
      await client.forwardMessages(toEntity, { messages: [Number(messageId)], fromPeer: fromEntity })
      log(`forward: OK`)
      return { ok: true }
    } catch (e) { log('forward err: ' + e.message); return { ok: false, error: e.message } }
  })

  ipcMain.handle('tg:pin', async (_, { chatId, messageId, unpin = false }) => {
    log(`pin: chat=${chatId} msg=${messageId} unpin=${unpin}`)
    try {
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

  // v0.87.24: manual sync unread (вызывается из renderer при window.focus)
  // v0.87.26: используем fetchAllUnreadUpdates с пагинацией — раньше было 100 чатов
  ipcMain.handle('tg:rescan-unread', async () => {
    try {
      if (!client) return { ok: false }
      const updates = await fetchAllUnreadUpdates()
      emit('tg:unread-bulk-sync', { accountId: currentAccount?.id, updates })
      const withUnread = updates.filter(u => u.unreadCount > 0).length
      log(`manual rescan: ${updates.length} чатов (${withUnread} с непрочитанным)`)
      return { ok: true, count: updates.length }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.17: получить закреплённое сообщение
  ipcMain.handle('tg:get-pinned', async (_, { chatId }) => {
    try {
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

  // v0.87.17: дозагрузка photo для конкретной entity (для каналов без photo в getDialogs)
  ipcMain.handle('tg:refresh-avatar', async (_, { chatId }) => {
    try {
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false, error: 'нет entity' }
      const rawId = String(chatId).split(':').pop()
      const avatarPath = path.join(avatarsDir, `${rawId}.jpg`)
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

  ipcMain.handle('tg:get-chats', async () => {
    try {
      if (!client) return { ok: false, error: 'Не подключён', chats: [] }
      log('get-chats: старт')
      const PAGE = 200
      const firstPage = await client.getDialogs({ limit: PAGE, folder: 0 })
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
          const archived = await client.getDialogs({ limit: PAGE, folder: 1 })
          if (archived.length) {
            const archivedChats = archived.map(d => ({ ...mapDialog(d), archived: true }))
            emit('tg:chats', { accountId: currentAccount?.id, chats: archivedChats, append: true })
            const archUnread = archived.reduce((sum, d) => sum + (d.unreadCount || 0), 0)
            log(`═══ АРХИВНЫЕ ═══ загружено=${archived.length}, непрочитанных=${archUnread}`)
            loadAvatarsAsync(archived)
          } else {
            log(`архивных чатов: 0`)
          }
        } catch (e) { log('archived err: ' + e.message) }
      })()
      const firstChats = firstPage.map(mapDialog)
      emit('tg:chats', { accountId: currentAccount?.id, chats: firstChats, append: false })
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

  // v0.87.15: messages с типом медиа и возможностью дозагрузки вверх (offsetId)
  ipcMain.handle('tg:get-messages', async (_, { chatId, limit = 50, offsetId = 0 }) => {
    try {
      if (!client) return { ok: false, error: 'Не подключён', messages: [] }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const msgs = await client.getMessages(entity, { limit, offsetId })
      // v0.87.17: пытаемся узнать max outgoing read через getFullEntity (для галочек)
      try {
        const full = await client.invoke(
          entity.className === 'InputPeerUser' || entity.userId
            ? new Api.users.GetFullUser({ id: entity })
            : new Api.channels.GetFullChannel({ channel: entity })
        )
        const readOutboxMaxId = Number(full.fullUser?.pFlags?.readOutboxMaxId || full.fullChat?.readOutboxMaxId || 0)
        if (readOutboxMaxId) maxOutgoingRead.set(chatId, readOutboxMaxId)
      } catch(_) {}
      const readUpTo = maxOutgoingRead.get(chatId) || 0
      const messages = msgs.map(m => {
        const mapped = mapMessage(m, chatId)
        if (mapped.isOutgoing) mapped.isRead = Number(mapped.id) <= readUpTo
        return mapped
      }).reverse()
      emit('tg:messages', { chatId, messages, append: offsetId > 0, readUpTo })
      return { ok: true, messages, hasMore: msgs.length >= limit }
    } catch (e) {
      log('get-messages err: ' + e.message)
      return { ok: false, error: e.message, messages: [] }
    }
  })

  // v0.87.15: sendMessage с поддержкой reply
  ipcMain.handle('tg:send-message', async (_, { chatId, text, replyTo }) => {
    try {
      if (!client) return { ok: false, error: 'Не подключён' }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      const params = { message: text }
      if (replyTo) params.replyTo = Number(replyTo)
      const result = await client.sendMessage(entity, params)
      return { ok: true, messageId: String(result.id) }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.15: удаление сообщения
  ipcMain.handle('tg:delete-message', async (_, { chatId, messageId, forAll = true }) => {
    try {
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      await client.deleteMessages(entity, [Number(messageId)], { revoke: forAll })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.15: редактирование сообщения
  ipcMain.handle('tg:edit-message', async (_, { chatId, messageId, text }) => {
    try {
      if (!client) return { ok: false }
      const entity = chatEntityMap.get(chatId) || String(chatId).split(':').pop()
      await client.editMessage(entity, { message: Number(messageId), text })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.34: скачивание видео с progress events для <video> streaming player.
  // Эмитит tg:media-progress { chatId, messageId, bytes, total } каждый чанк.
  // По окончании возвращает cc-media:// путь — UI откроет его в <video controls src=...>
  // и браузер через Range requests играет сразу, не дожидаясь полного файла.
  ipcMain.handle('tg:download-video', async (event, { chatId, messageId }) => {
    log(`download-video: chat=${chatId} msg=${messageId}`)
    try {
      if (!client) return { ok: false, error: 'Не подключён' }
      const mediaDir = path.join(path.dirname(cachePath), 'tg-media')
      try { fs.mkdirSync(mediaDir, { recursive: true }) } catch(_) {}
      const rawChat = String(chatId).split(':').pop()
      // video файл — .mp4 (большинство видео в Telegram)
      const filePath = path.join(mediaDir, `${rawChat}_${messageId}_video.mp4`)
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        log(`download-video: cached ${filePath}`)
        return { ok: true, path: `cc-media://video/${encodeURIComponent(path.basename(filePath))}`, cached: true }
      }
      const entity = chatEntityMap.get(chatId) || rawChat
      const msgs = await client.getMessages(entity, { ids: [Number(messageId)] })
      if (!msgs[0]) return { ok: false, error: 'Сообщение не найдено' }
      if (!msgs[0].media) return { ok: false, error: 'Нет медиа' }
      const total = Number(msgs[0].media.document?.size) || 0
      // Используем client.downloadMedia с progressCallback для live-событий
      const buf = await client.downloadMedia(msgs[0], {
        progressCallback: (got) => {
          try {
            event.sender.send('tg:media-progress', {
              chatId, messageId, bytes: Number(got) || 0, total,
            })
          } catch(_) {}
        }
      })
      if (!buf) return { ok: false, error: 'Telegram вернул пусто' }
      fs.writeFileSync(filePath, buf)
      log(`download-video: OK size=${buf.length}`)
      return { ok: true, path: `cc-media://video/${encodeURIComponent(path.basename(filePath))}`, total }
    } catch (e) {
      log('download-video err: ' + e.message)
      return { ok: false, error: e.message }
    }
  })

  // v0.87.22: поддержка thumb-режима — быстрое превью ~20КБ вместо полного фото ~300КБ
  ipcMain.handle('tg:download-media', async (_, { chatId, messageId, thumb = true }) => {
    log(`download-media: chat=${chatId} msg=${messageId} thumb=${thumb}`)
    try {
      if (!client) return { ok: false, error: 'Не подключён' }
      const mediaDir = path.join(path.dirname(cachePath), 'tg-media')
      try { fs.mkdirSync(mediaDir, { recursive: true }) } catch(_) {}
      const rawChat = String(chatId).split(':').pop()
      const suffix = thumb ? '_thumb' : ''
      const filePath = path.join(mediaDir, `${rawChat}_${messageId}${suffix}.jpg`)
      if (fs.existsSync(filePath)) {
        return { ok: true, path: `cc-media://media/${encodeURIComponent(path.basename(filePath))}` }
      }
      const entity = chatEntityMap.get(chatId) || rawChat
      const msgs = await client.getMessages(entity, { ids: [Number(messageId)] })
      if (!msgs[0]) return { ok: false, error: 'Сообщение не найдено' }
      if (!msgs[0].media) return { ok: false, error: 'Нет медиа в сообщении' }
      // thumb=true → GramJS скачает наименьший thumbnail (быстро, ~10-50 КБ)
      // thumb=false → полное фото (для просмотра в полный размер)
      const buf = await client.downloadMedia(msgs[0], thumb ? { thumb: 0 } : {})
      if (!buf) return { ok: false, error: 'Telegram вернул пустой файл' }
      fs.writeFileSync(filePath, buf)
      log(`download-media: OK size=${buf.length} thumb=${thumb}`)
      return { ok: true, path: `cc-media://media/${encodeURIComponent(path.basename(filePath))}` }
    } catch (e) {
      log('download-media err: ' + e.message)
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('tg:remove-account', async () => {
    try {
      if (client) { try { await client.disconnect() } catch(_) {} client = null }
      currentAccount = null
      if (sessionPath && fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath)
      // v0.87.27: avatar & media cache bust — удаляем кэш при logout чтобы следующий
      // аккаунт не получал старые аватарки
      try {
        if (avatarsDir && fs.existsSync(avatarsDir)) {
          for (const f of fs.readdirSync(avatarsDir)) {
            try { fs.unlinkSync(path.join(avatarsDir, f)) } catch(_) {}
          }
          log('avatars cache cleared')
        }
        if (cachePath) {
          const mediaDir = path.join(path.dirname(cachePath), 'tg-media')
          if (fs.existsSync(mediaDir)) {
            for (const f of fs.readdirSync(mediaDir)) {
              try { fs.unlinkSync(path.join(mediaDir, f)) } catch(_) {}
            }
            log('media cache cleared')
          }
          if (fs.existsSync(cachePath)) { try { fs.unlinkSync(cachePath) } catch(_) {} }
        }
        chatEntityMap.clear()
      } catch (e) { log('cache bust err: ' + e.message) }
      emit('tg:account-update', { id: 'self', status: 'disconnected', removed: true })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // v0.87.27 / v0.87.35: очистка tg-media по возрасту (maxDays) + LRU-квоте (maxBytes).
  // LRU удаляет самые старые (по mtime) когда общий размер превышает квоту.
  ipcMain.handle('tg:cleanup-media', async (_, { maxDays = 30, maxBytes = 2 * 1024 * 1024 * 1024 } = {}) => {
    try {
      if (!cachePath) return { ok: false, error: 'нет cache path' }
      const mediaDir = path.join(path.dirname(cachePath), 'tg-media')
      if (!fs.existsSync(mediaDir)) return { ok: true, removed: 0 }
      const entries = []
      for (const f of fs.readdirSync(mediaDir)) {
        const fp = path.join(mediaDir, f)
        try {
          const st = fs.statSync(fp)
          entries.push({ fp, size: st.size, mtime: st.mtimeMs })
        } catch(_) {}
      }
      const cutoff = Date.now() - maxDays * 86400000
      let removed = 0, bytesFree = 0
      // 1) По возрасту — удаляем всё старее maxDays
      for (const e of entries) {
        if (e.mtime < cutoff) {
          try { fs.unlinkSync(e.fp); bytesFree += e.size; removed++; e.deleted = true } catch(_) {}
        }
      }
      // 2) LRU квота — если всё ещё > maxBytes, удаляем самые старые до квоты
      const remaining = entries.filter(e => !e.deleted).sort((a, b) => a.mtime - b.mtime)
      let totalSize = remaining.reduce((s, e) => s + e.size, 0)
      for (const e of remaining) {
        if (totalSize <= maxBytes) break
        try { fs.unlinkSync(e.fp); totalSize -= e.size; bytesFree += e.size; removed++ } catch(_) {}
      }
      log(`cleanup-media: removed=${removed} freed=${(bytesFree/1024/1024).toFixed(1)}MB totalKeep=${(totalSize/1024/1024).toFixed(1)}MB`)
      return { ok: true, removed, bytesFree, totalSize }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // v0.87.35: получить размер кэша медиа (для UI настроек / админ панели)
  ipcMain.handle('tg:media-cache-size', async () => {
    try {
      if (!cachePath) return { ok: false, size: 0, count: 0 }
      const mediaDir = path.join(path.dirname(cachePath), 'tg-media')
      if (!fs.existsSync(mediaDir)) return { ok: true, size: 0, count: 0 }
      let size = 0, count = 0
      for (const f of fs.readdirSync(mediaDir)) {
        try { const st = fs.statSync(path.join(mediaDir, f)); size += st.size; count++ } catch(_) {}
      }
      return { ok: true, size, count }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

async function startLogin(phone) {
  log(`startLogin phone=${phone}`)
  const stringSession = new StringSession('')
  client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
    deviceModel: 'ChatCenter Desktop',
    systemVersion: 'Windows 10',
    appVersion: '0.87.4',
    langCode: 'ru',
  })

  pendingLogin = {}

  // Промисифицированный callback для ввода кода (UI получает tg:login-step step=code)
  const askCode = () => new Promise((resolve, reject) => {
    log('askCode → emit step=code')
    pendingLogin.codeResolve = resolve
    pendingLogin.reject = reject
    emit('tg:login-step', { step: 'code', phone })
  })

  // Для пароля 2FA
  const askPassword = () => new Promise((resolve, reject) => {
    log('askPassword → emit step=password')
    pendingLogin.passwordResolve = resolve
    pendingLogin.reject = reject
    emit('tg:login-step', { step: 'password', phone })
  })

  // Запускаем авторизацию в фоне (не блокирует IPC handler)
  log('client.start() calling...')
  client.start({
    phoneNumber: async () => { log('client asked phoneNumber'); return phone },
    phoneCode: async () => {
      log('client asked phoneCode')
      return await askCode()
    },
    password: async () => {
      log('client asked password')
      return await askPassword()
    },
    onError: (err) => {
      log('client onError: ' + err.message)
      const errMsg = err.message || String(err)

      // v0.87.9 КРИТИЧНО: SESSION_PASSWORD_NEEDED и PHONE_CODE_INVALID и PASSWORD_HASH_INVALID —
      // это НЕ ошибки которые надо обрабатывать, GramJS сам вызовет наш password/phoneCode callback.
      // Трогать их НЕЛЬЗЯ — иначе разрушим recovery flow.
      if (/SESSION_PASSWORD_NEEDED|PHONE_CODE_INVALID|PASSWORD_HASH_INVALID|PHONE_CODE_EMPTY/i.test(errMsg)) {
        log('recoverable error — GramJS сам продолжит flow, НЕ останавливаем client')
        // Показываем ошибку в UI, но НЕ дестроим client
        if (/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/i.test(errMsg)) {
          emit('tg:login-step', { step: 'code', phone, error: translateTelegramError(errMsg) })
        } else if (/PASSWORD_HASH_INVALID/i.test(errMsg)) {
          emit('tg:login-step', { step: 'password', phone, error: translateTelegramError(errMsg) })
        }
        return
      }

      // Фатальные ошибки — стоп client (FLOOD_WAIT, PHONE_NUMBER_INVALID, BANNED, NETWORK)
      const msg = translateTelegramError(errMsg)
      const currentStep = pendingLogin?.passwordResolve ? 'password' : (pendingLogin?.codeResolve ? 'code' : 'phone')
      const waitMatch = errMsg.match(/(?:A wait of |wait of |FLOOD_WAIT_)(\d+)/i)
      const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : 0
      emit('tg:login-step', { step: currentStep, phone, error: msg, waitUntil: waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : null })
      // Останавливаем GramJS retry-цикл ТОЛЬКО при фатальных
      try { client?.disconnect() } catch(_) {}
      try { client?.destroy() } catch(_) {}
      client = null
      pendingLogin = null
    },
  }).then(async () => {
    log('client.start() SUCCESS')
    // Успех — сохраняем сессию
    const sessionStr = client.session.save()
    try {
      fs.writeFileSync(sessionPath, sessionStr, 'utf8')
      log('session saved')
    } catch (e) { log('session save error: ' + e.message) }

    const me = await client.getMe()
    currentAccount = {
      id: `tg_${me.id}`,
      messenger: 'telegram',
      name: [me.firstName, me.lastName].filter(Boolean).join(' ').trim() || me.username || 'Telegram',
      phone: phone,
      username: me.username || '',
      status: 'connected',
    }
    emit('tg:account-update', currentAccount)
    emit('tg:login-step', { step: 'success', phone })  // v0.87.10: явный success — UI закроет модалку
    setTimeout(() => emit('tg:login-step', null), 200)
    pendingLogin = null
    attachMessageListener()
    startUnreadRescan()
  }).catch(err => {
    const errMsg = err.message || String(err)
    log('login failed: ' + errMsg)
    // v0.87.9: recoverable ошибки — показываем на текущем шаге, НЕ рушим client
    if (/SESSION_PASSWORD_NEEDED/i.test(errMsg)) {
      // GramJS бросает это как exception в некоторых версиях — эмулируем переход на экран пароля
      log('SESSION_PASSWORD_NEEDED → emit step=password (не ошибка)')
      emit('tg:login-step', { step: 'password', phone })
      return
    }
    const msg = translateTelegramError(errMsg)
    const currentStep = pendingLogin?.passwordResolve ? 'password' : (pendingLogin?.codeResolve ? 'code' : 'phone')
    emit('tg:login-step', { step: currentStep, phone, error: msg })
    // Фатальные — сбрасываем client
    if (/phone.*invalid|banned|deactivated|wait of|FLOOD_WAIT/i.test(errMsg)) {
      pendingLogin = null
      try { client?.disconnect() } catch(_) {}
      client = null
    }
  })

  return { ok: true }
}

async function autoRestoreSession() {
  if (!fs.existsSync(sessionPath)) return
  const sessionStr = fs.readFileSync(sessionPath, 'utf8').trim()
  if (!sessionStr) return
  log('restoring session...')
  const stringSession = new StringSession(sessionStr)
  client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
    deviceModel: 'ChatCenter Desktop',
    systemVersion: 'Windows 10',
    appVersion: '0.87.3',
    langCode: 'ru',
  })
  try {
    await client.connect()
    const me = await client.getMe()
    currentAccount = {
      id: `tg_${me.id}`,
      messenger: 'telegram',
      name: [me.firstName, me.lastName].filter(Boolean).join(' ').trim() || me.username || 'Telegram',
      phone: me.phone ? '+' + me.phone : '',
      username: me.username || '',
      status: 'connected',
    }
    emit('tg:account-update', currentAccount)
    attachMessageListener()
    startUnreadRescan()
    log('session restored, account=' + currentAccount.name)
  } catch (e) {
    log('session restore failed: ' + e.message)
    try { client?.disconnect() } catch(_) {}
    client = null
  }
}

// v0.87.17: maxOutgoingReadId по чатам — чтобы определять статус прочитанности наших сообщений
const maxOutgoingRead = new Map()  // chatId → maxId

// v0.87.23: маппер entities MTProto → наш формат. Telegram шлёт entities
// отдельным массивом от text. Типы: Bold, Italic, Code, Pre, Url, TextUrl,
// Mention, Hashtag, BotCommand, Email, Phone, Strike, Underline, Spoiler.
function mapEntities(entities) {
  if (!Array.isArray(entities)) return []
  return entities.map(e => ({
    type: (e.className || '').replace(/^MessageEntity/, '').toLowerCase(),
    offset: e.offset || 0,
    length: e.length || 0,
    url: e.url || null,       // для textUrl
    userId: e.userId ? String(e.userId) : null,  // для mentionName
    language: e.language || null,                 // для pre
  }))
}

// v0.87.24: stripped photo → data:URL для мгновенного превью (Вариант A)
// PhotoStrippedSize — 1-3КБ JPEG в минимальном формате (Telegram шлёт в самом сообщении)
function extractStrippedThumb(media) {
  try {
    const photo = media?.photo || media?.document
    if (!photo?.sizes && !photo?.thumbs) return null
    const sizes = photo.sizes || photo.thumbs || []
    const stripped = sizes.find(s => s.className === 'PhotoStrippedSize')
    if (!stripped?.bytes) return null
    const jpegBuffer = strippedPhotoToJpg(stripped.bytes)
    return 'data:image/jpeg;base64,' + Buffer.from(jpegBuffer).toString('base64')
  } catch (_) { return null }
}

// v0.87.15: маппер message → наш формат с поддержкой медиа + reply + entities
function mapMessage(m, chatId) {
  const media = m.media
  let mediaType = null, mediaPreview = null, strippedThumb = null, mediaWidth = null, mediaHeight = null
  let webPage = null
  let duration = null, fileSize = null  // v0.87.34: для video
  if (media) {
    const cn = media.className
    if (cn === 'MessageMediaPhoto') {
      mediaType = 'photo'
      strippedThumb = extractStrippedThumb(media)
      // Размер из самого большого size
      const photo = media.photo
      const largest = photo?.sizes?.filter(s => s.w && s.h).sort((a, b) => (b.w * b.h) - (a.w * a.h))[0]
      if (largest) { mediaWidth = largest.w; mediaHeight = largest.h }
    }
    else if (cn === 'MessageMediaDocument') {
      const mime = media.document?.mimeType || ''
      if (mime.startsWith('video/')) mediaType = 'video'
      else if (mime.startsWith('audio/')) mediaType = 'audio'
      else if (mime.startsWith('image/')) mediaType = 'photo'
      else mediaType = 'file'
      mediaPreview = media.document?.attributes?.find(a => a.fileName)?.fileName || 'файл'
      strippedThumb = extractStrippedThumb(media)
      // v0.87.34: извлекаем duration + dimensions для video
      const videoAttr = media.document?.attributes?.find(a => a.className === 'DocumentAttributeVideo')
      if (videoAttr) {
        mediaWidth = Number(videoAttr.w) || null
        mediaHeight = Number(videoAttr.h) || null
        duration = Number(videoAttr.duration) || null
      }
      const audioAttr = media.document?.attributes?.find(a => a.className === 'DocumentAttributeAudio')
      if (audioAttr) duration = Number(audioAttr.duration) || null
      fileSize = Number(media.document?.size) || null
    }
    else if (cn === 'MessageMediaWebPage') {
      mediaType = 'link'
      // v0.87.27: полноценное превью ссылки — title/description/siteName/photo
      const wp = media.webpage
      if (wp && wp.className === 'WebPage') {
        webPage = {
          url: wp.url || wp.displayUrl || '',
          title: wp.title || '',
          description: wp.description || '',
          siteName: wp.siteName || '',
          photoUrl: null,
        }
      }
    }
    else if (cn === 'MessageMediaGeo') { mediaType = 'location' }
    else if (cn === 'MessageMediaContact') { mediaType = 'contact' }
    else if (cn === 'MessageMediaPoll') { mediaType = 'poll' }
    else mediaType = 'other'
  }
  return {
    id: String(m.id),
    chatId,
    senderId: String(m.senderId || ''),
    senderName: m.sender?.firstName || m.sender?.title || '',
    text: m.message || '',
    entities: mapEntities(m.entities),
    timestamp: (m.date || 0) * 1000,
    isOutgoing: !!m.out,
    isEdited: !!m.editDate,
    mediaType,
    mediaPreview,
    strippedThumb,  // v0.87.24: мгновенное размытое превью (data:URL)
    mediaWidth, mediaHeight,  // для правильного aspect ratio placeholder
    webPage,  // v0.87.27: превью ссылки (title/description/siteName)
    duration, fileSize,  // v0.87.34: для video/audio прогресс-бар и ⏱ overlay
    // v0.87.29: groupedId — несколько медиа в одном сообщении (альбом)
    groupedId: m.groupedId ? String(m.groupedId) : null,
    replyToId: m.replyTo?.replyToMsgId ? String(m.replyTo.replyToMsgId) : null,
  }
}

// v0.87.28: плашка для сообщений без текста (медиа/сервисные)
function messagePreview(m) {
  if (!m) return ''
  if (m.message) return m.message
  // Service/action messages
  const action = m.action
  if (action) {
    const cn = action.className
    if (cn === 'MessageActionChatAddUser') return '👤 добавлен участник'
    if (cn === 'MessageActionChatDeleteUser') return '👤 участник вышел'
    if (cn === 'MessageActionChatJoinedByLink') return '👤 присоединился по ссылке'
    if (cn === 'MessageActionPinMessage') return '📌 закреплено сообщение'
    if (cn === 'MessageActionChannelCreate') return '📢 канал создан'
    if (cn === 'MessageActionChatEditPhoto') return '🖼 фото чата изменено'
    if (cn === 'MessageActionChatEditTitle') return '✏️ название чата изменено'
    if (cn === 'MessageActionPhoneCall') return '📞 звонок'
    return '⚙️ служебное сообщение'
  }
  // Media messages
  const media = m.media
  if (media) {
    const cn = media.className
    if (cn === 'MessageMediaPhoto') return '🖼 Фото'
    if (cn === 'MessageMediaDocument') {
      const mime = media.document?.mimeType || ''
      const fname = media.document?.attributes?.find(a => a.fileName)?.fileName
      if (mime.startsWith('video/')) return '📹 Видео'
      if (mime.startsWith('audio/')) return '🎵 Аудио'
      if (mime.startsWith('image/')) return '🖼 Фото'
      if (media.document?.attributes?.some(a => a.className === 'DocumentAttributeSticker')) return '🎴 Стикер'
      if (media.document?.attributes?.some(a => a.className === 'DocumentAttributeVideo' && a.roundMessage)) return '⭕ Видеосообщение'
      if (media.document?.attributes?.some(a => a.className === 'DocumentAttributeAudio' && a.voice)) return '🎤 Голосовое'
      return `📎 ${fname || 'Файл'}`
    }
    if (cn === 'MessageMediaGeo' || cn === 'MessageMediaGeoLive') return '📍 Геолокация'
    if (cn === 'MessageMediaContact') return '👤 Контакт'
    if (cn === 'MessageMediaPoll') return '📊 Опрос'
    if (cn === 'MessageMediaWebPage') return '🔗 Ссылка'
    if (cn === 'MessageMediaGame') return '🎮 Игра'
    if (cn === 'MessageMediaInvoice') return '💳 Оплата'
    return '📎 вложение'
  }
  return ''
}

// v0.87.12: единый маппер dialog → наш формат
function mapDialog(d) {
  const entity = d.entity || {}
  const type = d.isUser ? 'user' : d.isGroup ? 'group' : d.isChannel ? 'channel' : 'user'
  const id = `${currentAccount?.id}:${String(d.id)}`
  // v0.87.14: сохраняем entity для markAsRead / sendMessage — без entity GramJS не знает куда слать
  chatEntityMap.set(id, d.inputEntity || d.entity || d.id)
  return {
    id,
    accountId: currentAccount?.id,
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
function saveChatsCache(chats) {
  try {
    if (!cachePath) return
    const enriched = chats.map(c => {
      if (c.avatar) return c
      const rawId = c.rawId || String(c.id).split(':').pop()
      const avatarFile = path.join(avatarsDir, `${rawId}.jpg`)
      if (fs.existsSync(avatarFile)) {
        return { ...c, avatar: 'file:///' + encodeURI(avatarFile.replace(/\\/g, '/')) }
      }
      return c
    })
    fs.writeFileSync(cachePath, JSON.stringify({ accountId: currentAccount?.id, chats: enriched, updatedAt: Date.now() }), 'utf8')
  } catch (e) { log('saveChatsCache err: ' + e.message) }
}

// v0.87.12: фоновая загрузка остальных страниц — emit с append: true
async function loadRestPagesAsync(firstPage) {
  try {
    const PAGE = 200
    let last = firstPage[firstPage.length - 1]
    let offsetDate = last.message?.date || 0
    let offsetId = last.message?.id || 0
    let offsetPeer = last.inputEntity || last.entity
    // v0.87.13: стоп ТОЛЬКО когда пустая страница (не по < PAGE — GramJS часто возвращает меньше)
    for (let i = 0; i < 30; i++) {
      const page = await client.getDialogs({ limit: PAGE, offsetDate, offsetId, offsetPeer })
      if (!page.length) { log(`пустая страница на итерации ${i+1}, стоп`); break }
      const chats = page.map(mapDialog)
      emit('tg:chats', { accountId: currentAccount?.id, chats, append: true })
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
async function loadAvatarsAsync(dialogs) {
  if (!client || !avatarsDir) return
  const stats = { total: dialogs.length, hasPhoto: 0, noPhoto: 0, downloaded: 0, cached: 0, failed: 0, fetched: 0 }
  // v0.87.19: для чатов БЕЗ photo в entity — запрашиваем GetFullChannel/GetFullChat/GetFullUser
  // многие каналы в getDialogs возвращаются без photo, только через Full-запросы
  for (const d of dialogs) {
    try {
      let entity = d.entity
      const chatId = `${currentAccount?.id}:${String(d.id)}`
      const avatarPath = path.join(avatarsDir, `${String(d.id)}.jpg`)
      if (fs.existsSync(avatarPath)) {
        stats.cached++
        emit('tg:chat-avatar', { chatId, avatarPath: `cc-media://avatars/${encodeURIComponent(path.basename(avatarPath))}` })
        continue
      }
      // v0.87.19: если у entity нет photo — догружаем через GetFull*
      if (!entity?.photo || entity.photo.photoEmpty) {
        try {
          if (d.isChannel || d.isGroup) {
            const full = await client.invoke(new Api.channels.GetFullChannel({ channel: entity || d.inputEntity }))
            const chatWithPhoto = full.chats?.find(c => c.id?.toString() === entity?.id?.toString()) || full.chats?.[0]
            if (chatWithPhoto?.photo && !chatWithPhoto.photo.photoEmpty) {
              entity = chatWithPhoto
              stats.fetched++
            } else { stats.noPhoto++; continue }
          } else if (d.isUser) {
            const full = await client.invoke(new Api.users.GetFullUser({ id: entity || d.inputEntity }))
            const userWithPhoto = full.users?.find(u => u.id?.toString() === entity?.id?.toString()) || full.users?.[0]
            if (userWithPhoto?.photo && !userWithPhoto.photo.photoEmpty) {
              entity = userWithPhoto
              stats.fetched++
            } else { stats.noPhoto++; continue }
          } else { stats.noPhoto++; continue }
        } catch(fetchErr) { stats.noPhoto++; continue }
      }
      stats.hasPhoto++
      const buffer = await client.downloadProfilePhoto(entity, { isBig: false })
      if (!buffer) { stats.failed++; continue }
      fs.writeFileSync(avatarPath, buffer)
      stats.downloaded++
      emit('tg:chat-avatar', { chatId, avatarPath: `cc-media://avatars/${encodeURIComponent(path.basename(avatarPath))}` })
    } catch (e) { stats.failed++; log(`avatar err для ${d.title}: ${e.message}`) }
  }
  log(`аватарки: total=${stats.total} hasPhoto=${stats.hasPhoto} noPhoto=${stats.noPhoto} fetched=${stats.fetched} downloaded=${stats.downloaded} cached=${stats.cached} failed=${stats.failed}`)
}

// v0.87.24: периодический rescan unread (часть Комбо D вариант A)
// v0.87.26: ФИКС — пагинация до 500 чатов вместо фикса 50. Иначе чаты вне первых
// 50 никогда не синхронизировались (у активных юзеров сотни чатов).
let unreadRescanTimer = null
async function fetchAllUnreadUpdates(maxPages = 5, pageSize = 100) {
  if (!client || !currentAccount) return []
  const updates = []
  let offsetDate, offsetId, offsetPeer
  for (let i = 0; i < maxPages; i++) {
    try {
      const page = await client.getDialogs({ limit: pageSize, offsetDate, offsetId, offsetPeer })
      if (!page.length) break
      for (const d of page) {
        updates.push({
          id: `${currentAccount.id}:${String(d.id)}`,
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

function startUnreadRescan() {
  if (unreadRescanTimer) clearInterval(unreadRescanTimer)
  // v0.87.35: immediate rescan при старте чтобы списочные счётчики сразу были точными
  // (раньше ждали первые 30 сек → устаревшие цифры в списке)
  // v0.87.39: логируем rescan только при ИЗМЕНЕНИИ (раньше спамил каждые 15 сек)
  let lastRescanUnread = -1
  const doRescan = async () => {
    if (!client || !currentAccount) return
    try {
      const updates = await fetchAllUnreadUpdates()
      emit('tg:unread-bulk-sync', { accountId: currentAccount.id, updates })
      const withUnread = updates.filter(u => u.unreadCount > 0).length
      if (withUnread !== lastRescanUnread) {
        log(`unread rescan: ${updates.length} чатов (${withUnread} с непрочитанным)`)
        lastRescanUnread = withUnread
      }
    } catch (e) { log('rescan err: ' + e.message) }
  }
  setTimeout(doRescan, 1500)  // immediate sync через 1.5 сек после старта
  unreadRescanTimer = setInterval(doRescan, 15000)  // v0.87.35: 15 сек (было 30)
  log('periodic unread rescan запущен (15 сек + immediate)')
}

// v0.87.35: debounce-map для per-chat unread sync при новом сообщении
const lastPerChatSync = new Map()
async function syncPerChatUnread(chatId) {
  try {
    const last = lastPerChatSync.get(chatId) || 0
    if (Date.now() - last < 3000) return  // не чаще раз в 3 сек на чат
    lastPerChatSync.set(chatId, Date.now())
    const entity = chatEntityMap.get(chatId)
    if (!entity || !client) return
    const dialog = await client.invoke(new Api.messages.GetPeerDialogs({ peers: [new Api.InputDialogPeer({ peer: entity })] }))
    const d = dialog.dialogs?.[0]
    if (d) emit('tg:chat-unread-sync', { chatId, unreadCount: d.unreadCount || 0 })
  } catch (e) { /* silent */ }
}

function attachMessageListener() {
  if (!client) return
  try {
    client.addEventHandler(async (event) => {
      try {
        const m = event.message
        if (!m) return
        const chatIdRaw = String(m.chatId || m.peerId?.userId || m.peerId?.chatId || m.peerId?.channelId || '')
        const chatId = `${currentAccount?.id}:${chatIdRaw}`
        emit('tg:new-message', { chatId, message: mapMessage(m, chatId) })
        // v0.87.35: точный sync unreadCount для этого чата через GetPeerDialogs
        // (чтобы UI показывал реальное число сразу, не ждал mark-read / periodic rescan)
        setTimeout(() => syncPerChatUnread(chatId), 600)
      } catch (e) { log('new-message handler err: ' + e.message) }
    }, new NewMessage({}))

    // v0.87.14: raw updates — typing + read receipts
    client.addEventHandler((update) => {
      try {
        const cn = update?.className
        // Typing: UpdateUserTyping / UpdateChatUserTyping / UpdateChannelUserTyping
        if (cn === 'UpdateUserTyping' || cn === 'UpdateChatUserTyping' || cn === 'UpdateChannelUserTyping') {
          const userIdRaw = String(update.userId || update.fromId?.userId || '')
          const chatIdRaw = String(update.chatId || update.channelId || update.userId || '')
          const chatId = `${currentAccount?.id}:${chatIdRaw}`
          const isTyping = update.action?.className === 'SendMessageTypingAction'
          emit('tg:typing', { chatId, userId: userIdRaw, typing: isTyping })
        }
        // Read receipts (собеседник прочитал наши сообщения) — для галочек ✓✓
        if (cn === 'UpdateReadHistoryOutbox' || cn === 'UpdateReadChannelOutbox') {
          const chatIdRaw = String(update.peer?.userId || update.peer?.chatId || update.channelId || '')
          const chatId = `${currentAccount?.id}:${chatIdRaw}`
          const maxId = Number(update.maxId || 0)
          maxOutgoingRead.set(chatId, Math.max(maxOutgoingRead.get(chatId) || 0, maxId))
          emit('tg:read', { chatId, maxId, outgoing: true })
          log(`outgoing read: chat=${chatId} maxId=${maxId} (собеседник прочитал наши до этого id)`)
        }
        // Read inbox (мы прочитали)
        if (cn === 'UpdateReadHistoryInbox' || cn === 'UpdateReadChannelInbox') {
          const chatIdRaw = String(update.peer?.userId || update.peer?.chatId || update.channelId || '')
          const chatId = `${currentAccount?.id}:${chatIdRaw}`
          emit('tg:read', { chatId, maxId: Number(update.maxId || 0), outgoing: false, stillUnread: Number(update.stillUnreadCount || 0) })
        }
      } catch (e) { /* silent */ }
    })
    log('event handler + raw updates attached')
  } catch (e) { log('attach listener err: ' + e.message) }
}

function emit(channel, data) {
  const win = getMainWindowFn?.()
  if (win && !win.isDestroyed()) {
    log(`emit ${channel} ` + (data?.step || (data?.status) || ''))
    win.webContents.send(channel, data)
  } else {
    log(`emit ${channel} SKIPPED — no mainWindow`)
  }
}
