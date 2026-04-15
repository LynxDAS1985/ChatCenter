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
    [/FLOOD_WAIT_(\d+)/i, (m) => `Слишком много запросов. Подождите ${formatSeconds(parseInt(m[1]))}`],
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
  log(`init, session=${sessionPath}`)

  // Попытка восстановить сессию при старте
  autoRestoreSession().catch(e => log('autoRestore error: ' + e.message))

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

  ipcMain.handle('tg:login-code', async (_, { code }) => {
    if (!pendingLogin?.codeResolve) {
      return { ok: false, error: 'Нет активного шага ввода кода' }
    }
    return await new Promise((resolve) => {
      pendingLogin._codeReply = resolve
      pendingLogin.codeResolve(code)
    })
  })

  ipcMain.handle('tg:login-password', async (_, { password }) => {
    if (!pendingLogin?.passwordResolve) {
      return { ok: false, error: 'Нет активного шага 2FA' }
    }
    return await new Promise((resolve) => {
      pendingLogin._pwdReply = resolve
      pendingLogin.passwordResolve(password)
    })
  })

  ipcMain.handle('tg:login-cancel', async () => {
    if (pendingLogin) {
      try { pendingLogin.reject?.(new Error('Отменено пользователем')) } catch(_) {}
      pendingLogin = null
    }
    emit('tg:login-step', null)
    return { ok: true }
  })

  ipcMain.handle('tg:get-chats', async (_, { limit = 100 } = {}) => {
    try {
      if (!client) return { ok: false, error: 'Не подключён', chats: [] }
      const dialogs = await client.getDialogs({ limit })
      const chats = dialogs.map(d => ({
        id: `${currentAccount?.id}:${String(d.id)}`,
        accountId: currentAccount?.id,
        title: d.title || d.name || 'Без названия',
        type: d.isUser ? 'user' : d.isGroup ? 'group' : d.isChannel ? 'channel' : 'user',
        lastMessage: d.message?.message || '',
        lastMessageTs: d.message?.date ? d.message.date * 1000 : 0,
        unreadCount: d.unreadCount || 0,
        rawId: String(d.id),
      }))
      emit('tg:chats', { accountId: currentAccount?.id, chats })
      return { ok: true, chats }
    } catch (e) {
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
      const code = await askCode()
      try { pendingLogin._codeReply?.({ ok: true }) } catch(_) {}
      return code
    },
    password: async () => {
      log('client asked password')
      const pwd = await askPassword()
      try { pendingLogin._pwdReply?.({ ok: true }) } catch(_) {}
      return pwd
    },
    onError: (err) => {
      log('client onError: ' + err.message)
      const msg = translateTelegramError(err.message)
      const currentStep = pendingLogin?.passwordResolve ? 'password' : (pendingLogin?.codeResolve ? 'code' : 'phone')
      emit('tg:login-step', { step: currentStep, phone, error: msg })
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
    emit('tg:login-step', null)
    pendingLogin = null
    attachMessageListener()
  }).catch(err => {
    log('login failed: ' + err.message)
    const msg = translateTelegramError(err.message)
    // v0.87.5: сохраняем текущий шаг (не сбрасываем на phone) чтобы ошибка показалась на том же экране
    const currentStep = pendingLogin?.passwordResolve ? 'password' : (pendingLogin?.codeResolve ? 'code' : 'phone')
    emit('tg:login-step', { step: currentStep, phone, error: msg })
    // pendingLogin оставляем — пользователь может повторить ввод кода/пароля
    // только на фатальных ошибках сбрасываем client
    if (/phone.*invalid|banned|deactivated/i.test(err.message || '')) {
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
