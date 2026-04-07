// v0.47.0 — ChatMonitor: enriched addedNodes — имя отправителя + аватарка из DOM активного чата
// Бейдж считает ВСЕ непрочитанные (включая muted), уведомления — только не-muted
// Cooldown 10 сек при запуске, чтобы не слать старые сообщения как новые
// v0.84.3: Вынесены модули в main/preloads/utils/ — chatMetadata, messageExtractor, domSelectors, diagnostics, messageRetrieval
const { ipcRenderer } = require('electron')

// ── v0.82.0: Per-messenger notification hooks ────────────────────────────────
// Каждый мессенджер имеет СВОЙ hook файл: main/preloads/hooks/{type}.hook.js
// Preload загружает файл через fs.readFileSync и инжектит как <script> tag в main world
// Если CSP мессенджера блокирует <script> — App.jsx использует тот же файл через executeJavaScript
;(function injectNotifHook() {
  try {
    var path = require('path')
    var fs = require('fs')
    var host = location.hostname
    var hookType = 'telegram' // default
    if (host.includes('whatsapp')) hookType = 'whatsapp'
    else if (host.includes('vk.com')) hookType = 'vk'
    else if (host.includes('max.ru')) hookType = 'max'
    else if (host.includes('telegram')) hookType = 'telegram'
    var hookPath = path.join(__dirname, 'hooks', hookType + '.hook.js')
    var hookCode = ''
    try { hookCode = fs.readFileSync(hookPath, 'utf8') } catch(e) {
      try { hookCode = fs.readFileSync(path.join(__dirname, 'hooks', 'telegram.hook.js'), 'utf8') } catch(e2) {}
    }
    if (hookCode) {
      var s = document.createElement('script')
      s.textContent = hookCode
      ;(document.head || document.documentElement).appendChild(s)
      s.remove()
    }
  } catch(e) {}
})()

// v0.82.0: inline hook УДАЛЁН — код перенесён в hooks/{telegram|max|whatsapp|vk}.hook.js
// Ниже был inline код (230 строк): findAvatar, findSenderInChatlist, enrichNotif,
// isSpamNotif, Notification override, showNotification override, Badge/SW/Audio block.
// Теперь каждый мессенджер имеет свой файл с собственными селекторами и фильтрами.
// Изменение hook для MAX не затрагивает Telegram, и наоборот.

// v0.82.3: Unread counters вынесены в отдельный файл
const { getMessengerType, isActiveChatMuted, isActiveChatChannel, countUnread } = require('./utils/unreadCounters')

// v0.84.3: Extracted modules
const { getActiveChatSender, getActiveChatAvatar } = require('./utils/chatMetadata')
const { EXTRACT_SPAM, QUICK_MSG_SELECTORS, extractMsgText } = require('./utils/messageExtractor')
const { CHAT_CONTAINER_SELECTORS, findChatContainer, isSidebarNode, getChatContainerEl, setChatContainerEl } = require('./utils/domSelectors')
const { runDiagnostics, resetDiagnostics } = require('./utils/diagnostics')
const { getLastMessageText, getVKLastIncomingText } = require('./utils/messageRetrieval')

// v0.83.0: Timing constants (вместо magic numbers)
const GRACE_PERIOD = 15000        // Grace period после навигации (VK Virtual Scroll медленный)
const RETRY_SHORT = 3000          // Retry chatObserver если контейнер не найден
const SNAPSHOT_DELAY = 13000      // Задержка создания snapshot после навигации
const COOLDOWN_MSG = 3000         // Cooldown между уведомлениями
const WARMUP_DELAY = 10000        // Начальный warmup (не слать старые сообщения)
const NAV_POLL_INTERVAL = 2000    // Polling навигации SPA

// Debounce для MutationObserver
let updateTimer = null
const UPDATE_DEBOUNCE = 300 // ms

let lastCount = -1
let _waUnreadDiagCount = 0 // v0.86.0: диагностика WhatsApp unread (первые 3 вызова)
let lastSentText = null
let lastActiveMessageText = null  // для детекции сообщений в активном чате
let lastActiveMessageTime = 0     // cooldown: не спамить уведомлениями
let observer = null

// ── Quick addedNodes detection (v0.46.3) ─────────────────────────────────────
// MAX и другие мессенджеры НЕ вызывают Notification для каждого сообщения,
// И unread count НЕ растёт когда чат открыт в WebView.
// Решение: наблюдаем addedNodes в MutationObserver — при появлении нового
// DOM-элемента с текстом → считаем как новое сообщение → new-message IPC.
let lastQuickMsgText = ''
let lastQuickMsgTime = 0

function quickNewMsgCheck(mutations, type) {
  const now = Date.now()
  if (now - lastQuickMsgTime < COOLDOWN_MSG) return // cooldown — не спамить

  // v0.60.0 Решение #3: Обновить кэш контейнера чата если он потерялся (SPA навигация)
  let _chatContainerEl = getChatContainerEl()
  if (!_chatContainerEl || !_chatContainerEl.isConnected) {
    _chatContainerEl = findChatContainer(type)
    setChatContainerEl(_chatContainerEl)
  }

  for (let mi = mutations.length - 1; mi >= 0; mi--) {
    const m = mutations[mi]
    if (m.type !== 'childList' || !m.addedNodes.length) continue
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue
      // Пропускаем UI-элементы: кнопки, инпуты, иконки, стили, скрипты
      const tag = node.tagName
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' ||
          tag === 'SVG' || tag === 'IMG' || tag === 'STYLE' || tag === 'SCRIPT' || tag === 'LINK') continue
      // v0.60.0 Решение #3: структурный DOM-фильтр
      // Если chatObserver на body fallback — фильтруем sidebar и внешние ноды
      if (chatObserverTarget === 'body-fallback') {
        // v0.76.8: ВСЕГДА проверяем isSidebarNode при body-fallback
        if (isSidebarNode(node)) continue
        // Если контейнер чата известен — пропускаем ноды вне него
        if (_chatContainerEl && !_chatContainerEl.contains(node)) continue
      }

      let text = ''
      const childCount = node.querySelectorAll ? node.querySelectorAll('*').length : 0

      if (childCount <= 40) {
        // Простой node — берём textContent напрямую
        text = extractMsgText(node, type)
      } else if (childCount <= 200) {
        // v0.82.1: Per-messenger deep scan селекторы
        const candidates = node.querySelectorAll(QUICK_MSG_SELECTORS[type] || QUICK_MSG_SELECTORS.telegram)
        // Берём последний подходящий текст (новое сообщение = внизу)
        for (let ci = candidates.length - 1; ci >= Math.max(0, candidates.length - 10); ci--) {
          const t = extractMsgText(candidates[ci], type)
          if (t && t !== lastQuickMsgText && t !== lastSentText && t !== lastActiveMessageText) {
            text = t
            break
          }
        }
        // Fallback: ищем любой короткий текстовый node внизу DOM
        if (!text) {
          const allText = node.querySelectorAll('span, p, div')
          for (let ti = allText.length - 1; ti >= Math.max(0, allText.length - 20); ti--) {
            const el = allText[ti]
            // Пропускаем элементы с children (не leaf nodes)
            if (el.children && el.children.length > 2) continue
            const t = extractMsgText(el, type)
            if (t && t.length >= 2 && t.length <= 200 && t !== lastQuickMsgText && t !== lastSentText && t !== lastActiveMessageText) {
              text = t
              break
            }
          }
        }
      } else {
        continue // >200 children — слишком сложный контейнер (модалки, целые страницы)
      }

      if (!text) continue
      // Dedup: не повторяем тот же текст
      if (text === lastQuickMsgText || text === lastSentText || text === lastActiveMessageText) continue
      // v0.76.8: Дедуп по подстроке — VK parent содержит "ИмяТекст", child содержит "Текст"
      if (lastQuickMsgText && (lastQuickMsgText.includes(text) || text.includes(lastQuickMsgText))) continue

      // Это новый DOM-элемент с текстом → вероятно новое сообщение
      lastQuickMsgText = text
      lastQuickMsgTime = now
      lastSentText = text
      lastActiveMessageText = text
      lastActiveMessageTime = now
      try { ipcRenderer.sendToHost('new-message', text) } catch {}
      // Эмиттим __CC_MSG__ — App.jsx обогатит через executeJavaScript (v0.55.1)
      // НЕ эмиттим __CC_NOTIF__ — чтобы не задедупить enriched версию из showNotification override
      try { console.log('__CC_DIAG__msg-src: CO | "' + text.slice(0,30) + '"') } catch {}
      try { console.log('__CC_MSG__' + text) } catch {}
      return // одно сообщение за callback — не спамить
    }
  }
}

// Защита от ложных срабатываний при загрузке страницы:
// первые 10 секунд не сообщаем о "новых" сообщениях — страница ещё грузится
let monitorReady = false
setTimeout(() => {
  monitorReady = true
  // Инициализируем lastActiveMessageText текущим текстом в DOM
  // чтобы первое обнаруженное сообщение (старое!) не считалось "новым"
  const type = getMessengerType()
  if (type) {
    try {
      const text = getLastMessageText(type)
      if (text) { lastActiveMessageText = text; lastSentText = text }
    } catch {}
  }
}, WARMUP_DELAY)

function sendUpdate(type) {
  const { personal, channels, total, allTotal } = countUnread(type)
  // v0.86.0: диагностика WhatsApp unread count
  if (type === 'whatsapp' && _waUnreadDiagCount < 3) {
    _waUnreadDiagCount++
    try { console.log('__CC_DIAG__wa-unread: allTotal=' + allTotal + ' personal=' + personal + ' lastCount=' + lastCount + ' title="' + document.title + '"') } catch(e) {}
  }
  if (allTotal !== lastCount) {
    const increased = total > lastCount && lastCount >= 0 && monitorReady
    if (type === 'whatsapp') {
      try { console.log('__CC_DIAG__wa-count-change: ' + lastCount + '→' + allTotal + ' increased=' + increased + ' ready=' + monitorReady + ' title="' + document.title + '"') } catch(e) {}
    }
    lastCount = allTotal
    // Общий счётчик (для бейджа) — ВСЕ непрочитанные, включая muted
    try { ipcRenderer.sendToHost('unread-count', allTotal) } catch {}
    // Раздельный счётчик (личные vs каналы/группы) — без muted
    try { ipcRenderer.sendToHost('unread-split', { personal, channels }) } catch {}

    // Умный фильтр: уведомляем только если НЕ-muted чат с ростом (не канал, не muted)
    if (increased && !isActiveChatMuted(type) && !isActiveChatChannel(type)) {
      const text = getLastMessageText(type)
      if (text && text !== lastSentText) {
        lastSentText = text
        lastActiveMessageText = text  // синхронизируем
        try { ipcRenderer.sendToHost('new-message', text) } catch {}
        // Backup: дублируем через console.log для main-process перехвата (v0.39.5)
        try { console.log('__CC_DIAG__msg-src: UC | "' + text.slice(0,30) + '"') } catch {}
        try { console.log('__CC_MSG__' + text) } catch {}
      }
    }
  }

  // v0.59.1: Path 2 — детекция НОВОГО сообщения в АКТИВНОМ чате (когда unread count не растёт)
  // Корень проблемы: если пользователь на вкладке мессенджера и чат открыт → VK/WhatsApp
  // НЕ считают сообщение непрочитанным → count не растёт → Path 1 не работает.
  // Path 2 вызывает getLastMessageText() при каждом debounced sendUpdate и сравнивает с lastActiveMessageText.
  // Защита от мусора: текст берётся из CSS-селекторов СООБЩЕНИЙ (не sidebar), cooldown 3 сек.
  // v0.81.1: Path 2 отключён для VK (v0.81.0) и MAX — getLastMessageText ненадёжен (фантомы при смене чата)
  if (monitorReady && type !== 'telegram' && type !== 'vk' && type !== 'max') {
    const inText = getLastMessageText(type)
    if (inText && inText !== lastActiveMessageText && inText !== lastSentText) {
      const now = Date.now()
      if (now - lastActiveMessageTime > COOLDOWN_MSG) {
        lastSentText = inText
        lastActiveMessageText = inText
        lastActiveMessageTime = now
        try { ipcRenderer.sendToHost('new-message', inText) } catch {}
        try { console.log('__CC_DIAG__msg-src: P2 | "' + inText.slice(0,30) + '"') } catch {}
        try { console.log('__CC_MSG__' + inText) } catch {}
      }
    }
    // Обновляем lastActiveMessageText для dedup (даже если не отправили)
    if (inText && inText !== lastActiveMessageText) { try { console.log('__CC_DIAG__lastActive-chg: "' + (lastActiveMessageText||'').slice(0,25) + '" → "' + inText.slice(0,25) + '"') } catch(e) {} }
    if (inText) lastActiveMessageText = inText
  } else if (monitorReady && type === 'telegram') {
    const inText = getLastMessageText(type)
    if (inText) lastActiveMessageText = inText
  }
}

// v0.59.1: Отдельный observer для области чата (пузыри сообщений)
// Привязывается к контейнеру чата. Если не найден — fallback на document.body с фильтрацией sidebar
let chatObserver = null
let chatObserverTarget = null // 'container' | 'body' — для диагностики
let chatObserverRetries = 0
const CHAT_OBSERVER_MAX_RETRIES = 5 // 5 попыток × 3 сек = 15 сек

function startChatObserver(type) {
  if (chatObserver) { chatObserver.disconnect(); chatObserver = null }
  if (type === 'telegram') return // TG работает через __CC_NOTIF__
  if (type === 'vk') return // v0.81.2: VK работает через unread-count (UC), chatObserver создаёт фантомы

  const container = findChatContainer(type)
  chatObserverRetries++

  if (container) {
    setChatContainerEl(container) // кэшируем для структурного фильтра
    // Нашли контейнер чата — наблюдаем только его
    chatObserverTarget = 'container:' + (container.className || container.tagName).slice(0, 60)
    // v0.80.7: Snapshot — запоминаем текст последнего пузыря при привязке
    var _snapshotTexts = new Set()
    try {
      var lastChildren = container.querySelectorAll('*')
      for (var si = 0; si < lastChildren.length; si++) {
        var stxt = (lastChildren[si].textContent || '').trim()
        if (stxt.length > 5 && stxt.length < 500) _snapshotTexts.add(stxt)
      }
    } catch(e) {}
    var _bindTs = Date.now()

    chatObserver = new MutationObserver((mutations) => {
      // v0.80.7: Диагностика — логируем мутации с timestamp (секунды после привязки)
      var elapsed = ((Date.now() - _bindTs) / 1000).toFixed(1)
      if (elapsed < 30) {
        var addedCount = 0
        for (var mi = 0; mi < mutations.length; mi++) { addedCount += mutations[mi].addedNodes ? mutations[mi].addedNodes.length : 0 }
        if (addedCount > 0) {
          try { console.log('__CC_DIAG__chatObserver: mutation +' + elapsed + 'с | added=' + addedCount + ' | ready=' + monitorReady) } catch(e) {}
        }
      }

      if (!monitorReady) return

      // v0.80.7: Snapshot фильтр — пропускаем мутации чей текст был при привязке
      if (_snapshotTexts.size > 0) {
        var filtered = []
        for (var fi = 0; fi < mutations.length; fi++) {
          var m = mutations[fi]
          if (m.type !== 'childList' || !m.addedNodes.length) continue
          var isOld = false
          for (var ni = 0; ni < m.addedNodes.length; ni++) {
            var ntxt = (m.addedNodes[ni].textContent || '').trim()
            if (ntxt.length > 5 && _snapshotTexts.has(ntxt)) { isOld = true; break }
          }
          if (!isOld) filtered.push(m)
        }
        if (filtered.length === 0) {
          try { console.log('__CC_DIAG__chatObserver: snapshot-skip | все мутации = старые пузыри') } catch(e) {}
          return
        }
        quickNewMsgCheck(filtered, type)
        return
      }

      quickNewMsgCheck(mutations, type)
    })
    chatObserver.observe(container, { childList: true, subtree: true })
    // Логируем в Pipeline
    try { console.log('__CC_DIAG__chatObserver: привязан к контейнеру | ' + chatObserverTarget + ' | попытка ' + chatObserverRetries + ' | snapshot=' + _snapshotTexts.size + ' | ts=' + _bindTs) } catch(e) {}
    return
  }

  if (chatObserverRetries < CHAT_OBSERVER_MAX_RETRIES) {
    // Контейнер не найден — retry через 3 сек
    try { console.log('__CC_DIAG__chatObserver: контейнер не найден, retry ' + chatObserverRetries + '/' + CHAT_OBSERVER_MAX_RETRIES) } catch {}
    setTimeout(() => startChatObserver(type), RETRY_SHORT)
    return
  }

  // v0.80.6: VK и MAX — НЕ fallback'ать на body (слишком много мусора).
  // Ждём навигацию → setupNavigationWatcher перепривяжет к контейнеру.
  // Уведомления через page-title-updated (VK title = "(1) Мессенджер").
  var noBodyFallbackTypes = ['vk', 'max']
  if (noBodyFallbackTypes.indexOf(type) !== -1) {
    chatObserverTarget = 'none'
    try { console.log('__CC_DIAG__chatObserver: ' + type + ' — body-fallback ОТКЛЮЧЁН (фантомы). Ждём навигацию в чат.') } catch(e) {}
    return
  }

  // Fallback: контейнер не найден после N попыток → наблюдаем document.body с sidebar-фильтром
  chatObserverTarget = 'body-fallback'
  setChatContainerEl(null)
  // v0.74.3: Grace period — игнорируем мутации 5 сек после fallback (начальный рендер)
  let _fallbackGraceUntil = Date.now() + 5000
  try { console.log('__CC_DIAG__chatObserver: FALLBACK на document.body (контейнер не найден за ' + (chatObserverRetries * 3) + ' сек) | фильтрация sidebar включена | grace 5с') } catch {}
  chatObserver = new MutationObserver((mutations) => {
    if (!monitorReady) return
    // v0.74.3: Grace period — пропускаем мутации начального рендера
    if (Date.now() < _fallbackGraceUntil) return
    // Фильтруем мутации — пропускаем sidebar/chatlist
    const filtered = []
    const cachedContainer = getChatContainerEl()
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i]
      if (m.type !== 'childList' || !m.addedNodes.length) continue
      // v0.60.0 Решение #3: структурный DOM-фильтр — если контейнер чата известен,
      // пропускаем мутации ВНЕ контейнера (UI кнопки, контекстное меню, sidebar)
      if (cachedContainer && !cachedContainer.contains(m.target)) continue
      if (!isSidebarNode(m.target)) filtered.push(m)
    }
    if (filtered.length > 0) quickNewMsgCheck(filtered, type)
  })
  chatObserver.observe(document.body, { childList: true, subtree: true })
}

// v0.60.0 Решение #1: Re-attach chatObserver при навигации (SPA)
// VK/MAX — SPA, URL меняется через pushState без перезагрузки страницы.
// При переходе в чат (/im/convo/...) появляется ConvoMain__history — нужно переподключить observer.
// ВАЖНО: context isolation — preload world не может перехватить history.pushState из main world.
// Используем polling location.href (каждые 2 сек) — SPA навигации редкие, нагрузка минимальна.
// v0.83.0: Храним ID интервала для cleanup
let _navWatcherInterval = null

function setupNavigationWatcher(type) {
  if (type === 'telegram') return
  let lastUrl = location.href

  // v0.83.0: Сохраняем ID для возможности clearInterval
  if (_navWatcherInterval) clearInterval(_navWatcherInterval)
  _navWatcherInterval = setInterval(() => {
    const newUrl = location.href
    if (newUrl === lastUrl) return
    try { console.log('__CC_DIAG__nav: ' + lastUrl.slice(-30) + ' → ' + newUrl.slice(-30) + ' | a="' + (lastActiveMessageText||'').slice(0,25) + '" q="' + (lastQuickMsgText||'').slice(0,25) + '"') } catch {}
    lastUrl = newUrl

    // v0.80.9: Сброс dedup при навигации — текст предыдущего чата не должен влиять
    lastActiveMessageText = null
    lastQuickMsgText = ''
    lastSentText = null
    lastActiveMessageTime = Date.now()
    lastQuickMsgTime = Date.now()

    // v0.80.7: Grace period при навигации — 15 сек (VK Virtual Scroll медленный)
    monitorReady = false
    setTimeout(function() {
      // v0.80.9: Инициализируем dedup из текущего DOM ПЕРЕД включением мониторинга
      try {
        var curText = getLastMessageText(type)
        if (curText) { lastActiveMessageText = curText; lastSentText = curText; lastQuickMsgText = curText }
      } catch(e) {}
      monitorReady = true
      try { console.log('__CC_DIAG__grace-end | a="' + (lastActiveMessageText||'').slice(0,25) + '"') } catch(e) {}
    }, GRACE_PERIOD)

    // Сбрасываем retries и пробуем найти контейнер заново
    chatObserverRetries = 0
    setChatContainerEl(null)
    setTimeout(() => startChatObserver(type), SNAPSHOT_DELAY)
  }, NAV_POLL_INTERVAL)
}

function startMonitor() {
  const type = getMessengerType()
  if (!type) return

  sendUpdate(type)

  // Диагностика DOM — отправляем через 15 сек (страница полностью загрузится)
  setTimeout(() => {
    sendUpdate(type)
    runDiagnostics(type, { getVKLastIncomingText })
  }, 15000)

  if (observer) return
  // Основной observer — для sendUpdate (unread count). Наблюдает document.body
  observer = new MutationObserver((mutations) => {
    clearTimeout(updateTimer)
    updateTimer = setTimeout(() => sendUpdate(type), UPDATE_DEBOUNCE)
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'aria-label']
  })

  // v0.59.0: Отдельный observer ТОЛЬКО для контейнера чата
  // quickNewMsgCheck теперь НЕ ловит sidebar/chatlist мутации
  setTimeout(() => startChatObserver(type), 5000) // ждём загрузку DOM

  // v0.60.0 Решение #1: Слежение за навигацией (SPA) для переподключения chatObserver
  setupNavigationWatcher(type)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMonitor)
} else {
  startMonitor()
}

// ── IPC: ручной запуск диагностики из App.jsx (через webview.send) ────────
ipcRenderer.on('run-diagnostics', () => {
  resetDiagnostics()
  const type = getMessengerType()
  if (type) runDiagnostics(type, { getVKLastIncomingText })
})

// ── Перехват Notification API ─────────────────────────────────────────────
// УДАЛЁН из preload (v0.27.0): <script> injection + CustomEvent НЕ работает —
// context isolation изолирует JS events между preload world и main world.
// НОВОЕ РЕШЕНИЕ: App.jsx → webview.executeJavaScript() (main world) →
// console.log('__CC_NOTIF__...') → event 'console-message' на <webview> элементе.
// См. App.jsx: setWebviewRef() → dom-ready + console-message handlers.

// ── Зум WebView: Ctrl+колёсико и Ctrl+клавиши → IPC к хосту ──────────────
document.addEventListener('wheel', function(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  try { ipcRenderer.sendToHost('zoom-change', { delta: e.deltaY < 0 ? 5 : -5 }) } catch(ex) {}
}, { passive: false })

document.addEventListener('keydown', function(e) {
  if (!e.ctrlKey) return
  if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    try { ipcRenderer.sendToHost('zoom-change', { delta: 10 }) } catch(ex) {}
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    try { ipcRenderer.sendToHost('zoom-change', { delta: -10 }) } catch(ex) {}
  } else if (e.key === '0') {
    e.preventDefault()
    try { ipcRenderer.sendToHost('zoom-reset') } catch(ex) {}
  }
})
