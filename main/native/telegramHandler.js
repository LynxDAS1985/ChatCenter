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

// api_id / api_hash зашиты — ChatCenter (Demo33) app на my.telegram.org
const API_ID = 8392940
const API_HASH = '33a9605b6f86a176e240cc141e864bf5'

let client = null
let getMainWindowFn = null   // v0.87.4: функция вместо прямой ссылки — mainWindow может быть null в момент init
let sessionPath = null
let avatarsDir = null     // v0.87.11: папка для кэша аватарок
let pendingLogin = null   // { phoneResolve, codeResolve, passwordResolve, reject }
let currentAccount = null

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
  try { fs.mkdirSync(avatarsDir, { recursive: true }) } catch(_) {}
  log(`init, session=${sessionPath}, avatars=${avatarsDir}`)

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
      loadAvatarsAsync(firstPage.slice(0, 50))

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

  ipcMain.handle('tg:get-messages', async (_, { chatId, limit = 50 }) => {
    try {
      if (!client) return { ok: false, error: 'Не подключён', messages: [] }
      const rawId = String(chatId).split(':').pop()
      const msgs = await client.getMessages(rawId, { limit })
      const messages = msgs.map(m => ({
        id: String(m.id),
        chatId,
        senderId: String(m.senderId || ''),
        senderName: m.sender?.firstName || m.sender?.title || '',
        text: m.message || '',
        timestamp: (m.date || 0) * 1000,
        isOutgoing: !!m.out,
      })).reverse()  // старые сверху
      emit('tg:messages', { chatId, messages })
      return { ok: true, messages }
    } catch (e) {
      return { ok: false, error: e.message, messages: [] }
    }
  })

  ipcMain.handle('tg:send-message', async (_, { chatId, text }) => {
    try {
      if (!client) return { ok: false, error: 'Не подключён' }
      const rawId = String(chatId).split(':').pop()
      const result = await client.sendMessage(rawId, { message: text })
      return { ok: true, messageId: String(result.id) }
    } catch (e) {
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

// v0.87.12: единый маппер dialog → наш формат
function mapDialog(d) {
  const entity = d.entity || {}
  const type = d.isUser ? 'user' : d.isGroup ? 'group' : d.isChannel ? 'channel' : 'user'
  return {
    id: `${currentAccount?.id}:${String(d.id)}`,
    accountId: currentAccount?.id,
    title: d.title || d.name || 'Без названия',
    type,
    lastMessage: d.message?.message || '',
    lastMessageTs: d.message?.date ? d.message.date * 1000 : 0,
    unreadCount: d.unreadCount || 0,
    rawId: String(d.id),
    hasPhoto: !!(entity.photo && !entity.photo.photoEmpty),
    // Онлайн-статус только для users
    isOnline: type === 'user' && entity.status?.className === 'UserStatusOnline',
    isBot: !!entity.bot,
    verified: !!entity.verified,
  }
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
      loadAvatarsAsync(page.slice(0, 50))
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
  for (const d of dialogs) {
    try {
      const entity = d.entity
      if (!entity?.photo || entity.photo.photoEmpty) continue
      const chatId = `${currentAccount?.id}:${String(d.id)}`
      const avatarPath = path.join(avatarsDir, `${String(d.id)}.jpg`)
      // Если уже есть — сразу шлём в UI
      if (fs.existsSync(avatarPath)) {
        emit('tg:chat-avatar', { chatId, avatarPath: 'file:///' + avatarPath.replace(/\\/g, '/') })
        continue
      }
      // Скачиваем
      const buffer = await client.downloadProfilePhoto(entity, { isBig: false })
      if (!buffer) continue
      fs.writeFileSync(avatarPath, buffer)
      emit('tg:chat-avatar', { chatId, avatarPath: 'file:///' + avatarPath.replace(/\\/g, '/') })
    } catch (e) { /* молча — одна аватарка не критична */ }
  }
  log(`аватарки загружены`)
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
        emit('tg:new-message', {
          chatId,
          message: {
            id: String(m.id),
            chatId,
            senderId: String(m.senderId || ''),
            senderName: m.sender?.firstName || m.sender?.title || '',
            text: m.message || '',
            timestamp: (m.date || 0) * 1000,
            isOutgoing: !!m.out,
          }
        })
      } catch (e) { log('new-message handler err: ' + e.message) }
    }, new NewMessage({}))
    log('event handler attached')
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
