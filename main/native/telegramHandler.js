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
  ipcMain.handle('tg:mark-read', async (_, { chatId, maxId }) => {
    try {
      if (!client) return { ok: false, error: 'Не подключён' }
      const entity = chatEntityMap.get(chatId)
      if (!entity) return { ok: false, error: 'Чат не найден в кэше' }
      // v0.87.16: поддержка maxId — пометить прочитанными только до этого ID
      if (maxId) {
        await client.invoke(new Api.messages.ReadHistory({ peer: entity, maxId: Number(maxId) }))
        log(`mark-read до maxId=${maxId} в ${chatId}`)
      } else {
        await client.markAsRead(entity)
        log(`mark-read ВСЕ: ${chatId}`)
      }
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
        emit('tg:chat-avatar', { chatId, avatarPath: 'file:///' + encodeURI(avatarPath.replace(/\\/g, '/')) })
        return { ok: true }
      }
      const buffer = await client.downloadProfilePhoto(entity, { isBig: false })
      if (!buffer) { log(`refresh-avatar ${chatId}: нет photo`); return { ok: false, error: 'нет фото' } }
      fs.writeFileSync(avatarPath, buffer)
      emit('tg:chat-avatar', { chatId, avatarPath: 'file:///' + encodeURI(avatarPath.replace(/\\/g, '/')) })
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
      // v0.87.12: ПЕРВАЯ страница сразу → UI не висит; остальные фоном через emit
      const PAGE = 200
      const firstPage = await client.getDialogs({ limit: PAGE })
      log(`первая страница: ${firstPage.length} чатов`)
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

  ipcMain.handle('tg:download-media', async (_, { chatId, messageId }) => {
    log(`download-media: chat=${chatId} msg=${messageId}`)
    try {
      if (!client) return { ok: false, error: 'Не подключён' }
      const mediaDir = path.join(path.dirname(cachePath), 'tg-media')
      try { fs.mkdirSync(mediaDir, { recursive: true }) } catch(_) {}
      const rawChat = String(chatId).split(':').pop()
      const filePath = path.join(mediaDir, `${rawChat}_${messageId}.jpg`)  // v0.87.18: .jpg чтобы <img> подхватывал
      if (fs.existsSync(filePath)) {
        log(`download-media: cached ${filePath}`)
        return { ok: true, path: 'file:///' + encodeURI(filePath.replace(/\\/g, '/')) }
      }
      const entity = chatEntityMap.get(chatId) || rawChat
      const msgs = await client.getMessages(entity, { ids: [Number(messageId)] })
      if (!msgs[0]) { log('download-media: сообщение не найдено'); return { ok: false, error: 'Сообщение не найдено' } }
      if (!msgs[0].media) { log('download-media: у сообщения НЕТ media'); return { ok: false, error: 'Нет медиа в сообщении' } }
      log(`download-media: скачиваем, media.className=${msgs[0].media.className}`)
      const buf = await client.downloadMedia(msgs[0], { progressCallback: () => {} })
      if (!buf) { log('download-media: downloadMedia вернул null'); return { ok: false, error: 'Telegram вернул пустой файл' } }
      fs.writeFileSync(filePath, buf)
      log(`download-media: OK, size=${buf.length}`)
      return { ok: true, path: 'file:///' + encodeURI(filePath.replace(/\\/g, '/')) }
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
      emit('tg:account-update', { id: 'self', status: 'disconnected', removed: true })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
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
    log('session restored, account=' + currentAccount.name)
  } catch (e) {
    log('session restore failed: ' + e.message)
    try { client?.disconnect() } catch(_) {}
    client = null
  }
}

// v0.87.17: maxOutgoingReadId по чатам — чтобы определять статус прочитанности наших сообщений
const maxOutgoingRead = new Map()  // chatId → maxId

// v0.87.15: маппер message → наш формат с поддержкой медиа + reply
function mapMessage(m, chatId) {
  const media = m.media
  let mediaType = null, mediaPreview = null
  if (media) {
    const cn = media.className
    if (cn === 'MessageMediaPhoto') { mediaType = 'photo' }
    else if (cn === 'MessageMediaDocument') {
      const mime = media.document?.mimeType || ''
      if (mime.startsWith('video/')) mediaType = 'video'
      else if (mime.startsWith('audio/')) mediaType = 'audio'
      else if (mime.startsWith('image/')) mediaType = 'photo'
      else mediaType = 'file'
      mediaPreview = media.document?.attributes?.find(a => a.fileName)?.fileName || 'файл'
    }
    else if (cn === 'MessageMediaWebPage') { mediaType = 'link' }
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
    timestamp: (m.date || 0) * 1000,
    isOutgoing: !!m.out,
    isEdited: !!m.editDate,
    mediaType,
    mediaPreview,
    replyToId: m.replyTo?.replyToMsgId ? String(m.replyTo.replyToMsgId) : null,
  }
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
    lastMessage: d.message?.message || '',
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
  const stats = { total: dialogs.length, hasPhoto: 0, noPhoto: 0, downloaded: 0, cached: 0, failed: 0 }
  for (const d of dialogs) {
    try {
      const entity = d.entity
      if (!entity?.photo || entity.photo.photoEmpty) { stats.noPhoto++; continue }
      stats.hasPhoto++
      const chatId = `${currentAccount?.id}:${String(d.id)}`
      const avatarPath = path.join(avatarsDir, `${String(d.id)}.jpg`)
      if (fs.existsSync(avatarPath)) {
        stats.cached++
        emit('tg:chat-avatar', { chatId, avatarPath: 'file:///' + encodeURI(avatarPath.replace(/\\/g, '/')) })
        continue
      }
      const buffer = await client.downloadProfilePhoto(entity, { isBig: false })
      if (!buffer) { stats.failed++; continue }
      fs.writeFileSync(avatarPath, buffer)
      stats.downloaded++
      emit('tg:chat-avatar', { chatId, avatarPath: 'file:///' + encodeURI(avatarPath.replace(/\\/g, '/')) })
    } catch (e) { stats.failed++; log(`avatar err для ${d.title}: ${e.message}`) }
  }
  log(`аватарки: total=${stats.total} hasPhoto=${stats.hasPhoto} noPhoto=${stats.noPhoto} downloaded=${stats.downloaded} cached=${stats.cached} failed=${stats.failed}`)
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
