// v0.89.0 — Stage 4 / Этап 2.3: TDLib authorization state machine
//
// Управляет процессом логина по протоколу TDLib:
//   authorizationStateWaitTdlibParameters → setTdlibParameters
//   authorizationStateWaitPhoneNumber     → setAuthenticationPhoneNumber
//   authorizationStateWaitCode             → checkAuthenticationCode
//   authorizationStateWaitPassword         → checkAuthenticationPassword (2FA)
//   authorizationStateReady                → готов
//
// Внешний API повторяет GramJS-вариант (см. telegramAuth.js):
//   startLogin(phone)        → { ok, error?, step: 'code' | 'success' }
//   submitCode(code)          → { ok, step: 'password' | 'success', error? }
//   submitPassword(password)  → { ok, success: true, error? }
//   cancelLogin()             → { ok }
//
// Параметры (apiId, apiHash, databaseDirectory) задаются при создании аккаунта
// через TdlibClientManager.createAccount(). Здесь работа уже с готовым клиентом.

import { setTdlibManager } from './tdlibClient.js'

// Перевод типичных кодов ошибок TDLib на русский для UI.
// TDLib возвращает английские коды («PHONE_CODE_INVALID», «PASSWORD_HASH_INVALID»),
// UI должен показывать понятные сообщения. Если кода нет в таблице — возвращаем как есть.
const ERR_RU = {
  PHONE_NUMBER_INVALID: 'Номер телефона указан в неправильном формате',
  PHONE_NUMBER_BANNED: 'Номер заблокирован в Telegram',
  PHONE_NUMBER_OCCUPIED: 'Номер уже используется другим пользователем',
  PHONE_NUMBER_FLOOD: 'Слишком много попыток. Попробуй позже',
  PHONE_CODE_EMPTY: 'Введите код подтверждения',
  PHONE_CODE_INVALID: 'Неверный код. Проверь и попробуй снова',
  PHONE_CODE_EXPIRED: 'Код устарел. Запроси новый',
  PASSWORD_HASH_INVALID: 'Неверный пароль двухфакторной защиты',
  PASSWORD_EMPTY: 'Введите пароль',
  SESSION_PASSWORD_NEEDED: 'Требуется пароль двухфакторной защиты',
  API_ID_INVALID: 'Ошибка приложения: неверный API ID',
  AUTH_KEY_DUPLICATED: 'Сессия использована на другом устройстве',
}
export function translateTdlibError(msg) {
  if (!msg) return msg
  // TDLib иногда оборачивает: «error: PHONE_CODE_INVALID» — извлекаем код
  const match = String(msg).match(/[A-Z_]{4,}/)
  const code = match ? match[0] : String(msg)
  return ERR_RU[code] || msg
}

// ──────────────────────────────────────────────────────────────────────
// TDLIB PARAMETERS BUILDER
// ──────────────────────────────────────────────────────────────────────

/**
 * Собирает объект параметров для `tdl.createClient({ tdlibParameters: ... })`.
 *
 * tdl расширяет setTdlibParameters через `...this._options.tdlibParameters`
 * (см. node_modules/tdl/dist/client.js:629-637), поэтому ключи api_id, api_hash,
 * database_directory, files_directory, use_test_dc, database_encryption_key —
 * tdl подставляет сам из верхнеуровневых createClient options. Здесь только
 * параметры приложения: device_model, application_version, use_*_database,
 * enable_storage_optimizer.
 *
 * До v0.89.2 функция возвращала полный `setTdlibParameters` объект с `@type` —
 * но он отправлялся в TdlibAuthFlow только теоретически (раннее `return` для
 * `WaitTdlibParameters`) и никуда не доходил. TDLib видел приложение как
 * «Unknown device v1.0 / EN» без storage optimizer.
 *
 * Документация TDLib: https://core.telegram.org/tdlib/docs/structtd_1_1td__api_1_1set_tdlib_parameters.html
 *
 * @param {object} [opts]
 * @param {boolean} [opts.useMessageDatabase=true]
 * @param {boolean} [opts.useFileDatabase=true]
 * @param {boolean} [opts.useChatInfoDatabase=true]
 * @param {string} [opts.systemLanguageCode='ru']
 * @param {string} [opts.deviceModel='ChatCenter']
 * @param {string} [opts.applicationVersion='0.89.2']
 * @param {string} [opts.systemVersion='']
 * @param {boolean} [opts.enableStorageOptimizer=true]
 * @returns {object}
 */
export function buildTdlibParameters(opts = {}) {
  return {
    use_message_database: opts.useMessageDatabase !== false,
    use_file_database: opts.useFileDatabase !== false,
    use_chat_info_database: opts.useChatInfoDatabase !== false,
    use_secret_chats: false,
    system_language_code: opts.systemLanguageCode || 'ru',
    device_model: opts.deviceModel || 'ChatCenter',
    application_version: opts.applicationVersion || '0.89.2',
    system_version: opts.systemVersion || '',
    enable_storage_optimizer: opts.enableStorageOptimizer !== false,
    ignore_file_names: false,
  }
}

// ──────────────────────────────────────────────────────────────────────
// AUTH FLOW
// ──────────────────────────────────────────────────────────────────────

/**
 * Класс инкапсулирующий состояние процесса логина для одного аккаунта.
 * Слушает account:auth-state events от TdlibClientManager.
 */
export class TdlibAuthFlow {
  /**
   * @param {object} opts
   * @param {object} opts.manager — TdlibClientManager
   * @param {string} opts.accountId
   */
  constructor({ manager, accountId }) {
    if (!manager) throw new Error('manager required')
    if (!accountId) throw new Error('accountId required')

    this.manager = manager
    this.accountId = accountId
    // v0.89.2: tdlibParameters больше не передаются сюда — tdl сам формирует
    // setTdlibParameters из createClient options (см. tdlibRuntime.js).
    this.state = 'idle'  // idle | waiting-phone | waiting-code | waiting-password | ready | error | closed

    // Pending resolvers — на каждый submitX-метод
    this._codeResolver = null
    this._passwordResolver = null
    this._readyResolver = null

    this._authHandler = (payload) => {
      if (payload.accountId !== accountId) return
      this._onAuthState(payload.state, payload.payload)
    }
    manager.on('account:auth-state', this._authHandler)
  }

  /**
   * Возвращает клиент TDLib (или null если ещё не создан).
   */
  _client() {
    return this.manager.getClient(this.accountId)
  }

  /**
   * Дисциплинированно отписаться (когда логин завершён или отменён).
   */
  dispose() {
    if (this._authHandler) {
      this.manager.off('account:auth-state', this._authHandler)
      this._authHandler = null
    }
    this._codeResolver = null
    this._passwordResolver = null
    this._readyResolver = null
  }

  // ──────────────────────────────────────────────────────────────
  // EXTERNAL API (вызывается из IPC handlers / UI)
  // ──────────────────────────────────────────────────────────────

  /**
   * Запускает процесс логина. Если TDLib спросит код — резолвится step='code'.
   * Если 2FA не нужен и сразу authorized — резолвится step='success'.
   *
   * @param {string} phone — например '+71234567890'
   * @returns {Promise<{ok: boolean, step?: 'code'|'success', error?: string}>}
   */
  // ВАЖНО: resolver устанавливается СИНХРОННО перед client.invoke(), иначе
  // TDLib может успеть прислать следующий updateAuthorizationState ДО того
  // как resolver зафиксирован → событие потеряется → промис не резолвится.
  startLogin(phone) {
    if (!phone) return Promise.resolve({ ok: false, error: 'phone required' })
    const client = this._client()
    if (!client?.invoke) return Promise.resolve({ ok: false, error: 'client not ready' })

    this.state = 'waiting-phone'
    return new Promise((resolve) => {
      this._codeResolver = resolve
      Promise.resolve(client.invoke({
        '@type': 'setAuthenticationPhoneNumber',
        phone_number: String(phone),
      })).catch((e) => {
        if (this._codeResolver === resolve) {
          this._codeResolver = null
          this.state = 'error'
          resolve({ ok: false, error: translateTdlibError(e?.message || String(e)) })
        }
      })
    })
  }

  /**
   * @param {string} code — код из SMS
   * @returns {Promise<{ok: boolean, step?: 'password'|'success', error?: string}>}
   */
  submitCode(code) {
    if (!code) return Promise.resolve({ ok: false, error: 'code required' })
    const client = this._client()
    if (!client?.invoke) return Promise.resolve({ ok: false, error: 'client not ready' })

    return new Promise((resolve) => {
      this._passwordResolver = resolve
      Promise.resolve(client.invoke({ '@type': 'checkAuthenticationCode', code: String(code) })).catch((e) => {
        if (this._passwordResolver === resolve) {
          this._passwordResolver = null
          resolve({ ok: false, error: translateTdlibError(e?.message || String(e)) })
        }
      })
    })
  }

  /**
   * @param {string} password — 2FA пароль
   * @returns {Promise<{ok: boolean, success?: true, error?: string}>}
   */
  submitPassword(password) {
    if (!password) return Promise.resolve({ ok: false, error: 'password required' })
    const client = this._client()
    if (!client?.invoke) return Promise.resolve({ ok: false, error: 'client not ready' })

    return new Promise((resolve) => {
      this._readyResolver = resolve
      Promise.resolve(client.invoke({ '@type': 'checkAuthenticationPassword', password: String(password) })).catch((e) => {
        if (this._readyResolver === resolve) {
          this._readyResolver = null
          resolve({ ok: false, error: translateTdlibError(e?.message || String(e)) })
        }
      })
    })
  }

  /**
   * Отменяет процесс логина и закрывает клиента.
   * @returns {Promise<{ok: boolean}>}
   */
  async cancelLogin() {
    const client = this._client()
    if (client?.invoke) {
      try { await client.invoke({ '@type': 'logOut' }) } catch (_) {}
    }
    this.state = 'closed'
    this._rejectPending('cancelled')
    this.dispose()
    return { ok: true }
  }

  // ──────────────────────────────────────────────────────────────
  // PRIVATE: state handler
  // ──────────────────────────────────────────────────────────────

  _onAuthState(stateName, payload) {
    const client = this._client()
    if (!client?.invoke) return

    if (stateName === 'authorizationStateWaitTdlibParameters') {
      // НЕ отправляем setTdlibParameters сами — tdl автоматически это делает
      // через _handleAuthInit (см. node_modules/tdl/dist/client.js строка 610-650).
      // tdl использует apiId/apiHash/databaseDirectory из createClient options.
      // Если мы попытаемся отправить второй раз — TDLib вернёт "Unexpected setTdlibParameters".
      return
    }

    if (stateName === 'authorizationStateWaitPhoneNumber') {
      // Ждём пока внешний код вызовет startLogin(phone) — TDLib пока ничего не делает.
      this.state = 'waiting-phone'
      return
    }

    if (stateName === 'authorizationStateWaitCode') {
      this.state = 'waiting-code'
      // Если startLogin() ждёт результата — резолвим step='code'.
      if (this._codeResolver) {
        const r = this._codeResolver
        this._codeResolver = null
        r({ ok: true, step: 'code' })
      }
      return
    }

    if (stateName === 'authorizationStateWaitPassword') {
      this.state = 'waiting-password'
      // submitCode() ждёт результата — резолвим step='password'.
      if (this._passwordResolver) {
        const r = this._passwordResolver
        this._passwordResolver = null
        r({ ok: true, step: 'password' })
      }
      return
    }

    if (stateName === 'authorizationStateReady') {
      this.state = 'ready'
      // Если в submitPassword() или submitCode() ждут — резолвим success.
      if (this._readyResolver) {
        const r = this._readyResolver
        this._readyResolver = null
        r({ ok: true, success: true })
      } else if (this._passwordResolver) {
        // Логин без 2FA — после code сразу ready (без waitPassword промежуточного)
        const r = this._passwordResolver
        this._passwordResolver = null
        r({ ok: true, step: 'success' })
      } else if (this._codeResolver) {
        // Совсем редкий случай — saved session, без code
        const r = this._codeResolver
        this._codeResolver = null
        r({ ok: true, step: 'success' })
      }
      return
    }

    if (stateName === 'authorizationStateClosed' || stateName === 'authorizationStateLoggingOut') {
      this.state = 'closed'
      this._rejectPending('closed')
      return
    }

    if (stateName === 'authorizationStateWaitEmailAddress' || stateName === 'authorizationStateWaitEmailCode') {
      // Опционально — email auth. Не поддерживаем сейчас, возвращаем ошибку.
      this._rejectPending('email auth not supported')
      return
    }

    if (stateName === 'authorizationStateWaitRegistration') {
      // v0.89.2: TDLib шлёт это состояние когда номер ВАЛИДЕН, но Telegram-аккаунта
      // ещё нет (регистрация нового пользователя). ChatCenter — b2b для уже
      // существующих пользователей, регистрация через приложение не поддерживается.
      // Канонический recovery: invoke('registerUser', { first_name, last_name }) —
      // отдельная фича отдельного этапа.
      this._rejectPending('У этого номера ещё нет аккаунта Telegram. Зарегистрируйтесь через официальное приложение Telegram.')
      return
    }

    // Иные состояния (WaitOtherDeviceConfirmation, и т.п.) — fallback в ошибку.
    if (stateName?.startsWith('authorizationStateWait')) {
      this._rejectPending(`unsupported state: ${stateName}`)
    }
  }

  _rejectPending(reason) {
    for (const key of ['_codeResolver', '_passwordResolver', '_readyResolver']) {
      const r = this[key]
      if (r) {
        this[key] = null
        r({ ok: false, error: translateTdlibError(reason) })
      }
    }
  }
}

// Singleton helper — для удобства из IPC handlers.
let _activeFlow = null
export function getActiveFlow() { return _activeFlow }
export function setActiveFlow(flow) { _activeFlow = flow }

// Re-export для удобства (чтобы tdlibAuth.js был единой точкой импорта)
export { setTdlibManager }
