// v0.89.0 — Stage 4 / Этап 3.1: TDLib runtime initialization
//
// Один раз на процесс инициализирует TDLib и создаёт TdlibClientManager singleton.
// Используется когда USE_TDLIB_BACKEND=1 — messengerBackend.js → getBackend() →
// initTdlibRuntime() → createTdlibBackend({ manager }).
//
// Безопасность:
//   - Идемпотентен: повторный initTdlibRuntime() возвращает существующий manager.
//   - DI tdl + prebuilt-tdlib через опции (для тестов с mock'ом).
//   - Не запускает реальное соединение — только настраивает библиотеку.
//   - Аккаунты создаются отдельно через manager.createAccount() уже при логине.
//
// Архитектура multi-account:
//   - Один `tdl.configure` на процесс (статический путь к libtdjson).
//   - Один `TdlibClientManager` (Map<accountId, clientRecord>).
//   - На каждый Telegram-аккаунт — `tdl.createClient` с своей `database_directory`.
//   - Sessions хранятся в `${userDataDir}/tdlib-sessions/${accountId}/`.

import path from 'node:path'
import fs from 'node:fs'
import { TdlibClientManager } from './tdlibClient.js'
import { wrapClientForNormalization } from './tdlibNormalize.js'

let _manager = null
let _runtimeState = null  // { tdl, prebuiltTdlib, userDataDir, sessionsDir, configured }

/**
 * Инициализирует TDLib runtime (configure + manager).
 *
 * @param {object} opts
 * @param {string} opts.userDataDir — путь к папке пользовательских данных приложения
 *   (например, app.getPath('userData') в Electron). Используется для tdlib-sessions/.
 * @param {object} [opts.tdl] — модуль 'tdl' (по умолчанию require('tdl'))
 * @param {object} [opts.prebuiltTdlib] — модуль 'prebuilt-tdlib' (по умолчанию require('prebuilt-tdlib'))
 * @param {number} [opts.verbosityLevel=1] — TDLib log verbosity (0 = fatal, 1 = errors)
 * @returns {TdlibClientManager}
 */
export function initTdlibRuntime(opts = {}) {
  if (_manager) return _manager

  if (!opts.userDataDir) throw new Error('initTdlibRuntime: userDataDir required')

  // DI для тестов; в production — реальные модули.
  const tdl = opts.tdl || _requireOrThrow('tdl')
  const prebuiltTdlib = opts.prebuiltTdlib || _requireOrThrow('prebuilt-tdlib')

  // Резолвим путь к libtdjson через prebuilt-tdlib.getTdjson() — он сам определяет
  // win32/linux/darwin платформу.
  const tdjsonPath = prebuiltTdlib.getTdjson()
  if (!tdjsonPath) throw new Error('initTdlibRuntime: prebuilt-tdlib.getTdjson() returned empty path')

  // Конфигурируем TDLib (один раз на процесс).
  tdl.configure({
    tdjson: tdjsonPath,
    verbosityLevel: typeof opts.verbosityLevel === 'number' ? opts.verbosityLevel : 1,
  })

  // Папка для session-файлов аккаунтов: tdlib-sessions/{accountId}/
  const sessionsDir = path.join(opts.userDataDir, 'tdlib-sessions')
  try { fs.mkdirSync(sessionsDir, { recursive: true }) } catch (_) { /* may already exist */ }

  // Manager + фабрика создающая реальный tdl-клиент.
  // clientParams ожидает: { apiId, apiHash, sessionDir? } — собранные в tdlibBackend.startLogin
  // через makeClientParams. Тут оборачиваем в полный tdlib createClient call.
  _manager = new TdlibClientManager({
    clientFactory: (clientParams = {}) => {
      const accountSessionDir = clientParams.sessionDir
        || path.join(sessionsDir, clientParams.accountSubdir || 'pending')
      try { fs.mkdirSync(accountSessionDir, { recursive: true }) } catch (_) {}
      try { fs.mkdirSync(path.join(accountSessionDir, 'files'), { recursive: true }) } catch (_) {}
      const rawClient = tdl.createClient({
        apiId: Number(clientParams.apiId) || 0,
        apiHash: String(clientParams.apiHash || ''),
        databaseDirectory: accountSessionDir,
        filesDirectory: path.join(accountSessionDir, 'files'),
        ...((clientParams.extraOptions) || {}),
      })
      // КРИТИЧНО: tdl эмитит updates с `_` discriminator (не `@type`).
      // Наш код (mapper, manager, messages) работает с `@type`. Обёртка
      // конвертирует `_` → `@type` на входе update events и результатов invoke.
      // Без этого _handleUpdate в TdlibClientManager не распознаёт типы updates
      // → updateAuthorizationState теряется → login flow зависает.
      // (См. main/native/backends/tdlibNormalize.js)
      return wrapClientForNormalization(rawClient)
    },
  })

  _runtimeState = { tdl, prebuiltTdlib, userDataDir: opts.userDataDir, sessionsDir, configured: true, tdjsonPath }
  return _manager
}

/**
 * Возвращает текущий manager (или null если runtime ещё не инициализирован).
 * @returns {TdlibClientManager|null}
 */
export function getTdlibManager() { return _manager }

/**
 * Состояние runtime — для диагностики и тестов.
 */
export function getTdlibRuntimeState() { return _runtimeState }

/**
 * Возвращает путь к папке сессий аккаунта (или общий tdlib-sessions/).
 */
export function getSessionDirForAccount(accountId) {
  if (!_runtimeState?.sessionsDir) return null
  return path.join(_runtimeState.sessionsDir, accountId || 'pending')
}

/**
 * Закрывает все клиенты и сбрасывает singleton. Используется в тестах
 * чтобы изолировать один сценарий от другого.
 *
 * @returns {Promise<void>}
 */
export async function closeTdlibRuntime() {
  if (!_manager) return
  const accountIds = _manager.listAccounts()
  for (const aid of accountIds) {
    try { await _manager.removeAccount(aid) } catch (_) {}
  }
  _manager = null
  _runtimeState = null
}

/**
 * Сканирует sessions-папку и автоматически восстанавливает существующие аккаунты.
 * Вызывается при старте процесса (после initTdlibRuntime), если хотим продолжить
 * с того же места без повторного логина.
 *
 * Каждая подпапка в tdlib-sessions/ считается отдельным аккаунтом. accountId =
 * имя папки (например 'tg_638454350').
 *
 * @param {object} [opts]
 * @param {(accountId: string) => object} [opts.makeClientParams] — для создания
 *   client params для каждой найденной session (apiId, apiHash из config).
 * @returns {Array<string>} — список accountId'ов которые были восстановлены
 */
export function autoRestoreSessionsFromDisk(opts = {}) {
  if (!_manager || !_runtimeState?.sessionsDir) return []
  const dir = _runtimeState.sessionsDir
  if (!fs.existsSync(dir)) return []
  const restored = []
  for (const entry of fs.readdirSync(dir)) {
    const accountDir = path.join(dir, entry)
    try {
      if (!fs.statSync(accountDir).isDirectory()) continue
    } catch (_) { continue }
    // v0.89.0 / Этап 3.6: 'pending' восстанавливаем ТОЛЬКО если там валидная
    // TDLib БД (db.sqlite > 100KB). Пустую папку pending игнорируем — она от
    // отменённого login. Если БД есть — login был успешен, просто не дошёл
    // до finalize (старый код до этапа 3.5). После restore сделаем
    // finalizeAccount → переименование на tg_${userId}.
    if (entry === 'pending') {
      try {
        const dbFile = path.join(accountDir, 'db.sqlite')
        if (!fs.existsSync(dbFile) || fs.statSync(dbFile).size < 100 * 1024) continue
      } catch (_) { continue }
    }
    if (_manager.listAccounts().includes(entry)) continue  // уже создан

    const params = opts.makeClientParams
      ? opts.makeClientParams(entry)
      : { apiId: 0, apiHash: '' }
    try {
      _manager.createAccount(entry, { ...params, sessionDir: accountDir, accountSubdir: entry })
      restored.push(entry)
    } catch (_) { /* silent — пройдём дальше */ }
  }
  return restored
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────

function _requireOrThrow(modName) {
  try {
    return typeof require !== 'undefined' ? require(modName) : null
  } catch (e) {
    throw new Error(`initTdlibRuntime: cannot require '${modName}' — ${e?.message || e}`)
  }
}
