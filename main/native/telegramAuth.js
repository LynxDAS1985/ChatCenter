// v0.87.85: авторизация Telegram — startLogin (phone → code → 2FA) + autoRestoreSession.
// Извлечён из telegramHandler.js (Шаг 7/7 разбиения).
// КРИТИЧНО: после успешного client.start() / connect() обязательно вызывать
// attachMessageListener() и startUnreadRescan() — иначе входящие не приходят
// и счётчики не синхронизируются.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { state, log, emit, API_ID, API_HASH } from './telegramState.js'
import { translateTelegramError } from './telegramErrors.js'
import { attachMessageListener } from './telegramMessages.js'
import { startUnreadRescan } from './telegramChats.js'

export function initAuthHandlers() {
  ipcMain.handle('tg:login-start', async (_, { phone }) => {
    try {
      if (state.pendingLogin) {
        return { ok: false, error: 'Авторизация уже в процессе. Сначала отмените текущую.' }
      }
      return await startLogin(phone)
    } catch (e) {
      log('login-start error: ' + e.message)
      state.pendingLogin = null
      emit('tg:login-step', { step: 'phone', error: e.message })
      return { ok: false, error: e.message }
    }
  })

  // v0.87.10: упрощённый IPC — сразу { ok: true } после передачи в pending.
  // Результат (success / 2FA / error) приходит через tg:login-step events.
  ipcMain.handle('tg:login-code', async (_, { code }) => {
    log('IPC tg:login-code')
    if (!state.pendingLogin?.codeResolve) return { ok: false, error: 'Нет активного шага ввода кода' }
    const resolve = state.pendingLogin.codeResolve
    state.pendingLogin.codeResolve = null
    resolve(code)
    return { ok: true }
  })

  ipcMain.handle('tg:login-password', async (_, { password }) => {
    log('IPC tg:login-password')
    if (!state.pendingLogin?.passwordResolve) return { ok: false, error: 'Нет активного шага 2FA' }
    const resolve = state.pendingLogin.passwordResolve
    state.pendingLogin.passwordResolve = null
    resolve(password)
    return { ok: true }
  })

  ipcMain.handle('tg:login-cancel', async () => {
    if (state.pendingLogin) {
      try { state.pendingLogin.reject?.(new Error('Отменено пользователем')) } catch(_) {}
      state.pendingLogin = null
    }
    emit('tg:login-step', null)
    return { ok: true }
  })
}

async function startLogin(phone) {
  log(`startLogin phone=${phone}`)
  const stringSession = new StringSession('')
  state.client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
    deviceModel: 'ChatCenter Desktop',
    systemVersion: 'Windows 10',
    appVersion: '0.87.4',
    langCode: 'ru',
  })

  state.pendingLogin = {}

  // Промисифицированный callback для ввода кода (UI получает tg:login-step step=code)
  const askCode = () => new Promise((resolve, reject) => {
    log('askCode → emit step=code')
    state.pendingLogin.codeResolve = resolve
    state.pendingLogin.reject = reject
    emit('tg:login-step', { step: 'code', phone })
  })

  // Для пароля 2FA
  const askPassword = () => new Promise((resolve, reject) => {
    log('askPassword → emit step=password')
    state.pendingLogin.passwordResolve = resolve
    state.pendingLogin.reject = reject
    emit('tg:login-step', { step: 'password', phone })
  })

  // Запускаем авторизацию в фоне (не блокирует IPC handler)
  log('client.start() calling...')
  state.client.start({
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
      const currentStep = state.pendingLogin?.passwordResolve ? 'password' : (state.pendingLogin?.codeResolve ? 'code' : 'phone')
      const waitMatch = errMsg.match(/(?:A wait of |wait of |FLOOD_WAIT_)(\d+)/i)
      const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : 0
      emit('tg:login-step', { step: currentStep, phone, error: msg, waitUntil: waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : null })
      // Останавливаем GramJS retry-цикл ТОЛЬКО при фатальных
      try { state.client?.disconnect() } catch(_) {}
      try { state.client?.destroy() } catch(_) {}
      state.client = null
      state.pendingLogin = null
    },
  }).then(async () => {
    log('client.start() SUCCESS')
    // Успех — сохраняем сессию
    const sessionStr = state.client.session.save()
    try {
      fs.writeFileSync(state.sessionPath, sessionStr, 'utf8')
      log('session saved')
    } catch (e) { log('session save error: ' + e.message) }

    const me = await state.client.getMe()
    state.currentAccount = {
      id: `tg_${me.id}`,
      messenger: 'telegram',
      name: [me.firstName, me.lastName].filter(Boolean).join(' ').trim() || me.username || 'Telegram',
      phone: phone,
      username: me.username || '',
      status: 'connected',
    }
    emit('tg:account-update', state.currentAccount)
    emit('tg:login-step', { step: 'success', phone })  // v0.87.10: явный success — UI закроет модалку
    setTimeout(() => emit('tg:login-step', null), 200)
    state.pendingLogin = null
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
    const currentStep = state.pendingLogin?.passwordResolve ? 'password' : (state.pendingLogin?.codeResolve ? 'code' : 'phone')
    emit('tg:login-step', { step: currentStep, phone, error: msg })
    // Фатальные — сбрасываем client
    if (/phone.*invalid|banned|deactivated|wait of|FLOOD_WAIT/i.test(errMsg)) {
      state.pendingLogin = null
      try { state.client?.disconnect() } catch(_) {}
      state.client = null
    }
  })

  return { ok: true }
}

export async function autoRestoreSession() {
  if (!fs.existsSync(state.sessionPath)) return
  const sessionStr = fs.readFileSync(state.sessionPath, 'utf8').trim()
  if (!sessionStr) return
  log('restoring session...')
  const stringSession = new StringSession(sessionStr)
  state.client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
    deviceModel: 'ChatCenter Desktop',
    systemVersion: 'Windows 10',
    appVersion: '0.87.3',
    langCode: 'ru',
  })
  try {
    await state.client.connect()
    const me = await state.client.getMe()
    state.currentAccount = {
      id: `tg_${me.id}`,
      messenger: 'telegram',
      name: [me.firstName, me.lastName].filter(Boolean).join(' ').trim() || me.username || 'Telegram',
      phone: me.phone ? '+' + me.phone : '',
      username: me.username || '',
      status: 'connected',
    }
    emit('tg:account-update', state.currentAccount)
    attachMessageListener()
    startUnreadRescan()
    log('session restored, account=' + state.currentAccount.name)
  } catch (e) {
    log('session restore failed: ' + e.message)
    try { state.client?.disconnect() } catch(_) {}
    state.client = null
  }
}
