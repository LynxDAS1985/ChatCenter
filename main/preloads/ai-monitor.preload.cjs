// v1.2.0 (Этап 4 AI Bridge): preload для AI веб-сайтов (chat.openai.com / chat.deepseek.com /
// claude.ai / giga.chat). По паттерну monitor.preload.cjs (используется для мессенджеров).
//
// Что делает:
// 1. Определяет провайдера по location.hostname через hookType lookup.
// 2. Грузит `hooks/ai/<provider>.hook.js` через fs.readFileSync (как в monitor.preload).
// 3. Инжектит как <script> tag в main world (потому что CSP может блокировать executeJavaScript).
// 4. Регистрирует IPC bridge для общения hook ↔ main:
//    - main → preload (`ai-bridge:webui:inject`): payload {questionId, text, selectors?}
//      → preload вызывает window.__ccAiInjectQuestion(text)
//    - hook → preload (через window.__ccAiBridge) → preload → main:
//      - `ai-bridge:webui:answer-received` {questionId, text}
//      - `ai-bridge:webui:error` {questionId, code, message}
//      - `ai-bridge:webui:log` {level, message} — для отладки
//
// На Этапе 4 файлы hook ещё пустые (Этап 5-6 наполнят). Preload не падает если hook нет.
//
// ВАЖНО:
// - Это CJS файл (загружается preload контекстом). Не использовать ESM import.
// - Не использовать console.* напрямую — только через ipcRenderer.send('app:log', ...).
// - contextBridge не нужен — мы инжектим script в main world, hook сам обращается к window.

;(function () {
  // ── Защита: preload может загрузиться один раз на webview ──
  if (typeof window !== 'undefined' && window.__ccAiPreloadInitialized) return
  if (typeof window !== 'undefined') {
    try { window.__ccAiPreloadInitialized = true } catch (_) {}
  }

  let ipcRenderer
  try { ({ ipcRenderer } = require('electron')) } catch (_) { return }

  const path = require('path')
  const fs = require('fs')

  // ── Мини-логгер (через app:log канал, как в renderer) ──────────────────
  function log(level, message) {
    try {
      ipcRenderer.send('app:log', {
        level: level || 'INFO',
        message: '[ai-monitor.preload] ' + message,
      })
    } catch (_) {}
  }

  // ── Detect провайдера по host ──────────────────────────────────────────
  // Дублируем минимально из aiWebviewConfigs.js — преload не имеет ESM имport.
  const HOST_TO_PROVIDER = {
    'chat.openai.com': 'openai',
    'chatgpt.com': 'openai',
    'chat.deepseek.com': 'deepseek',
    'claude.ai': 'anthropic',
    'giga.chat': 'gigachat',
    'developers.sber.ru': 'gigachat',
  }

  function detectProvider(hostname) {
    if (!hostname) return null
    const h = String(hostname).toLowerCase().replace(/^www\./, '')
    if (HOST_TO_PROVIDER[h]) return HOST_TO_PROVIDER[h]
    // Поддомены
    for (const [pattern, provider] of Object.entries(HOST_TO_PROVIDER)) {
      if (h.endsWith('.' + pattern)) return provider
    }
    return null
  }

  const provider = detectProvider(typeof location !== 'undefined' ? location.hostname : '')

  if (!provider) {
    log('INFO', 'preload загружен но host не распознан как AI провайдер (' + (typeof location !== 'undefined' ? location.hostname : '?') + ')')
    return
  }

  log('INFO', 'detected provider=' + provider + ' on host=' + location.hostname)

  // ── Загрузить hook файл провайдера ─────────────────────────────────────
  const hookPath = path.join(__dirname, 'hooks', 'ai', provider + '.hook.js')
  let hookCode = ''
  try {
    hookCode = fs.readFileSync(hookPath, 'utf8')
  } catch (e) {
    log('WARN', 'hook файл не найден или не читается: ' + hookPath + ' (' + (e && e.code) + ')')
    // На Этапе 4 это нормально — hooks ещё не созданы.
    return
  }

  if (!hookCode || !hookCode.trim()) {
    log('WARN', 'hook файл пустой: ' + hookPath)
    return
  }

  // ── Инжектим hook в main world через <script> tag ───────────────────────
  // (executeJavaScript мог бы тоже подойти, но <script> работает даже при строгом CSP,
  // если preload запущен — потому что preload в isolated world но может trigger DOM операции.)
  function inject() {
    try {
      const s = document.createElement('script')
      s.textContent = hookCode
      s.setAttribute('data-cc-ai-hook', provider)
      ;(document.head || document.documentElement).appendChild(s)
      s.remove()
      log('INFO', 'hook инжектирован, provider=' + provider)
    } catch (e) {
      log('ERROR', 'инъекция hook упала: ' + (e && e.message))
    }
  }

  // Если DOM ещё не готов — ждём DOMContentLoaded
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject, { once: true })
    } else {
      inject()
    }
  }

  // ── Bridge для общения hook ↔ main ─────────────────────────────────────
  // Hook вызывает window.__ccAiBridge.log/answer/error — preload пробрасывает в main IPC.
  // main отправляет ipcRenderer.on('ai-bridge:webui:inject', ...) → preload вызывает window.__ccAiInjectQuestion.
  try {
    // exposing API в main world: используем window.__ccAiBridge (не contextBridge, потому что
    // contextBridge для isolated worlds — а нам нужен main world для hook).
    // Это происходит через <script> тоже, в безопасности нет регрессии — preload изолирован,
    // exposing нужен только для hook ↔ main.
    const bridgeApiScript = `
      ;(function () {
        if (window.__ccAiBridge) return  // уже создан
        const queue = []
        let _handler = null
        window.__ccAiBridge = {
          log: function (level, msg) {
            try { window.postMessage({ __ccAi: 'log', level: level, message: String(msg) }, '*') } catch(_){}
          },
          answer: function (questionId, text) {
            try { window.postMessage({ __ccAi: 'answer', questionId: questionId, text: String(text) }, '*') } catch(_){}
          },
          error: function (questionId, code, message) {
            try { window.postMessage({ __ccAi: 'error', questionId: questionId, code: code, message: String(message) }, '*') } catch(_){}
          },
          setInjectHandler: function (fn) {
            _handler = typeof fn === 'function' ? fn : null
            for (const q of queue) { try { _handler && _handler(q) } catch (_) {} }
            queue.length = 0
          },
          _enqueueInject: function (payload) {
            if (_handler) { try { _handler(payload) } catch (_) {} }
            else queue.push(payload)
          },
        }
      })()
    `
    const bs = document.createElement('script')
    bs.textContent = bridgeApiScript
    bs.setAttribute('data-cc-ai-bridge', 'true')
    ;(document.head || document.documentElement).appendChild(bs)
    bs.remove()
  } catch (e) {
    log('ERROR', 'создание bridge API упало: ' + (e && e.message))
  }

  // ── Слушаем postMessage от hook → пробрасываем в main IPC ──────────────
  if (typeof window !== 'undefined') {
    window.addEventListener('message', function (event) {
      const data = event && event.data
      if (!data || data.__ccAi === undefined) return
      try {
        switch (data.__ccAi) {
          case 'log':
            ipcRenderer.send('app:log', { level: data.level || 'INFO', message: '[ai-hook:' + provider + '] ' + (data.message || '') })
            break
          case 'answer':
            ipcRenderer.send('ai-bridge:webui:answer-received', {
              provider, questionId: data.questionId, text: data.text || '',
            })
            break
          case 'error':
            ipcRenderer.send('ai-bridge:webui:error', {
              provider, questionId: data.questionId, code: data.code, message: data.message,
            })
            break
        }
      } catch (e) {
        log('ERROR', 'postMessage handler упал: ' + (e && e.message))
      }
    })
  }

  // ── Слушаем команды от main → передаём в hook через window.__ccAiBridge ──
  try {
    ipcRenderer.on('ai-bridge:webui:inject', function (_event, payload) {
      // Передаём в main world через <script> вызов
      const code = '(function(){ try { window.__ccAiBridge && window.__ccAiBridge._enqueueInject(' +
        JSON.stringify(payload || {}) + ') } catch(_){} })()'
      try {
        const s = document.createElement('script')
        s.textContent = code
        ;(document.head || document.documentElement).appendChild(s)
        s.remove()
      } catch (e) {
        log('ERROR', 'inject dispatch упал: ' + (e && e.message))
      }
    })
  } catch (e) {
    log('ERROR', 'IPC inject listener не зарегистрирован: ' + (e && e.message))
  }

  // Сообщить main что preload готов (для дебага и для запуска тестов).
  try {
    ipcRenderer.send('ai-bridge:webui:ready', { provider })
  } catch (_) {}
})()
