// v0.87.85: общий state Telegram-клиента.
// v0.87.105 (ADR-016): multi-account через state.clients: Map<accountId, TelegramClient>.
// state.client / state.currentAccount остаются как алиасы АКТИВНОГО клиента
// для backward-compat существующего кода. Когда нужно маршрутизировать по chatId
// (написать в чат другого аккаунта) — используется getClientForChat(chatId).
// Node.js модули кэшируются — один объект на процесс.
import { Api } from 'telegram'

// api_id / api_hash зашиты — ChatCenter (Demo33) app на my.telegram.org
export const API_ID = 8392940
export const API_HASH = '33a9605b6f86a176e240cc141e864bf5'

// Изменяемый state клиента — через объект, чтобы все модули видели изменения
export const state = {
  // v0.87.105 (ADR-016): multi-account
  clients: new Map(),         // accountId → TelegramClient
  accounts: new Map(),        // accountId → NativeAccount
  activeAccountId: null,      // выбранный аккаунт (для нового login и алиасов)
  sessionsDir: null,          // %APPDATA%/ЦентрЧатов/tg-sessions/

  // Backward-compat алиасы — указывают на АКТИВНЫЙ client/account.
  // Обновляются через setActiveAccount(). НЕ писать напрямую — через хелпер.
  client: null,
  currentAccount: null,

  getMainWindowFn: null,
  sessionPath: null,          // legacy — путь старого ОДНОГО файла (для миграции)
  avatarsDir: null,
  cachePath: null,
  pendingLogin: null,
  unreadRescanTimer: null,
}

// v0.87.14: chatId → entity (для markAsRead / sendMessage).
// v0.87.105: ключ полный — `${accountId}:${chatNumericId}` — уникален между аккаунтами,
// поэтому Map можно держать плоским. accountId всегда извлекается из chatId.
export const chatEntityMap = new Map()

// v0.87.37: chatId → максимальный отправленный maxId (watermark guard в tg:mark-read)
export const markReadMaxSent = new Map()

// v0.87.17: chatId → maxId — собеседник прочитал наши сообщения до этого id (для галочек ✓✓)
export const maxOutgoingRead = new Map()

// v0.87.35: debounce — chatId → timestamp последнего syncPerChatUnread
export const lastPerChatSync = new Map()

export const log = (msg) => { try { console.log('[tg]', msg) } catch(_) {} }

export function emit(channel, data) {
  const win = state.getMainWindowFn?.()
  if (win && !win.isDestroyed()) {
    log(`emit ${channel} ` + (data?.step || (data?.status) || ''))
    win.webContents.send(channel, data)
  } else {
    log(`emit ${channel} SKIPPED — no mainWindow`)
  }
}

// v0.87.105 (ADR-016): извлечь accountId из chatId.
// chatId формат: `${accountId}:${chatNumericId}` (mapDialog в telegramChats.js).
export function accountIdFromChat(chatId) {
  if (!chatId) return null
  const s = String(chatId)
  const i = s.indexOf(':')
  return i > 0 ? s.slice(0, i) : null
}

// v0.87.105 (ADR-016): получить нужный client по chatId.
// Если chatId не передан — возвращает client активного аккаунта (legacy state.client).
export function getClientForChat(chatId) {
  if (!chatId) return state.client
  const accountId = accountIdFromChat(chatId)
  return state.clients.get(accountId) || null
}

// v0.87.105 (ADR-016): получить аккаунт по chatId.
export function getAccountForChat(chatId) {
  const accountId = accountIdFromChat(chatId)
  return accountId ? state.accounts.get(accountId) : null
}

// v0.87.105 (ADR-016): зарегистрировать client+account в Maps.
// Не меняет activeAccountId — для этого setActiveAccount().
export function registerAccount(accountId, client, account) {
  state.clients.set(accountId, client)
  state.accounts.set(accountId, account)
  // Если первый аккаунт — автоматически становится активным
  if (!state.activeAccountId) setActiveAccount(accountId)
}

// v0.87.105 (ADR-016): сделать аккаунт активным.
// Обновляет state.client / state.currentAccount как алиасы (backward-compat).
export function setActiveAccount(accountId) {
  state.activeAccountId = accountId
  state.client = state.clients.get(accountId) || null
  state.currentAccount = state.accounts.get(accountId) || null
}

// v0.87.105 (ADR-016): убрать аккаунт из Maps (logout одного из нескольких).
// Если был активным — переключаемся на другого, либо обнуляем.
export function unregisterAccount(accountId) {
  state.clients.delete(accountId)
  state.accounts.delete(accountId)
  if (state.activeAccountId === accountId) {
    const next = state.clients.keys().next().value || null
    if (next) setActiveAccount(next)
    else { state.activeAccountId = null; state.client = null; state.currentAccount = null }
  }
}

export { Api }
