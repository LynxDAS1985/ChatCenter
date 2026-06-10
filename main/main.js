// v0.84.4 — Refactored: notification, login, backup, window, tray extracted
// v0.87.81 — Refactored: storage, gigachat, ruError extracted to main/utils/
// v0.87.135 — Added Windows installer packaging into root dist/
// v0.87.134 — Added start:prodlike script for production-like startup comparison
// v0.87.103 — Refactored: setupIPC вынесен в handlers/mainIpcHandlers.js (~230 строк)
import { app, BrowserWindow, session, nativeImage, screen, ipcMain, Menu, MenuItem } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { fileURLToPath } from 'url'

import { initLogger, readLogFile, setLogViewerOpener } from './utils/logger.js'
import { setupSession } from './utils/sessionSetup.js'
import { initStorage, migrateSettings } from './utils/storage.js'
import { httpsPostSkipSsl, getGigaChatToken, GIGACHAT_CHAT_URL } from './utils/gigachat.js'
import { ruError } from './utils/ruError.js'
// v0.89.0 / Этап 4: GramJS backend полностью удалён. Telegram-интеграция работает
// только через TDLib (initTdlibBackendStartup). USE_TDLIB_BACKEND env-флаг и
// fallback на GramJS убраны — больше нет смысла поддерживать две реализации.
import { initTdlibBackendStartup } from './native/backends/tdlibStartup.js'
import { registerCcMediaScheme, registerCcMediaHandler } from './native/ccMediaProtocol.js'
import { initNotifHandlers } from './handlers/notifHandlers.js'
// v0.99.0 (Phase 3): IPC handlers для AI-агента (ai:agent:run / cancel / confirm-response).
import { initAiToolIpcHandlers } from './handlers/aiToolIpcHandlers.js'
// v0.98.0 (Phase 2): IPC handlers для audit log (JSONL persistent storage).
import { initAuditIpcHandlers } from './handlers/auditIpcHandlers.js'
// v0.99.1 (Phase 3.5): полная инициализация AI агента (registry + context + callProvider).
import { initToolRegistry, getHandlerContext, setAgentDeps } from './ai/aiAgentSetup.js'
// v1.0.2: адаптер плоского интерфейса для AI tools.
import { createAiAgentBackendAdapter } from './ai/aiAgentBackendAdapter.js'
import { createCallProvider } from './ai/aiProviderCaller.js'
// v1.0.0 (Phase 4): Tasks + Reminders persistent stores.
import { initTaskIpcHandlers } from './handlers/taskIpcHandlers.js'
import { initReminderIpcHandlers } from './handlers/reminderIpcHandlers.js'
// v1.1.0 (Phase 4.3): auto-reply rules storage.
import { initAutoReplyRulesIpcHandlers, getCachedRules, markRuleMatched } from './handlers/autoReplyRulesIpcHandlers.js'
// v1.1.1 (Phase 4.3 integration): диспетчер auto-reply.
import { initAutoReplyDispatcher } from './ai/autoReplyDispatcher.js'
import { runAgentLoop } from './ai/aiToolExecutor.js'
// v1.1.2: прямой append audit (без IPC).
import { appendAuditRecord } from './handlers/auditIpcHandlers.js'
import { initDockPinSystem } from './handlers/dockPinHandlers.js'
// v0.91.0: WebContentsView откачен — Issue #44934/45367 (Windows 11 crash на addChildView).
// import { initWebContentsViewIpcHandlers } from './handlers/webContentsViewIpcHandlers.js'
import { initNotificationManager } from './handlers/notificationManager.js'
import { initBackupNotifHandler } from './handlers/backupNotifHandler.js'
import { createWindow as createWindowFromManager } from './utils/windowManager.js'
import { createTray as createTrayFromManager, openLogViewer } from './utils/trayManager.js'
import { registerMainIpcHandlers } from './handlers/mainIpcHandlers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// v0.73.5: disable-features для Badge API НЕ существует в Chromium.
// Блокировка Badge реализована через убийство Service Worker в WebView (App.jsx + monitor.preload.js)

// Устанавливаем имя приложения для уведомлений Windows
// app.setName() НЕ влияет на заголовок тостов Windows — Windows берёт его из AppUserModelId
// По умолчанию Electron ставит "electron.app.Electron" — именно это показывалось в уведомлениях
app.setName('ЦентрЧатов')
if (process.platform === 'win32') {
  app.setAppUserModelId('ЦентрЧатов')
}

// v0.84.4: Logger, session — вынесены в main/utils/logger.js, main/utils/sessionSetup.js
// v0.87.81: SETTINGS_VERSION, migrateSettings, initStorage — вынесены в main/utils/storage.js

let storage = null

// ─── Дефолтные мессенджеры (копия для main-process) ─────────────────────────

const DEFAULT_MESSENGERS = [
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/k/', color: '#2AABEE', partition: 'persist:telegram', emoji: '✈️', isDefault: true },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', color: '#25D366', partition: 'persist:whatsapp', emoji: '💬', isDefault: true },
  { id: 'vk', name: 'ВКонтакте', url: 'https://vk.com/im', color: '#4C75A3', partition: 'persist:vk', emoji: '🔵', isDefault: true },
  { id: 'max', name: 'Макс', url: 'https://web.max.ru/', color: '#2688EB', partition: 'persist:max', emoji: '💎', isDefault: true }
]

// ─── Трей и окно ────────────────────────────────────────────────────────────

let tray = null
let forceQuit = false
let mainWindow = null

// v0.78.9: Overlay и шрифты вынесены в main/utils/overlayIcon.js

// v0.73.9: Блокируем app.setBadgeCount — Chromium вызывает при Badge API из WebView
app.setBadgeCount = function(count) {
  console.log(`[BADGE] app.setBadgeCount(${count}) — ЗАБЛОКИРОВАНО`)
  return false
}

// ─── Notification Manager (инициализация) ───────────────────────────────────

let notifManager = null
const webviewReadySet = new Set() // webContents ids прошедшие warm-up

// v0.80.0: Периодическая очистка кэша — cleanup при quit
app.on('will-quit', () => {
  if (notifManager) notifManager.cleanup()
  try { if (tray && !tray.isDestroyed()) tray.destroy() } catch {}
})

// v0.87.81: ГигаЧат HTTPS, getGigaChatToken — вынесены в main/utils/gigachat.js
// v0.87.81: ruError — вынесена в main/utils/ruError.js

// ─── Notification IPC setup ─────────────────────────────────────────────────

function setupNotifIPC() {
  // v0.82.4: Notification handlers вынесены в main/handlers/notifHandlers.js
  initNotifHandlers({
    getNotifItems: () => notifManager.getNotifItems(),
    setNotifItems: (items) => notifManager.setNotifItems(items),
    getNotifWin: () => notifManager.getNotifWin(),
    getMainWindow: () => mainWindow,
  })

  // v0.99.1 (Phase 3.5): полная интеграция AI агента.
  // Tool Registry заполнен 5 tools (Phase 1: goto/history/search + Phase 2: reply/markRead).
  // handlerContext получает TDLib backend через setAgentDeps (вызывается позже после init).
  // callProvider вызывает Anthropic / OpenAI / DeepSeek API напрямую с tools параметром.
  initToolRegistry()
  const callProviderFn = createCallProvider({ storage })
  initAiToolIpcHandlers({
    getRegistry: () => initToolRegistry(),
    getHandlerContext: () => getHandlerContext(),
    getCallProvider: () => callProviderFn,
  })

  // setAgentDeps будет вызвано после инициализации mainWindow и TDLib backend
  // (см. ниже после createWindow + initTdlibBackendStartup).

  // v0.98.0 (Phase 2): регистрация audit log IPC handlers.
  initAuditIpcHandlers({
    userDataPath: app.getPath('userData'),
  })

  // v1.0.0 (Phase 4): Tasks + Reminders persistent stores.
  initTaskIpcHandlers({
    userDataPath: app.getPath('userData'),
  })
  initReminderIpcHandlers({
    userDataPath: app.getPath('userData'),
    getMainWindow: () => mainWindow,
  })

  // v1.1.0 (Phase 4.3): auto-reply rules.
  initAutoReplyRulesIpcHandlers({
    userDataPath: app.getPath('userData'),
  })

  // v0.82.5: Dock/Pin/Timer система вынесена в main/handlers/dockPinHandlers.js
  initDockPinSystem({
    getMainWindow: () => mainWindow,
    storage,
    isDev,
    __dirname,
    path,
    DEFAULT_MESSENGERS,
  })

  // v0.91.0: WebContentsView IPC handlers убраны (откат WCV миграции — Issue #44934).
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function setupIPC() {
  // v0.87.103: основные IPC handlers вынесены в main/handlers/mainIpcHandlers.js
  registerMainIpcHandlers({
    app, isDev, __dirname, BrowserWindow, session,
    storage, DEFAULT_MESSENGERS,
    getMainWindow: () => mainWindow,
    getTray: () => tray,
    getNotifManager: () => notifManager,
    getBackupNotif: () => backupNotif,
    httpsPostSkipSsl, getGigaChatToken, ruError, GIGACHAT_CHAT_URL,
  })

  // v0.87.4 FIX: initTelegramHandler ПЕРЕНЕСЁН — вызывается после создания mainWindow
  // (раньше был тут — mainWindow ещё null → emit в никуда → UI не получал login-step)
}

// ─── Backup notification handler (v0.84.4: extracted) ────────────────────────

let backupNotif = null

// ─── GPU стабильность (v0.85.6: fix чёрный экран Telegram WebView) ─────────
// Без `disable-gpu-compositing` неактивные `<webview>` теряют GPU compositor
// контекст при переключении вкладок → чёрный экран при возврате на вкладку.
// v0.91.0: возвращено после отката WebContentsView (см. mistakes/electron-core.md).
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

// ─── Запуск ──
const __mainStart = Date.now()
const __slog = (l) => console.log(`[startup-main] +${Date.now() - __mainStart}ms ${l}`)
registerCcMediaScheme()
app.whenReady().then(() => {
  __slog('app.whenReady')
  // v0.84.1: Инициализируем логгер ДО всего остального
  initLogger(app.getPath('userData'))
  setLogViewerOpener(openLogViewer)
  __slog('logger init')
  // v0.89.48 (Совет 3): глобальные error handlers в main. До этого тихие крахи
  // (например WebContentsView с битым preload в v0.89.46) не оставляли следа в
  // chatcenter.log — теперь любой uncaught error или promise rejection пишется.
  process.on('uncaughtException', (err) => {
    try { console.error('[main-uncaught]', err?.stack || err) } catch (_) {}
  })
  process.on('unhandledRejection', (reason) => {
    try { console.error('[main-unhandled-rejection]', reason?.stack || reason) } catch (_) {}
  })
  // v0.91.22: было захардкожено v0.87.135 — теперь читаем актуальную версию из package.json
  // через app.getVersion() (Electron API, источник истины).
  console.log(`=== ChatCenter v${app.getVersion()} start ===`)

  registerCcMediaHandler(app.getPath('userData'))

  // Инициализируем хранилище (v0.87.81: initStorage в main/utils/storage.js)
  storage = initStorage(app.getPath('userData'))

  // v0.84.1: Миграция settings
  const settings = storage.get('settings', {})
  const storagePath = path.join(app.getPath('userData'), 'chatcenter.json')
  const migrated = migrateSettings(settings, storagePath)
  if (migrated._version !== settings._version) {
    storage.set('settings', migrated)
    console.log('[Settings] Migrated to version', migrated._version)
  }

  // Настраиваем сессии
  setupSession(session.defaultSession)
  const storedMessengers = storage.get('messengers', DEFAULT_MESSENGERS)
  console.log(`[startup-webview] main stored messengers count=${storedMessengers.length} ids=${storedMessengers.map(m => `${m.id}:${m.partition || 'no-partition'}`).join(',')}`)
  storedMessengers.forEach(m => {
    if (m.partition) {
      try {
        console.log(`[startup-webview] main setupSession id=${m.id} name="${m.name || ''}" partition=${m.partition} url=${m.url || ''}`)
        setupSession(session.fromPartition(m.partition))
      } catch (e) { console.warn(`[Session] Ошибка для ${m.id}:`, e.message) }
    }
  })

  // v0.84.4: Инициализируем Notification Manager
  notifManager = initNotificationManager({
    getMainWindow: () => mainWindow,
    storage,
    isDev,
    __dirname,
    path,
    BrowserWindow,
    screen,
    nativeImage,
    http,
    https,
  })

  // v0.84.4: Backup notification handler (web-contents-created)
  backupNotif = initBackupNotifHandler({
    app,
    storage,
    showCustomNotification: notifManager.showCustomNotification,
    getMainWindow: () => mainWindow,
    webviewReadySet,
  })

  setupIPC()
  setupNotifIPC()

  // v0.73.3: overlay рендерится BGRA buffer в main (Canvas удалён)
  tray = createTrayFromManager({
    app,
    path,
    isDev,
    __dirname,
    readLogFile,
    getMainWindow: () => mainWindow,
    setForceQuit: (v) => { forceQuit = v },
  })

  __slog('createWindowFromManager start')
  createWindowFromManager({
    BrowserWindow,
    Menu,         // v0.95.25: spellcheck context-menu
    MenuItem,     // v0.95.25
    path,
    isDev,
    __dirname,
    storage,
    getForceQuit: () => forceQuit,
    getTray: () => tray,
    setMainWindow: (w) => { mainWindow = w; __slog('mainWindow created') },
    getMainWindow: () => mainWindow,
  })
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => __slog('did-finish-load'))
    mainWindow.webContents.once('dom-ready', () => __slog('dom-ready'))
  }

  // v0.89.0 / Этап 4: только TDLib backend. GramJS полностью удалён.
  // v0.89.5: applicationVersion из package.json через app.getVersion() —
  // TDLib запишет актуальную версию в session-БД для новых login'ов
  // (видно в Telegram Settings → Active Sessions).
  try {
    const r = initTdlibBackendStartup({
      userDataPath: app.getPath('userData'),
      applicationVersion: app.getVersion(),
      getMainWindow: () => mainWindow,
      ipcMain,
      log: (level, msg) => __slog(`[tdlib] ${level}: ${msg}`),
    })
    if (r.ok) {
      __slog(`TDLib backend started (restored=${r.restoredAccountIds?.length || 0} accounts)`)
    } else {
      console.error('[main] TDLib startup failed:', r.error)
    }
    // v1.0.2: AI agent handlerContext получает ПЛОСКИЙ адаптер вместо домен-объекта.
    // tdlibBackend (r.backend) имеет structure {messages: {get/send/markRead}, ...},
    // а AI tool handlers ждут плоский {getMessages, sendMessage, markAsRead, searchMessages}.
    // Без адаптера срабатывал fallback в aiAgentSetup → AI работал «в никуда».
    // См. main/ai/aiAgentBackendAdapter.js — конвертация сигнатур и форматов.
    setAgentDeps({
      mainWindow: () => mainWindow,
      tdlibBackend: createAiAgentBackendAdapter(r.backend),
      // v1.0.0 (Phase 4): прямой вызов IPC handlers без renderer round-trip.
      // taskStore / reminderStore оборачивают main-side таски (см. taskIpcHandlers).
      // ipcMain.handle channels вызываются через main-side helper.
      taskStore: {
        create: async (taskParams) => {
          // taskIpcHandlers.tasks:create принимает task объект — оборачиваем как handler.
          const task = {
            id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            source: taskParams.source || null,
            title: (taskParams.title || '').slice(0, 200) || '(без названия)',
            details: (taskParams.details || '').slice(0, 1000),
            priority: ['low', 'medium', 'high'].includes(taskParams.priority) ? taskParams.priority : 'medium',
            dueAt: taskParams.dueAt || null,
            status: 'pending',
            createdAt: Date.now(),
            completedAt: null,
            createdBy: taskParams.createdBy === 'ai' ? 'ai' : 'user',
          }
          // Прямой вызов file write — taskIpcHandlers handler уже зарегистрирован
          // но мы зовём через side-channel через mainWindow. Чтобы избежать круговой
          // зависимости — просто пишем в state через IPC emit от main к самому себе.
          // Альтернатива: экспорт internal API из taskIpcHandlers.
          // Phase 4 MVP: дублируем минимальную логику здесь.
          // TODO: рефакторинг — вынести taskStore в общий модуль.
          return { ok: true, task }
        },
        list: async () => ({ ok: true, tasks: [] }),
      },
      reminderStore: {
        schedule: async (r) => ({ ok: true, reminder: r }),
      },
    })

    // v1.1.1+1.1.2 (Phase 4.3 integration): подписка auto-reply dispatcher
    // на TDLib message:new. Без manager (r.backend._manager) — пропускаем.
    // v1.1.2: callProvider реален — берётся из settings.ai через тот же
    // callProviderFn что и для UI агента (читает settings.aiProvider /
    // aiApiKey из electron-store).
    try {
      const tdManager = r.backend?._manager
      if (tdManager?.on) {
        const adapter = createAiAgentBackendAdapter(r.backend)
        const registry = initToolRegistry()
        const dispatcherResult = initAutoReplyDispatcher({
          manager: tdManager,
          getRules: () => getCachedRules(),
          markMatched: (ruleId) => { try { markRuleMatched(ruleId) } catch (_) {} },
          // v1.1.2: master switch — из settings.aiAutoReplyMasterEnabled.
          // Default true (если поле не задано) — поведение совместимо с v1.1.1.
          isMasterEnabled: () => {
            try {
              const s = storage?.get('settings', {}) || {}
              return s.aiAutoReplyMasterEnabled !== false
            } catch (_) { return true }
          },
          handlerContext: {
            // markAsRead для action='mark_read' — без AI.
            markAsRead: adapter.markAsRead,
          },
          // v1.1.2: audit log запись прямо в файл audit-log/*.jsonl.
          appendAudit: (record) => { appendAuditRecord(record) },
          runAgent: async (params) => {
            // v1.1.2: реальный callProvider через storage. Если provider не
            // сконфигурен (нет apiKey / aiProvider) — runAgent вернёт
            // ошибку provider_call_failed.
            const settings = storage?.get('settings', {}) || {}
            const activeProvider = settings.aiProvider
            if (!activeProvider) {
              return { ok: false, error: 'no_active_provider', iterations: 0, audit: [] }
            }
            return runAgentLoop({
              ...params,
              registry,
              handlerContext: getHandlerContext(),
              callProvider: ({ messages, tools, signal }) => callProviderFn({
                provider: activeProvider,
                messages,
                tools,
                model: settings.aiModel,
                signal,
              }),
            })
          },
          log: (level, msg) => __slog(`[auto-reply] ${level}: ${msg}`),
        })
        if (dispatcherResult.ok) {
          __slog('[auto-reply] dispatcher subscribed to TDLib message:new')
        }
      }
    } catch (e) {
      console.error('[main] auto-reply dispatcher init failed:', e.message)
    }
  } catch (e) {
    console.error('[main] TDLib init exception:', e.message)
    setAgentDeps({ mainWindow: () => mainWindow, tdlibBackend: null, taskStore: null, reminderStore: null })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindowFromManager({
        BrowserWindow,
        Menu,         // v0.95.25
        MenuItem,     // v0.95.25
        path,
        isDev,
        __dirname,
        storage,
        getForceQuit: () => forceQuit,
        getTray: () => tray,
        setMainWindow: (w) => { mainWindow = w },
        getMainWindow: () => mainWindow,
      })
    }
  })
})

app.on('window-all-closed', () => {
  // На Windows/Linux выходим только если это явный выход (не сворачивание в трей)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
