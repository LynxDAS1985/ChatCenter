// v0.89.0 — Stage 4 / Этап 3.3: TDLib backend startup orchestrator
//
// Точка входа для USE_TDLIB_BACKEND=1: связывает все слои (runtime → manager →
// backend → IPC handlers) и подписывает их на жизненный цикл главного окна.
//
// Аналог `initTelegramHandler` для GramJS (telegramHandler.js) — но через
// TDLib stack. main.js при флаге включенном вызывает этот startup вместо
// GramJS точки входа.
//
// БЕЗОПАСНОСТЬ:
//   - Идемпотентен по effect: повторный вызов вернёт существующий handle.
//   - При ошибке возвращает { ok: false, error } чтобы main.js мог fallback'нуться
//     на GramJS (initTelegramHandler).
//   - DI всех зависимостей через опции — для тестов.

import { initTdlibRuntime, autoRestoreSessionsFromDisk, closeTdlibRuntime } from './tdlibRuntime.js'
import { createTdlibBackend } from './tdlibBackend.js'
import { cleanupTgMedia, TG_MEDIA_DEFAULTS } from './tgMediaCleanup.js'
import { buildTdlibParameters } from './tdlibAuth.js'
import { initTdlibIpcHandlers } from '../tdlibIpcHandlers.js'

// Telegram API credentials из конфига приложения.
const DEFAULT_API_ID = 8392940
const DEFAULT_API_HASH = '33a9605b6f86a176e240cc141e864bf5'

let _handle = null

/**
 * Инициализирует TDLib backend и подключает IPC handlers.
 *
 * @param {object} opts
 * @param {string} opts.userDataPath — обычно app.getPath('userData')
 * @param {() => object} opts.getMainWindow — функция возвращающая BrowserWindow
 * @param {object} opts.ipcMain — electron's ipcMain (или mock в тестах)
 * @param {number} [opts.apiId=DEFAULT_API_ID]
 * @param {string} [opts.apiHash=DEFAULT_API_HASH]
 * @param {object} [opts.tdl] — DI для тестов
 * @param {object} [opts.prebuiltTdlib] — DI для тестов
 * @param {(level: string, msg: string) => void} [opts.log]
 * @returns {{ ok: boolean, manager?, backend?, unregister?, error? }}
 */
export function initTdlibBackendStartup(opts) {
  if (_handle) return { ok: true, ..._handle }

  const log = opts.log || ((level, msg) => console.log(`[tdlib-startup ${level}] ${msg}`))

  try {
    if (!opts.userDataPath) throw new Error('userDataPath required')
    if (!opts.ipcMain?.handle) throw new Error('ipcMain required')
    if (typeof opts.getMainWindow !== 'function') throw new Error('getMainWindow required')

    const apiId = opts.apiId || DEFAULT_API_ID
    const apiHash = opts.apiHash || DEFAULT_API_HASH

    // 1. Runtime singleton + manager
    const manager = initTdlibRuntime({
      userDataDir: opts.userDataPath,
      tdl: opts.tdl,
      prebuiltTdlib: opts.prebuiltTdlib,
      verbosityLevel: opts.verbosityLevel,
    })
    log('info', `runtime initialized — userData=${opts.userDataPath}`)

    // v0.89.2: формируем tdlibParameters один раз. Они передаются tdl как option
    // и расширяют первый setTdlibParameters (см. node_modules/tdl/dist/client.js:629).
    // Без этого TDLib видел "Unknown device v1.0 / EN" и не оптимизировал storage.
    const tdlibParameters = buildTdlibParameters({
      applicationVersion: opts.applicationVersion || '0.89.2',
      systemVersion: opts.systemVersion || process.platform,
    })

    // 2. Backend через manager
    // v0.89.3: userDataDir пробрасываем в backend для chat.getCleanupStats —
    // fs-скан tdlib-sessions/ + tg-avatars/.
    const backend = createTdlibBackend({
      manager,
      userDataDir: opts.userDataPath,
      makeClientParams: (accountSubdir) => ({
        apiId, apiHash, tdlibParameters,
        accountSubdir: accountSubdir || undefined,
      }),
    })
    log('info', `backend created (tdlib)`)

    // v0.89.17: фоновая LRU-очистка tg-media/ при старте (не блокирует init).
    // Лимиты 1 ГБ / 7 дней / 5 мин immunity (как Telegram Desktop). См. tgMediaCleanup.js.
    if (opts.userDataPath) setImmediate(() => {
      try {
        const r = cleanupTgMedia(opts.userDataPath, TG_MEDIA_DEFAULTS)
        if (r.removedCount > 0) log('info', `tg-media LRU: freed ${r.freedBytes}b in ${r.removedCount} files`)
      } catch (e) { log('warn', `tg-media cleanup failed: ${e?.message}`) }
    })

    // 3. IPC handlers + event bridge
    const sendToRenderer = (channel, payload) => {
      const win = opts.getMainWindow()
      if (win && !win.isDestroyed?.()) {
        try { win.webContents.send(channel, payload) } catch (e) { /* race during close */ }
      }
    }
    const unregisterIpc = initTdlibIpcHandlers({
      ipcMain: opts.ipcMain, backend, sendToRenderer, log,
      userDataPath: opts.userDataPath,
    })
    log('info', `IPC handlers registered`)

    // 4. Auto-restore previous sessions (если они есть на диске)
    let restoredAccountIds = []
    try {
      restoredAccountIds = autoRestoreSessionsFromDisk({
        makeClientParams: (accountId) => ({ apiId, apiHash, tdlibParameters, accountSubdir: accountId }),
      })
      if (restoredAccountIds.length > 0) {
        log('info', `auto-restored sessions: ${restoredAccountIds.join(', ')}`)
        // v0.89.0 / Этап 3.6: для каждой restored сессии ждём Ready (TDLib читает БД)
        // и финализируем (getMe → rename → emit account:update → UI sidebar).
        // Не await'им весь массив — fire-and-forget с отдельными log'ами по результату.
        for (const aid of restoredAccountIds) {
          ;(async () => {
            const ready = await manager.waitForReady(aid, 15000)
            if (ready.ok) {
              const fin = await manager.finalizeAccount(aid)
              if (fin.ok) log('info', `finalized restored account: ${aid} → ${fin.newAccountId}`)
              else log('warn', `finalize ${aid} failed: ${fin.error}`)
            } else {
              log('warn', `restored ${aid} not Ready: ${ready.state || ready.error}`)
            }
          })().catch((e) => log('warn', `restore-finalize ${aid} err: ${e?.message || e}`))
        }
      }
    } catch (e) {
      log('warn', `auto-restore failed (continuing): ${e?.message || e}`)
    }

    _handle = {
      manager, backend, unregister: () => {
        try { unregisterIpc() } catch (_) {}
        _handle = null
      },
      restoredAccountIds,
    }
    return { ok: true, ..._handle }
  } catch (e) {
    log('error', `init failed: ${e?.message || e}`)
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * Возвращает текущий startup handle (или null если не инициализирован).
 */
export function getTdlibStartupHandle() { return _handle }

/**
 * Сбрасывает singleton — для тестов.
 * Также сбрасывает tdlibRuntime singleton (manager + client connections).
 */
export async function resetTdlibStartup() {
  if (_handle?.unregister) {
    try { _handle.unregister() } catch (_) {}
  }
  _handle = null
  try { await closeTdlibRuntime() } catch (_) {}
}
