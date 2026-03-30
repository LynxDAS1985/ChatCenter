// v0.84.4: AI Login Window handler — extracted from main.js
// Opens browser window for AI provider login (API key copy flow)

import { ipcMain } from 'electron'

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

let _deps = null

/**
 * @param {Object} deps
 * @param {Function} deps.getMainWindow
 * @param {boolean} deps.isDev
 * @param {string} deps.__dirname
 * @param {Object} deps.path
 * @param {Object} deps.BrowserWindow
 * @param {Object} deps.session
 */
export function initAILoginHandler(deps) {
  _deps = deps
  const { getMainWindow, BrowserWindow, session, path } = deps

  const loginWindows = {}

  ipcMain.handle('ai-login:open', (event, { url, provider, providerLabel }) => {
    console.log(`[LoginWin] Запрос: provider=${provider} url=${url}`)

    try {
      // Если окно уже открыто — фокусируем его
      if (loginWindows[provider] && !loginWindows[provider].isDestroyed()) {
        loginWindows[provider].focus()
        return { ok: true, existed: true }
      }

      // Настраиваем сессию ДО создания окна — Chrome UA + разрешения
      const partitionName = `persist:ai-login-${provider}`
      try {
        const loginSes = session.fromPartition(partitionName)
        loginSes.setUserAgent(CHROME_UA)
        loginSes.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
        loginSes.setPermissionCheckHandler(() => true)
        console.log(`[LoginWin] Сессия настроена: ${partitionName}`)
      } catch (e) {
        console.error(`[LoginWin] Ошибка настройки сессии:`, e.message)
      }

      const loginWin = new BrowserWindow({
        width: 1100,
        height: 750,
        title: `Войти — ${providerLabel || provider}`,
        backgroundColor: '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          partition: partitionName,
        }
      })

      console.log(`[LoginWin] Окно создано ID=${loginWin.id}`)
      loginWindows[provider] = loginWin
      loginWin.setMenu(null)

      // ── Детальное логирование всех событий ──
      loginWin.webContents.on('did-start-loading', () => {
        console.log(`[LoginWin:${provider}] ⏳ did-start-loading`)
      })
      loginWin.webContents.on('did-stop-loading', () => {
        const cur = loginWin.isDestroyed() ? '?' : loginWin.webContents.getURL()
        console.log(`[LoginWin:${provider}] ⏹ did-stop-loading url=${cur}`)
      })
      loginWin.webContents.on('did-navigate', (_ev, navUrl) => {
        console.log(`[LoginWin:${provider}] 🔀 did-navigate: ${navUrl}`)
      })
      loginWin.webContents.on('did-finish-load', () => {
        const wUrl = loginWin.isDestroyed() ? '?' : loginWin.webContents.getURL()
        console.log(`[LoginWin:${provider}] ✅ did-finish-load: ${wUrl}`)
        // Инжектируем плавающую подсказку после успешной загрузки
        loginWin.webContents.executeJavaScript(`
          if (!document.getElementById('__cc_hint')) {
            const d = document.createElement('div')
            d.id = '__cc_hint'
            d.style.cssText = [
              'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
              'background:#1e293b', 'color:#fff', 'padding:14px 18px',
              'border-radius:14px', 'font:14px/1.5 system-ui,sans-serif',
              'box-shadow:0 8px 32px rgba(0,0,0,.5)', 'max-width:320px',
              'border:1.5px solid #2AABEE55', 'pointer-events:none'
            ].join(';')
            // v0.80.0: textContent вместо innerHTML (безопасность)
            var b = document.createElement('b'); b.style.cssText = 'color:#2AABEE;display:block;margin-bottom:5px'; b.textContent = '📋 ЦентрЧатов ждёт ключ'; d.appendChild(b);
            var s = document.createElement('span'); s.style.color = '#94a3b8'; s.textContent = 'Войдите, создайте API-ключ и '; var sb = document.createElement('b'); sb.style.color = '#fff'; sb.textContent = 'скопируйте его'; s.appendChild(sb); s.appendChild(document.createTextNode(' — он автоматически появится в приложении')); d.appendChild(s);
            document.body.appendChild(d)
          }
        `).catch(() => {})
      })
      loginWin.webContents.on('did-fail-load', (ev, code, desc, failedUrl, isMainFrame) => {
        console.error(`[LoginWin:${provider}] ❌ did-fail-load: code=${code} desc="${desc}" url=${failedUrl} isMain=${isMainFrame}`)
        // Показываем ошибку прямо в окне (только для главного фрейма, не data: URL)
        if (isMainFrame && !loginWin.isDestroyed() && !failedUrl.startsWith('data:')) {
          const errPage = `data:text/html;charset=utf-8,` + encodeURIComponent(
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка загрузки</title></head>` +
            `<body style="font-family:system-ui,sans-serif;padding:40px;background:#0f172a;color:#e2e8f0;margin:0">` +
            `<h2 style="color:#f87171;margin:0 0 20px">❌ Ошибка загрузки страницы</h2>` +
            `<table style="font-size:14px;border-spacing:0 6px"><tbody>` +
            `<tr><td style="color:#94a3b8;padding-right:16px">URL</td><td style="color:#fff;font-family:monospace;word-break:break-all">${failedUrl}</td></tr>` +
            `<tr><td style="color:#94a3b8;padding-right:16px">Код</td><td style="color:#fcd34d">${code}</td></tr>` +
            `<tr><td style="color:#94a3b8;padding-right:16px">Описание</td><td style="color:#fcd34d">${desc}</td></tr>` +
            `</tbody></table>` +
            `<div style="margin-top:28px;display:flex;gap:12px">` +
            `<button onclick="location.href='${failedUrl.replace(/'/g, "\\'")}'" style="padding:10px 20px;background:#2AABEE;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Повторить</button>` +
            `</div></body></html>`
          )
          loginWin.loadURL(errPage)
        }
      })
      loginWin.webContents.on('render-process-gone', (_ev, details) => {
        console.error(`[LoginWin:${provider}] 💀 render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`)
      })
      loginWin.webContents.on('unresponsive', () => {
        console.warn(`[LoginWin:${provider}] ⚠️ unresponsive`)
      })

      console.log(`[LoginWin] loadURL → ${url}`)
      loginWin.loadURL(url)

      // При закрытии — уведомляем renderer чтобы остановить polling
      loginWin.on('closed', () => {
        console.log(`[LoginWin:${provider}] Закрыто`)
        delete loginWindows[provider]
        const mw = getMainWindow()
        if (mw && !mw.isDestroyed()) {
          mw.webContents.send('ai-login:closed', { provider })
        }
      })

      return { ok: true }
    } catch (err) {
      console.error(`[LoginWin] КРИТИЧЕСКАЯ ОШИБКА:`, err.message, '\n', err.stack)
      return { ok: false, error: err.message }
    }
  })
}
