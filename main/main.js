// v0.9.4 — Фикс ресайзера, перевод ошибок API на русский, npm start = dev
import { app, BrowserWindow, ipcMain, session, Tray, Menu, nativeImage, Notification, shell, clipboard } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import crypto from 'node:crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// ─── Простое хранилище (JSON-файл, без ESM-зависимостей) ────────────────────

let storage = null

function initStorage() {
  const filePath = path.join(app.getPath('userData'), 'chatcenter.json')
  let data = {}
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch {}

  const save = () => {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8') } catch (e) {
      console.error('[Storage] Ошибка сохранения:', e.message)
    }
  }

  return {
    get: (key, def = null) => (key in data ? data[key] : def),
    set: (key, val) => { data[key] = val; save() },
    delete: (key) => { delete data[key]; save() }
  }
}

// ─── Дефолтные мессенджеры (копия для main-process) ─────────────────────────

const DEFAULT_MESSENGERS = [
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org/k/', color: '#2AABEE', partition: 'persist:telegram', emoji: '✈️', isDefault: true },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', color: '#25D366', partition: 'persist:whatsapp', emoji: '💬', isDefault: true },
  { id: 'vk', name: 'ВКонтакте', url: 'https://vk.com/im', color: '#4C75A3', partition: 'persist:vk', emoji: '🔵', isDefault: true }
]

// ─── Трей ─────────────────────────────────────────────────────────────────────

let tray = null
let forceQuit = false

function createTrayIcon() {
  // Рисуем синий круг 16x16 в формате BGRA
  const size = 16
  const buf = Buffer.alloc(size * size * 4)
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const r = size / 2 - 1.5

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (d <= r) {
        buf[i] = 238     // B
        buf[i + 1] = 171 // G
        buf[i + 2] = 42  // R
        buf[i + 3] = 255 // A
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function createTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('ЦентрЧатов')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Открыть ЦентрЧатов',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        forceQuit = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)

  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow.show()
    }
  })
}

// ─── Настройка preload-пути ────────────────────────────────────────────────────

function getPreloadPath() {
  if (isDev) {
    return path.join(__dirname, '../../main/preloads/app.preload.js')
  }
  return path.join(__dirname, '../preload/index.js')
}

// ─── Настройка сессий для WebView ─────────────────────────────────────────────

// User-Agent без слова "Electron" — WhatsApp и другие сайты блокируют Electron-браузеры
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

function setupSession(ses) {
  ses.setUserAgent(CHROME_UA)
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(true))
  ses.setPermissionCheckHandler(() => true)

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']

    const csp = headers['content-security-policy'] || headers['Content-Security-Policy']
    if (csp) {
      const fixed = (Array.isArray(csp) ? csp : [csp])
        .map(v => v.replace(/frame-ancestors[^;]*(;|$)/gi, ''))
      headers['content-security-policy'] = fixed
    }
    callback({ responseHeaders: headers })
  })
}

// ─── Главное окно ─────────────────────────────────────────────────────────────

let mainWindow = null

function createWindow() {
  const bounds = storage.get('windowBounds', { width: 1400, height: 900 })

  mainWindow = new BrowserWindow({
    width: bounds.width || 1400,
    height: bounds.height || 900,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#16213e',
      symbolColor: '#ffffff',
      height: 48
    },
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Сохраняем размер/позицию при изменении
  const saveBounds = () => {
    if (mainWindow) storage.set('windowBounds', mainWindow.getBounds())
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  // Свернуть в трей вместо закрытия
  mainWindow.on('close', (e) => {
    const settings = storage.get('settings', { minimizeToTray: true })
    if (!forceQuit && tray && settings.minimizeToTray !== false) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── ГигаЧат: HTTPS без проверки SSL-сертификата Сбербанка ───────────────────

const GIGACHAT_AUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth'
const GIGACHAT_CHAT_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions'
const aiTokenCache = {}

function httpsPostSkipSsl(url, bodyStr, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const agent = new https.Agent({ rejectUnauthorized: false })
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) },
      agent
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(data) }) }
        catch { reject(new Error(`GigaChat parse error: ${data.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

async function getGigaChatToken(clientId, clientSecret) {
  const cacheKey = `${clientId}:${clientSecret}`
  const cached = aiTokenCache[cacheKey]
  if (cached && cached.expires_at > Date.now() + 60000) return cached.access_token

  const credentials = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64')
  const result = await httpsPostSkipSsl(
    GIGACHAT_AUTH_URL,
    'scope=GIGACHAT_API_PERS',
    {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'RqUID': crypto.randomUUID()
    }
  )
  if (!result.ok || !result.data.access_token) {
    throw new Error(`GigaChat auth failed: ${result.data?.message || 'нет токена'}`)
  }
  aiTokenCache[cacheKey] = result.data
  return result.data.access_token
}

// ─── Перевод API-ошибок на русский ───────────────────────────────────────────

function ruError(msg) {
  if (!msg) return 'Неизвестная ошибка'
  const m = msg.toLowerCase()
  if (m.includes('exceeded') && m.includes('quota') || m.includes('insufficient_quota') || m.includes('insufficient balance') || m.includes('insufficient_balance'))
    return 'Недостаточно средств на балансе. Пополните счёт на сайте провайдера'
  if (m.includes('invalid api key') || m.includes('incorrect api key') || m.includes('no api key'))
    return 'Неверный API-ключ. Проверьте ключ в настройках'
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Слишком много запросов. Подождите немного и попробуйте снова'
  if (m.includes('model') && (m.includes('not exist') || m.includes('not found') || m.includes('does not exist')))
    return 'Указанная модель не найдена. Проверьте название модели'
  if (m.includes('context') && m.includes('length'))
    return 'Сообщение слишком длинное для этой модели'
  if (m.includes('can\'t decode') || m.includes('cannot decode') || m.includes('decode') && m.includes('header'))
    return 'Неверный формат Client ID или Client Secret. Убедитесь что скопировали без пробелов'
  if (m.includes('unauthorized') || m.includes('authentication') || m.includes('authorization'))
    return 'Ошибка авторизации. Проверьте Client ID и Client Secret'
  if (m.includes('billing') || m.includes('payment'))
    return 'Проблема с оплатой. Проверьте платёжные данные у провайдера'
  if (m.includes('overloaded') || m.includes('capacity') || m.includes('unavailable'))
    return 'Сервер провайдера перегружен. Попробуйте позже'
  if (m.includes('network') || m.includes('fetch') || m.includes('connect'))
    return 'Нет соединения с сервером провайдера. Проверьте интернет'
  if (m.includes('timeout'))
    return 'Превышено время ожидания ответа от провайдера'
  return msg // не переводим неизвестные — оставляем как есть
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function setupIPC() {
  // Ping
  ipcMain.handle('app:ping', () => ({ ok: true, message: 'ChatCenter работает' }))

  // Информация о приложении
  ipcMain.handle('app:info', () => ({
    ok: true,
    data: { version: app.getVersion(), name: 'ЦентрЧатов', platform: process.platform }
  }))

  // Управление окном
  ipcMain.handle('window:hide', () => {
    mainWindow?.hide()
    return { ok: true }
  })

  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
    return { ok: true }
  })

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
        try { setupSession(session.fromPartition(m.partition)) } catch {}
      }
    })

    return list
  })

  // Мессенджеры — сохранение
  ipcMain.handle('messengers:save', (event, messengers) => {
    storage.set('messengers', messengers)
    // Настраиваем сессии для новых мессенджеров
    messengers.forEach(m => {
      if (m.partition) {
        try { setupSession(session.fromPartition(m.partition)) } catch {}
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

  // Чтение буфера обмена через main process (работает независимо от фокуса окна)
  ipcMain.handle('clipboard:read', () => clipboard.readText())

  // Открыть Electron-окно для входа в ИИ-провайдера через браузер
  // Пользователь входит email+паролем, создаёт API-ключ, копирует →
  // renderer перехватывает его из буфера обмена автоматически
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

      // Автооткрытие DevTools для диагностики (отдельное окно)
      loginWin.webContents.openDevTools({ mode: 'detach' })

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
            d.innerHTML = '<b style="color:#2AABEE;display:block;margin-bottom:5px">📋 ЦентрЧатов ждёт ключ</b>' +
              '<span style="color:#94a3b8">Войдите, создайте API-ключ и <b style="color:#fff">скопируйте его</b> — ' +
              'он автоматически появится в приложении</span>'
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
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-login:closed', { provider })
        }
      })

      return { ok: true }
    } catch (err) {
      console.error(`[LoginWin] КРИТИЧЕСКАЯ ОШИБКА:`, err.message, '\n', err.stack)
      return { ok: false, error: err.message }
    }
  })

  // Уведомление (системное)
  ipcMain.handle('app:notify', (event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: true }).show()
    }
    return { ok: true }
  })

  // Пути к preload-файлам (для WebView-мониторинга)
  ipcMain.handle('app:get-paths', () => ({
    monitorPreload: isDev
      ? path.join(__dirname, '../../main/preloads/monitor.preload.js')
      : path.join(__dirname, '../preload/monitor.js')
  }))

  // Смена цвета нативного titlebar при переключении темы
  ipcMain.handle('window:set-titlebar-theme', (event, theme) => {
    if (mainWindow) {
      mainWindow.setTitleBarOverlay({
        color: theme === 'light' ? '#f0f4f8' : '#16213e',
        symbolColor: theme === 'light' ? '#1e293b' : '#ffffff',
        height: 48
      })
    }
    return { ok: true }
  })

  // ИИ-генерация ответов (OpenAI / Anthropic / DeepSeek / ГигаЧат)
  ipcMain.handle('ai:generate', async (event, { messages, settings: aiCfg }) => {
    const { provider, apiKey, clientSecret, model, systemPrompt } = aiCfg || {}

    try {
      // ── Anthropic Claude ──
      if (provider === 'anthropic') {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ Anthropic (sk-ant-...)' }
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model || 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: systemPrompt || '',
            messages
          })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.content?.[0]?.text || '' }

      // ── DeepSeek (OpenAI-совместимый) ──
      } else if (provider === 'deepseek') {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ DeepSeek' }
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt || '' },
              ...messages
            ]
          })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.choices?.[0]?.message?.content || '' }

      // ── ГигаЧат (Сбербанк) ──
      } else if (provider === 'gigachat') {
        if (!apiKey || !clientSecret) return { ok: false, error: 'Укажите Client ID и Client Secret ГигаЧат' }
        const token = await getGigaChatToken(apiKey.trim(), clientSecret.trim())
        const sysMsg = systemPrompt ? [{ role: 'system', content: systemPrompt }] : []
        const result = await httpsPostSkipSsl(
          GIGACHAT_CHAT_URL,
          JSON.stringify({
            model: model || 'GigaChat',
            messages: [...sysMsg, ...messages]
          }),
          {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        )
        if (!result.ok) return { ok: false, error: ruError(result.data?.error?.message || `HTTP ошибка`) }
        return { ok: true, result: result.data.choices?.[0]?.message?.content || '' }

      // ── OpenAI (default) ──
      } else {
        if (!apiKey) return { ok: false, error: 'Укажите API-ключ OpenAI (sk-...)' }
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt || '' },
              ...messages
            ]
          })
        })
        const data = await resp.json()
        if (data.error) return { ok: false, error: ruError(data.error.message || JSON.stringify(data.error)) }
        return { ok: true, result: data.choices?.[0]?.message?.content || '' }
      }
    } catch (e) {
      return { ok: false, error: ruError(e.message) }
    }
  })
}

// ─── Запуск ───────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Инициализируем хранилище
  storage = initStorage()

  // Настраиваем сессии
  setupSession(session.defaultSession)
  const storedMessengers = storage.get('messengers', DEFAULT_MESSENGERS)
  storedMessengers.forEach(m => {
    if (m.partition) {
      try { setupSession(session.fromPartition(m.partition)) } catch {}
    }
  })

  setupIPC()
  createTray()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // На Windows/Linux выходим только если это явный выход (не сворачивание в трей)
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
