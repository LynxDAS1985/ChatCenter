// v0.87.103: вынесено из main.js — основные IPC handlers (~230 строк).
// Handlers: app:ping, app:read-log, app:clear-log, app:open-external, app:log,
// app:read-hook, app:info, messengers:load/save, settings:get/save, shell:open-url,
// ai:log-error/get-error-log/clear-error-log, clipboard:read, app:custom-notify,
// app:register-webview, app:get-paths, window:set-titlebar-theme, tray:set-badge.
import { ipcMain, shell, clipboard } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { setupSession } from '../utils/sessionSetup.js'
import { readLogFile, clearLogFile, getLogFilePath } from '../utils/logger.js'
import { createOverlayIcon } from '../utils/overlayIcon.js'
import { initAILoginHandler } from './aiLoginHandler.js'
import { registerWindowHandlers } from './windowHandlers.js'
import { registerPhotoViewerHandler } from './photoViewerHandler.js'
import { registerVideoPlayerHandler } from './videoPlayerHandler.js'
import { initAIHandlers } from './aiHandlers.js'

export function registerMainIpcHandlers(deps) {
  const {
    app, isDev, __dirname, BrowserWindow, session,
    storage, DEFAULT_MESSENGERS,
    getMainWindow, getTray, getNotifManager, getBackupNotif,
    httpsPostSkipSsl, getGigaChatToken, ruError, GIGACHAT_CHAT_URL,
  } = deps

  // Ping
  ipcMain.handle('app:ping', () => ({ ok: true, message: 'ChatCenter работает' }))

  // v0.84.2: Чтение лога для модального окна
  ipcMain.handle('app:read-log', () => readLogFile(500))
  ipcMain.handle('app:clear-log', () => { clearLogFile(); return 'ok' })
  ipcMain.handle('app:open-external', (_, url) => { try { shell.openExternal(url) } catch(_) {} return { ok: true } })
  // v0.84.2: Renderer логирование — пишет в тот же файл лога
  ipcMain.on('app:log', (event, { level, message }) => {
    const ts = new Date().toLocaleString('sv-SE').replace('T', ' ')
    const line = `[${ts}] [R:${level || 'INFO'}] ${message}\n`
    const lp = getLogFilePath()
    if (lp) try { fs.appendFileSync(lp, line) } catch {}
  })

  // v0.82.0: Загрузка per-messenger notification hook
  ipcMain.handle('app:read-hook', (event, hookType) => {
    try {
      const safe = String(hookType).replace(/[^a-z]/gi, '')
      const hooksDir = isDev
        ? path.join(__dirname, '../../main/preloads/hooks')
        : path.join(__dirname, '../preloads/hooks')
      return fs.readFileSync(path.join(hooksDir, safe + '.hook.js'), 'utf8')
    } catch(e) { return '' }
  })

  // Информация о приложении
  ipcMain.handle('app:info', () => ({
    ok: true,
    data: { version: app.getVersion(), name: 'ЦентрЧатов', platform: process.platform }
  }))

  // Управление окном — вынесено в windowHandlers.js (hide/minimize/set-always-on-top)
  registerWindowHandlers(getMainWindow)
  // v0.87.28: отдельное окно просмотра фото
  registerPhotoViewerHandler()
  // v0.87.34: отдельное окно плеера видео со streaming через cc-media://
  registerVideoPlayerHandler()

  // Мессенджеры — загрузка
  ipcMain.handle('messengers:load', () => {
    const stored = storage.get('messengers')
    const list = (stored && stored.length > 0) ? stored : DEFAULT_MESSENGERS

    if (!stored || stored.length === 0) {
      storage.set('messengers', DEFAULT_MESSENGERS)
    }

    // Инициализируем сессии для всех мессенджеров
    list.forEach(m => {
      if (m.partition) {
        try { setupSession(session.fromPartition(m.partition)) } catch (e) { console.warn(`[Session] Ошибка для ${m.id}:`, e.message) }
      }
    })

    return list
  })

  // Мессенджеры — сохранение
  ipcMain.handle('messengers:save', (event, messengers) => {
    // v0.87.1: native_cc — виртуальная вкладка, добавляется программно при старте, не сохранять
    const filtered = (messengers || []).filter(m => !m.isNative && m.id !== 'native_cc')
    storage.set('messengers', filtered)
    // Настраиваем сессии для новых мессенджеров
    filtered.forEach(m => {
      if (m.partition) {
        try { setupSession(session.fromPartition(m.partition)) } catch (e) { console.warn(`[Session] Ошибка для ${m.id}:`, e.message) }
      }
    })
    return { ok: true }
  })

  // Настройки — загрузка
  ipcMain.handle('settings:get', () => {
    return storage.get('settings', { soundEnabled: true, minimizeToTray: true })
  })

  // Настройки — сохранение
  ipcMain.handle('settings:save', (event, settings) => {
    storage.set('settings', settings)
    return { ok: true }
  })

  // Открыть URL в системном браузере (для получения API-ключей)
  ipcMain.handle('shell:open-url', (_, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url)
    }
    return { ok: true }
  })

  // Лог ошибок API — дописывает строку в ai-errors.log в userData
  ipcMain.handle('ai:log-error', (_, { provider, errorText }) => {
    try {
      const logPath = path.join(app.getPath('userData'), 'ai-errors.log')
      const now = new Date().toLocaleString('ru-RU', { hour12: false }).replace(',', '')
      const line = `${now}  ${(provider || 'unknown').padEnd(10)}  ${errorText || ''}\n`
      fs.appendFileSync(logPath, line, 'utf8')
    } catch {}
    return { ok: true }
  })

  // Чтение лога ошибок
  ipcMain.handle('ai:get-error-log', () => {
    try {
      const logPath = path.join(app.getPath('userData'), 'ai-errors.log')
      const text = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
      return { ok: true, text }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // Очистка лога ошибок
  ipcMain.handle('ai:clear-error-log', () => {
    try {
      const logPath = path.join(app.getPath('userData'), 'ai-errors.log')
      fs.writeFileSync(logPath, '', 'utf8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // Чтение буфера обмена через main process (работает независимо от фокуса окна)
  ipcMain.handle('clipboard:read', () => clipboard.readText())

  // v0.84.4: AI Login handler вынесен в main/handlers/aiLoginHandler.js
  initAILoginHandler({
    getMainWindow,
    isDev,
    __dirname,
    path,
    BrowserWindow,
    session,
  })

  // Кастомное уведомление (Messenger Ribbon — v0.39.0)
  ipcMain.handle('app:custom-notify', async (event, payload) => {
    try {
      const result = await getNotifManager().showCustomNotification(payload)
      return { ok: !!result, id: result }
    } catch (e) {
      console.error('[NotifManager] Ошибка:', e.message)
      return { ok: false, error: e.message }
    }
  })

  // v0.84.0: Регистрация webContentsId → messengerId (для multi-account)
  ipcMain.handle('app:register-webview', (event, { webContentsId, messengerId }) => {
    if (webContentsId && messengerId) getBackupNotif()?.registerWebContentMessenger(webContentsId, messengerId)
  })

  // Пути к preload-файлам (для WebView-мониторинга)
  ipcMain.handle('app:get-paths', () => ({
    monitorPreload: isDev
      ? path.join(__dirname, '../../main/preloads/monitor.preload.cjs')
      : path.join(__dirname, '../preload/monitor.mjs')
  }))

  // Смена цвета нативного titlebar при переключении темы
  ipcMain.handle('window:set-titlebar-theme', (event, theme) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.setTitleBarOverlay({
        color: theme === 'light' ? '#f0f4f8' : '#16213e',
        symbolColor: theme === 'light' ? '#1e293b' : '#ffffff',
        height: 48
      })
    }
    return { ok: true }
  })

  // v0.74.5: Overlay badge + тултип трея + раздельный счётчик личные/каналы
  // Принимает { count, personal, channels, breakdown: [{ name, count, personal, channels }] }
  ipcMain.handle('tray:set-badge', async (_, data) => {
    const count = typeof data === 'number' ? data : (data.count || 0)
    const personal = (typeof data === 'object' && data.personal) || 0
    const channels = (typeof data === 'object' && data.channels) || 0
    const breakdown = (typeof data === 'object' && data.breakdown) || []
    const overlayMode = (typeof data === 'object' && data.overlayMode) || 'personal'
    console.log(`[OVERLAY] tray:set-badge count=${count} personal=${personal} channels=${channels} mode=${overlayMode}`)

    // v0.74.6: Трей — чистая иконка без бейджа (бейдж только на overlay)
    const tray = getTray()
    if (tray && !tray.isDestroyed()) {
      // Тултип трея с разбивкой по мессенджерам
      if (count > 0 && breakdown.length > 0) {
        const lines = breakdown.map(b => {
          if (b.personal != null && b.channels != null && (b.personal > 0 || b.channels > 0)) {
            return `${b.name}: ${b.count} (${b.personal} личных, ${b.channels} каналов)`
          }
          return `${b.name}: ${b.count}`
        })
        tray.setToolTip(`ЦентрЧатов\n${lines.join('\n')}\nВсего: ${count} (${personal} личных, ${channels} каналов)`)
      } else if (count > 0) {
        tray.setToolTip(`ЦентрЧатов — ${count} непрочитанных`)
      } else {
        tray.setToolTip('ЦентрЧатов')
      }
    }

    // v0.75.0: Overlay — одно число, режим из настроек: personal / all / off
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      if (overlayMode === 'off') {
        mainWindow.setOverlayIcon(null, '')
        console.log(`[OVERLAY] overlay отключён (mode=off)`)
      } else {
        const overlayCount = overlayMode === 'personal' ? personal : count
        if (overlayCount > 0) {
          const overlayIcon = createOverlayIcon(overlayCount)
          const desc = overlayMode === 'personal'
            ? `${personal} личных (${count} всего)`
            : `${count} непрочитанных`
          mainWindow.setOverlayIcon(overlayIcon, desc)
          console.log(`[OVERLAY] setOverlayIcon(${overlayCount}) mode=${overlayMode} personal=${personal} total=${count}`)
        } else {
          mainWindow.setOverlayIcon(null, '')
          console.log(`[OVERLAY] setOverlayIcon(null) — очищен`)
        }
      }
    }
    return { ok: true }
  })

  // v0.82.2: AI handlers вынесены в main/handlers/aiHandlers.js
  initAIHandlers({ httpsPostSkipSsl, getGigaChatToken, ruError, GIGACHAT_CHAT_URL })
}
