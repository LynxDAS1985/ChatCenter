// v1.2.22: Вариант A — открыть Макс (или другой мессенджер) в ОТДЕЛЬНОМ окне для проверки
// ServiceWorker-уведомлений.
//
// КОНТЕКСТ (почему отдельное окно, а не WebContentsView внутри главного):
//   Внутри главного окна дочерний WebContentsView (`contentView.addChildView` + `loadURL`)
//   КРАШИТ Electron нативно на Windows 11. Это известный баг Electron, помечен «not planned»:
//     - https://github.com/electron/electron/issues/44934
//     - https://github.com/electron/electron/issues/47247
//   Подробности и история 16 версий поиска — .memory-bank/mistakes/electron-core.md.
//   Документированный рабочий путь сосуществования `<webview>` и нормального WebContents —
//   ОТДЕЛЬНЫЕ ОКНА (electron-core.md правило в конце записи).
//
//   Это ОБЫЧНЫЙ BrowserWindow (не `<webview>`, не child WebContentsView) → нормальный
//   WebContents, где ServiceWorker и Notification работают штатно. Баг #44934 тут не
//   срабатывает (это верхнеуровневое окно). Если страница упадёт — закроется ТОЛЬКО это
//   окно, главная программа продолжит работать.
//
// IPC:
//   max-test:open  { url, partition }  → создать (или вернуть существующее) окно
//   max-test:close                     → закрыть окно
//
// Диагностика: console-сообщения страницы с ключевыми словами (service worker / notification /
// __CC_NOTIF__ / push) пишутся в chatcenter.log с префиксом `[max-test]` — чтобы видеть,
// регистрируется ли SW и приходят ли уведомления.

let testWindow = null

export function initMaxTestWindowHandler({ ipcMain, BrowserWindow, path, isDev, __dirname }) {
  const resolveMonitorPreload = () => (isDev
    ? path.join(__dirname, '../../main/preloads/monitor.preload.cjs')
    : path.join(__dirname, '../preload/monitor.mjs'))

  ipcMain.handle('max-test:open', (_e, { url, partition } = {}) => {
    const targetUrl = url || 'https://web.max.ru/'
    try {
      // Уже открыто — не пересоздаём и НЕ воруем фокус (эффект в renderer может ре-сработать).
      if (testWindow && !testWindow.isDestroyed()) {
        return { ok: true, reused: true }
      }
      const preload = resolveMonitorPreload()
      testWindow = new BrowserWindow({
        width: 1100,
        height: 820,
        title: 'Макс — тест уведомлений (отдельное окно)',
        backgroundColor: '#1a1a2e',
        show: false,
        webPreferences: {
          partition: partition || undefined,
          preload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          backgroundThrottling: false,
        },
      })
      console.log(`[max-test] open url=${targetUrl} partition=${partition || '(none)'} preload=${preload}`)

      // Диагностика: следим за SW / уведомлениями в console страницы.
      try {
        testWindow.webContents.on('console-message', (...args) => {
          // Electron 36+: (event{level,message,...}); раньше: (event, level, message, line, sourceId)
          let msg = ''
          const a0 = args[0]
          if (a0 && typeof a0 === 'object' && typeof a0.message === 'string') msg = a0.message
          else if (typeof args[2] === 'string') msg = args[2]
          if (/__CC_NOTIF__|service.?worker|notification|push|sw[-_ ]/i.test(msg)) {
            console.log('[max-test] page: ' + String(msg).slice(0, 300))
          }
        })
      } catch (_) {}

      testWindow.webContents.on('did-finish-load', () => console.log('[max-test] did-finish-load'))
      testWindow.webContents.on('did-fail-load', (_ev, code, desc, u, isMainFrame) => {
        if (isMainFrame) console.error(`[max-test] did-fail-load code=${code} "${desc}" url=${u}`)
      })
      testWindow.webContents.on('render-process-gone', (_ev, d) => {
        console.error(`[max-test] render-process-gone reason=${d?.reason} exit=${d?.exitCode}`)
      })

      testWindow.once('ready-to-show', () => { try { testWindow?.show() } catch (_) {} })
      testWindow.on('closed', () => { testWindow = null })

      testWindow.loadURL(targetUrl)
        .then(() => console.log('[max-test] loadURL settled'))
        .catch((e) => console.error('[max-test] loadURL failed: ' + (e?.message || e)))
      return { ok: true }
    } catch (e) {
      console.error('[max-test] open FAILED: ' + (e?.message || e))
      try { testWindow?.destroy() } catch (_) {}
      testWindow = null
      return { ok: false, error: e?.message || String(e) }
    }
  })

  ipcMain.handle('max-test:close', () => {
    try {
      if (testWindow && !testWindow.isDestroyed()) {
        testWindow.close()
        console.log('[max-test] closed by request')
      }
    } catch (_) {}
    testWindow = null
    return { ok: true }
  })
}

// Для тестов
export function _getMaxTestWindowForTests() { return testWindow }
