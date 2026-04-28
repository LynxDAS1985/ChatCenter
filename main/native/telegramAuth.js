// v0.87.85: авторизация Telegram — startLogin (phone → code → 2FA) + autoRestoreSession.
// Извлечён из telegramHandler.js (Шаг 7/7 разбиения).
// КРИТИЧНО: после успешного client.start() / connect() обязательно вызывать
// attachMessageListener() и startUnreadRescan() — иначе входящие не приходят
// и счётчики не синхронизируются.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { isValidPhoneNumber } from 'libphonenumber-js'
import { state, log, emit, API_ID, API_HASH } from './telegramState.js'
import { translateTelegramError } from './telegramErrors.js'
import { attachMessageListener } from './telegramMessages.js'
import { startUnreadRescan } from './telegramChats.js'

// v0.87.101: проверка формата через libphonenumber-js (Google-стандарт).
// Знает реальные правила длины и формата для каждой из 240 стран.
// Старая ручная проверка «8-15 цифр» пропускала «+79126370331» (10 цифр для России — мало).
function validatePhoneFormat(raw) {
  const phone = (raw || '').trim()
  if (!phone) return 'Введите номер телефона'
  if (!phone.startsWith('+')) return 'Номер должен начинаться с +'
  if (!isValidPhoneNumber(phone)) return 'Неверный формат номера. Проверь правильность для своей страны'
  return null
}

// v0.87.91: загрузка аватарки профиля пользователя (для AccountContextMenu).
// v0.87.93: возвращает cc-media://avatars/<filename> URL (Chromium блокирует file:/// в renderer).
// Сохраняется в tg-avatars/me_<id>.jpg.
async function loadOwnAvatar(me) {
  try {
    if (!state.client || !state.avatarsDir || !me?.id) return null
    const filename = `me_${me.id}.jpg`
    const filepath = path.join(state.avatarsDir, filename)
    if (fs.existsSync(filepath)) {
      return `cc-media://avatars/${filename}`
    }
    const buffer = await state.client.downloadProfilePhoto(me, { isBig: false })
    if (!buffer || !buffer.length) return null
    fs.writeFileSync(filepath, buffer)
    log(`own avatar saved: ${filename} (${buffer.length} bytes)`)
    return `cc-media://avatars/${filename}`
  } catch (e) {
    log('loadOwnAvatar error: ' + e.message)
    return null
  }
}

export function initAuthHandlers() {
  ipcMain.handle('tg:login-start', async (_, { phone }) => {
    try {
      // v0.87.98 Слой 2: проверка формата ДО startLogin. Не даём GramJS зациклиться.
      const formatErr = validatePhoneFormat(phone)
      if (formatErr) {
        log('login-start rejected: ' + formatErr + ' (phone="' + (phone || '').slice(0, 6) + '…")')
        emit('tg:login-step', { step: 'phone', error: formatErr })
        return { ok: false, error: formatErr }
      }
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

  // v0.87.101: счётчик в LOCAL closure variable — НЕ в state.pendingLogin.
  // Раньше при первой ошибке мы делали state.pendingLogin = null, и при следующем
  // вызове phoneNumber callback счётчик сбрасывался на 0 → throw не срабатывал →
  // бесконечный retry-цикл GramJS возвращался (баг v0.87.98 → v0.87.100).
  // Closure-переменная живёт пока живёт замыкание, её state.pendingLogin не обнулит.
  let phoneAttempts = 0
  let firstError = null
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
    phoneNumber: async () => {
      // v0.87.101 Слой 3: closure-счётчик прерывает retry-цикл GramJS.
      // Telegram отверг номер → нет смысла слать тот же номер второй раз.
      phoneAttempts++
      log('client asked phoneNumber (попытка ' + phoneAttempts + ')')
      if (phoneAttempts > 1) {
        log('phone уже отправлен — прерываем retry-цикл')
        throw new Error('PHONE_NUMBER_INVALID')
      }
      return phone
    },
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

      // v0.87.101 Слой 4: запоминаем ПЕРВУЮ ошибку в closure-переменной.
      // Все следующие "Cannot send requests while disconnected" — побочка retry-цикла.
      if (!firstError && !/SESSION_PASSWORD_NEEDED/i.test(errMsg)) {
        firstError = errMsg
      }

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

      // v0.87.98 Слой 3: "Cannot send requests while disconnected" — побочка retry-цикла.
      // Считаем фатальной и убиваем client, иначе спам в логе.
      const isDisconnectSpam = /Cannot send requests while disconnected|reconnect/i.test(errMsg)

      // Фатальные ошибки — стоп client (FLOOD_WAIT, PHONE_NUMBER_INVALID, BANNED, NETWORK)
      // v0.87.101: показываем ПЕРВУЮ ошибку (closure firstError), не последнюю
      const realErr = firstError || errMsg
      const msg = translateTelegramError(realErr)
      const currentStep = state.pendingLogin?.passwordResolve ? 'password' : (state.pendingLogin?.codeResolve ? 'code' : 'phone')
      const waitMatch = realErr.match(/(?:A wait of |wait of |FLOOD_WAIT_)(\d+)/i)
      const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : 0
      // Эмитим ТОЛЬКО первый раз — чтобы UI не моргал тысячей disconnect-сообщений
      if (!state.pendingLogin?._emitted || !isDisconnectSpam) {
        emit('tg:login-step', { step: currentStep, phone, error: msg, waitUntil: waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : null })
        if (state.pendingLogin) state.pendingLogin._emitted = true
      }
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
      connectedAt: Date.now(), // v0.87.91: дата подключения для UI
    }
    emit('tg:account-update', state.currentAccount)
    // v0.87.91: загружаем аватарку профиля асинхронно — не блокируем login
    loadOwnAvatar(me).then(avatar => {
      if (avatar) {
        state.currentAccount = { ...state.currentAccount, avatar }
        emit('tg:account-update', state.currentAccount)
      }
    }).catch(e => log('own avatar err: ' + e.message))
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
    // v0.87.101 Слой 4: показываем ПЕРВУЮ ошибку (closure firstError)
    const realErr = firstError || errMsg
    const msg = translateTelegramError(realErr)
    const currentStep = state.pendingLogin?.passwordResolve ? 'password' : (state.pendingLogin?.codeResolve ? 'code' : 'phone')
    if (!state.pendingLogin?._emitted) {
      emit('tg:login-step', { step: currentStep, phone, error: msg })
      if (state.pendingLogin) state.pendingLogin._emitted = true
    }
    // v0.87.98: всегда сбрасываем client+pending после catch — иначе зависшая авторизация
    // блокирует следующую попытку с сообщением "Авторизация уже в процессе".
    state.pendingLogin = null
    try { state.client?.disconnect() } catch(_) {}
    try { state.client?.destroy() } catch(_) {}
    state.client = null
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
      connectedAt: Date.now(), // v0.87.91: дата восстановления сессии (как новое подключение)
    }
    emit('tg:account-update', state.currentAccount)
    // v0.87.91: подгружаем аватарку асинхронно — не блокируем restore
    loadOwnAvatar(me).then(avatar => {
      if (avatar) {
        state.currentAccount = { ...state.currentAccount, avatar }
        emit('tg:account-update', state.currentAccount)
      }
    }).catch(e => log('own avatar err: ' + e.message))
    attachMessageListener()
    startUnreadRescan()
    log('session restored, account=' + state.currentAccount.name)
  } catch (e) {
    log('session restore failed: ' + e.message)
    try { state.client?.disconnect() } catch(_) {}
    state.client = null
  }
}
