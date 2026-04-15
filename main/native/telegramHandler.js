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
let mainWindowRef = null
let sessionPath = null
let pendingLogin = null   // { phoneResolve, codeResolve, passwordResolve, reject }
let currentAccount = null

const log = (msg) => { try { console.log('[tg]', msg) } catch(_) {} }

export function initTelegramHandler({ mainWindow, userDataPath }) {
  mainWindowRef = mainWindow
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
  emit('tg:login-step', { step: 'phone', phone })
  const stringSession = new StringSession('')
  client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
    deviceModel: 'ChatCenter Desktop',
    systemVersion: 'Windows 10',
    appVersion: '0.87.3',
    langCode: 'ru',
  })

  pendingLogin = {}

  // Промисифицированный callback для ввода кода
  const askCode = () => new Promise((resolve, reject) => {
    pendingLogin.codeResolve = resolve
    pendingLogin.reject = reject
    emit('tg:login-step', { step: 'code', phone })
  })

  // Для пароля 2FA
  const askPassword = () => new Promise((resolve, reject) => {
    pendingLogin.passwordResolve = resolve
    pendingLogin.reject = reject
    emit('tg:login-step', { step: 'password', phone })
  })

  // Запускаем авторизацию в фоне (не блокирует IPC handler)
  client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => {
      const code = await askCode()
      try { pendingLogin._codeReply?.({ ok: true }) } catch(_) {}
      return code
    },
    password: async () => {
      const pwd = await askPassword()
      try { pendingLogin._pwdReply?.({ ok: true }) } catch(_) {}
      return pwd
    },
    onError: (err) => {
      log('login error: ' + err.message)
      emit('tg:login-step', { step: 'phone', error: err.message })
    },
  }).then(async () => {
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
    emit('tg:login-step', { step: 'phone', error: err.message })
    pendingLogin = null
    try { client?.disconnect() } catch(_) {}
    client = null
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
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data)
  }
}
