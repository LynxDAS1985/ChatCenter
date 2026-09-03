// v0.82.6: WebView setup — вынесено из App.jsx для уменьшения файла
// Содержит: tryExtractAccount, notification refs, traceNotif, setWebviewRef.
// v0.87.97: handleNewMessage вынесено в webviewHandleNewMessage.js (170 строк).
// Все event listeners для WebView (dom-ready, page-title-updated, ipc-message, console-message)
// v0.83.3: НЕ используем useRef — createWebviewSetup это обычная функция, не React hook
// Вместо useRef используем plain objects { current: ... } — работает аналогично в closure scope
import { detectMessengerType, isSpamText } from './messengerConfigs.js'
import { parseConsoleMessage } from './consoleMessageParser.js'
import { devLog, devError } from './devLog.js'
import { playNotificationSound } from './sound.js'
import { createConsoleMessageHandler } from './consoleMessageHandler.js'
import { logGeometry, runDomProbe, attachRuntimeErrorCatcher, probeBlackScreen } from './webviewDiagnostics.js'
import { createHandleNewMessage } from './webviewHandleNewMessage.js'
import { probeWebviewHealth } from './webviewHealthProbe.js'
import { scheduleMaxTitleFallback } from './maxTitleFallback.js'
import { decideMaxTitleUnread, resetMaxTitleUnread } from './titleUnreadBaseline.js'
import { createVkExecFallbackRuntime } from '../../shared/vkExecFallback.js'
import { DEFAULT_MESSENGERS } from '../constants.js'
import { markHealthError, markHealthOk, markHealthPending, markHealthSlow } from './connectionHealth.js'
try { window.__ccStartupMark?.('module:webviewSetup', 'module evaluated') } catch {}

// v0.83.1: Sender cache cleanup — удаляем записи старше 5 мин, лимит 50 записей
function cleanupSenderCache(cache) {
  const now = Date.now()
  const keys = Object.keys(cache)
  for (const k of keys) {
    if (now - (cache[k]?.ts || 0) > 300000) delete cache[k] // 5 мин TTL
  }
  // LRU: если >50 записей, удаляем старейшие
  const remaining = Object.keys(cache)
  if (remaining.length > 50) {
    remaining.sort((a, b) => (cache[a]?.ts || 0) - (cache[b]?.ts || 0))
    for (let i = 0; i < remaining.length - 50; i++) delete cache[remaining[i]]
  }
}

export function createWebviewSetup(deps) {
  const {
    webviewRefs, notifReadyRef, notifDedupRef, pipelineTraceRef, pendingMsgRef, senderCacheRef,
    retryTimers, previewTimers, statusBarMsgTimer, bumpStatsRef,
    settingsRef, activeIdRef, messengersRef, windowFocusedRef, zoomLevelsRef,
    setAccountInfo, setActiveId, setChatHistory, setLastMessage, setMessagePreview,
    setConnectionHealth, setNewMessageIds, setStatusBarMsg, setUnreadCounts, setUnreadSplit,
    setWebviewLoading, setZoomLevels, monitorPreloadUrl, setOzonCounts,
  } = deps
  const startupWebviewSeen = new Set()
  const webviewLoadStartedAt = {}
  const webviewProbeTimers = {}
  const healthLabel = (messengerId) => messengersRef.current.find(x => x.id === messengerId)?.name || messengerId
  const healthUrl = (el, messengerId) => {
    try { return el?.getURL?.() || messengersRef.current.find(x => x.id === messengerId)?.url || '' } catch { return '' }
  }
  const updateHealth = (messengerId, updater) => {
    if (!setConnectionHealth) return
    setConnectionHealth(prev => ({ ...prev, [messengerId]: updater(prev[messengerId]) }))
  }
  const scheduleHealthProbe = (el, messengerId, details = 'Проверка вкладки', delay = 0) => {
    if (!setConnectionHealth || !el) return
    clearTimeout(webviewProbeTimers[messengerId])
    webviewProbeTimers[messengerId] = setTimeout(() => {
      probeWebviewHealth({ webview: el, id: messengerId, label: healthLabel(messengerId), url: healthUrl(el, messengerId), setConnectionHealth, details })
    }, delay)
  }
  const startupWebviewLog = (messengerId, message) => {
    try {
      const key = `${messengerId}:${message}`
      if (startupWebviewSeen.has(key)) return
      startupWebviewSeen.add(key)
      const m = messengersRef.current.find(x => x.id === messengerId)
      window.api?.send('app:log', {
        level: 'INFO',
        message: `[startup-webview] ${message} id=${messengerId} name="${m?.name || ''}" partition=${m?.partition || ''} url=${m?.url || ''}`,
      })
    } catch {}
  }
  // ── Извлечение аккаунта из WebView ───────────────────────────────────────
  const tryExtractAccount = (messengerId, attempt = 0) => {
    if (attempt > 12) return
    const wv = webviewRefs.current[messengerId]
    // Для дефолтных мессенджеров — accountScript ТОЛЬКО из constants.js (не из сохранённых данных!)
    // Матчим по ID или по URL (custom-мессенджер с URL дефолтного → используем дефолтный скрипт)
    const messenger = messengersRef.current.find(m => m.id === messengerId)
    const defaultM = DEFAULT_MESSENGERS.find(m => m.id === messengerId)
      || (messenger?.url && DEFAULT_MESSENGERS.find(m => m.url && messenger.url.startsWith(m.url)))
    const script = defaultM?.accountScript
      ? defaultM.accountScript
      : messenger?.accountScript
    if (!wv || !script) return
    wv.executeJavaScript(script)
      .then(result => {
        devLog(`[tryExtractAccount] ${messengerId} attempt=${attempt} result=`, JSON.stringify(result), typeof result)
        // Фильтр: отклоняем title страницы и служебные слова как имя аккаунта
        const BL_ACCOUNT = /^(max|макс|telegram|whatsapp|vk|вконтакте|viber|messenger|undefined|null)$/i
        if (result && typeof result === 'string' && result.length > 0 && result.length < 80 && !BL_ACCOUNT.test(result.trim())) {
          setAccountInfo(prev => ({ ...prev, [messengerId]: result }))
        } else {
          retryTimers.current[messengerId] = setTimeout(
            () => tryExtractAccount(messengerId, attempt + 1), 4000
          )
        }
      })
      .catch(() => {
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, attempt + 1), 4000
        )
      })
  }

  // ── Дедупликация уведомлений (text+messengerId → timestamp) ────────────────
  const recentNotifsRef = { current: new Map() } // key → timestamp
  const lastRibbonTsRef = { current: {} } // { [messengerId]: timestamp } — когда последний раз показали ribbon
  const lastSoundTsRef = { current: {} } // { [messengerId]: timestamp } — дедупликация звука между __CC_NOTIF__ и unread-count paths
  // v0.72.5: Fallback Notification count — если DOM-парсинг (unread-count IPC) = 0,
  // считаем непрочитанные по количеству __CC_NOTIF__ с момента последнего просмотра вкладки
  const notifCountRef = { current: {} } // { [messengerId]: number }
  const pendingMarkReadsRef = { current: [] } // v0.62.6: очередь mark-read при свёрнутом окне
  // v0.60.0 Решение #2: sender-based dedup — если __CC_NOTIF__ уже прошёл для sender,
  // блокируем __CC_MSG__ от того же sender в течение 3 сек (даже если текст другой)
  const notifSenderTsRef = { current: {} } // { [messengerId + ':' + senderName]: timestamp }
  // v0.60.2: per-messengerId dedup — если __CC_NOTIF__ от этого messengerId был <3 сек назад,
  // блокируем __CC_MSG__ целиком (sender name может отличаться из-за разного enrichment)
  const notifMidTsRef = { current: {} } // { [messengerId]: timestamp }
  const maxTitleFallbackTimers = { current: {} } // { [messengerId]: timer }
  const maxTitleFallbackStateRef = { current: { seen: {} } } // long-lived sidebar preview fingerprints
  const titleUnreadBaselineRef = { current: {} }
  const monitorReadyRef = { current: {} }
  const vkFallbackTimers = { current: {} }

  // ── Pipeline Trace Logger (v0.55.0) ──────────────────────────────────────────
  // Записывает КАЖДЫЙ шаг pipeline уведомлений для диагностики
  // step: source|spam|dedup|handle|viewing|sound|ribbon|enrich|error
  // type: info|pass|block|warn
  // Шаги которые НЕ пишем в файл (спам)
  // НЕ пишем в файл только если step=debug И текст содержит badge_blocked или notif_hook_ok (спам)
  const _traceSkipFile = {}
  // Человекочитаемые названия шагов для лога
  const _traceLabels = { source: 'Источник', spam: 'Спам', dedup: 'Дедуп', handle: 'Обработка', viewing: 'Видимость', sound: 'Звук', ribbon: 'Ribbon', enrich: 'Обогащение', 'go-chat': 'Переход', 'mark-read': 'Прочитано', crash: 'КРАШ', hang: 'ЗАВИСАНИЕ', 'load-fail': 'ОШИБКА ЗАГРУЗКИ', warmup: 'Разогрев', error: 'ОШИБКА' }
  const _traceTypeLabels = { pass: '✓', block: '✗', warn: '⚠', info: '·' }

  const traceNotif = (step, type, messengerId, text, detail) => {
    const mName = messengerId ? (messengersRef.current.find(x => x.id === messengerId)?.name || '') : ''
    const rawTraceText = text || '', keepFullTraceText = /max-sidebar|VK-DIAG|vkFull|VK-EXEC/i.test(`${rawTraceText} ${detail || ''}`)
    pipelineTraceRef.current.push({ ts: Date.now(), step, type, mid: messengerId || '', mName, text: keepFullTraceText ? rawTraceText : rawTraceText.slice(0, 200), detail: detail || '' })
    // v1.2.9: буфер трассировки в памяти увеличен 300→5000 (выкидываем 1000 старых при переполнении).
    // Причина: maxFallbackEvents для диагностики строится ИЗ этого буфера, а не из лога. При 300 шагах
    // быстрая пачка MAX-сообщений вытеснялась за минуты и не попадала в отчёт. Полный архив всё равно в chatcenter.log.
    if (pipelineTraceRef.current.length > 5000) pipelineTraceRef.current.splice(0, 1000)
    // v0.86.0: Пишем в chatcenter.log (кроме badge_blocked и notif_hook_ok спама)
    const _skipDetail = detail && (detail.includes('badge_blocked') || detail.includes('notif_hook_ok'))
    if (!_skipDetail) {
      const icon = _traceTypeLabels[type] || '·'
      const label = _traceLabels[step] || step
      const fullLogText = /max-sidebar|VK-DIAG|vkFull|VK-EXEC/i.test(`${text || ''} ${detail || ''}`)
      const shortText = fullLogText ? (text || '') : (text || '').slice(0, 60)
      const detailLimit = detail && (/MAX title-fallback|max-title-|max-sidebar|topRows=|chosenLeafs=|\[MAX-|MAX page-title-updated|\[IPC-MAX\]|VK-DIAG|vkFull|VK-EXEC/.test(detail)) ? 12000 : 250
      const msg = `[TRACE] ${icon} [${mName || messengerId || '?'}] ${label}: ${shortText}${detail ? ' | ' + detail.slice(0, detailLimit) : ''}`
      try { window.api?.send('app:log', { level: 'TRACE', message: msg }) } catch {}
    }
  }

  const isVkWebview = (el, messengerId) => detectMessengerType(healthUrl(el, messengerId)) === 'vk'
  // v1.2.376: Ozon сам ведёт свой счётчик непрочитанного (сторож __CC_OZON_COUNT__), поэтому общие счётчики (title-reset/unread-count) его НЕ трогают.
  const isOzonWebview = (el, messengerId) => detectMessengerType(healthUrl(el, messengerId)) === 'ozon'

  // ── Обработка входящего сообщения (вынесена в webviewHandleNewMessage.js) ──
  const handleNewMessage = createHandleNewMessage({
    recentNotifsRef, lastRibbonTsRef, lastSoundTsRef, notifCountRef,
    pipelineTraceRef,
    settingsRef, activeIdRef, messengersRef, windowFocusedRef,
    setAccountInfo, setActiveId, setChatHistory, setLastMessage, setMessagePreview,
    setNewMessageIds, setStatusBarMsg, setUnreadCounts,
    previewTimers, statusBarMsgTimer, bumpStatsRef, traceNotif,
  })

  // ── Инициализация WebView ─────────────────────────────────────────────────
  const vkExecFallback = createVkExecFallbackRuntime({ isVkWebview, traceNotif, handleNewMessage, monitorReadyRef, timersRef: vkFallbackTimers })
  const setWebviewRef = (el, messengerId) => {
    if (el && !el._chatcenterInit) {
      el._chatcenterInit = true
      el._chatcenterListeners = []
      webviewRefs.current[messengerId] = el
      const addListener = (event, fn) => { el.addEventListener(event, fn); el._chatcenterListeners.push([event, fn]) }
      startupWebviewLog(messengerId, 'ref-init')
      webviewLoadStartedAt[messengerId] = Date.now()
      updateHealth(messengerId, prev => markHealthPending(prev, {
        id: messengerId,
        type: 'webview',
        label: healthLabel(messengerId),
        url: healthUrl(el, messengerId),
      }))
      // ── СЕКЦИЯ: События загрузки страницы ──
      setWebviewLoading(prev => ({ ...prev, [messengerId]: true }))
      addListener('did-start-loading', () => {
        startupWebviewLog(messengerId, 'did-start-loading')
        webviewLoadStartedAt[messengerId] = Date.now()
        updateHealth(messengerId, prev => markHealthPending(prev, { id: messengerId, type: 'webview', label: healthLabel(messengerId), url: healthUrl(el, messengerId) }))
        setWebviewLoading(prev => ({ ...prev, [messengerId]: true }))
      })
      addListener('did-stop-loading', () => {
        startupWebviewLog(messengerId, 'did-stop-loading')
        updateHealth(messengerId, prev => markHealthOk(prev, {
          id: messengerId,
          type: 'webview',
          label: healthLabel(messengerId),
          url: healthUrl(el, messengerId),
          details: 'Загрузка завершилась',
        }))
        scheduleHealthProbe(el, messengerId, 'Проверка после завершения загрузки', 150)
        setWebviewLoading(prev => ({ ...prev, [messengerId]: false }))
        // v1.2.12: снимок состояния отрисовки после загрузки/перезагрузки (диагностика чёрного экрана)
        probeBlackScreen(el, messengerId)
      })

      // v0.85.5: WebView crash/unresponsive → логируем + статус error
      addListener('render-process-gone', (e) => {
        const reason = e?.details?.reason || e?.reason || 'unknown'
        devError(`[WebView CRASH] ${messengerId}: reason=${reason}`)
        traceNotif('crash', 'error', messengerId, '', `WebView crashed: ${reason}`)
        updateHealth(messengerId, prev => markHealthError(prev, {
          id: messengerId,
          type: 'webview',
          label: healthLabel(messengerId),
          startedAt: webviewLoadStartedAt[messengerId],
          url: healthUrl(el, messengerId),
          errorText: `WebView crashed: ${reason}`,
        }))
      })
      addListener('unresponsive', () => {
        devError(`[WebView HANG] ${messengerId}: unresponsive`)
        traceNotif('hang', 'error', messengerId, '', 'WebView unresponsive')
      })
      addListener('did-fail-load', (e) => {
        const code = e?.errorCode || 'unknown'
        const desc = e?.errorDescription || ''
        if (code === -3) return // -3 = aborted (normal navigation)
        devError(`[WebView FAIL] ${messengerId}: code=${code} ${desc}`)
        traceNotif('load-fail', 'error', messengerId, '', `code=${code} ${desc}`)
        updateHealth(messengerId, prev => markHealthError(prev, {
          id: messengerId,
          type: 'webview',
          label: healthLabel(messengerId),
          startedAt: webviewLoadStartedAt[messengerId],
          url: healthUrl(el, messengerId),
          errorCode: code,
          errorText: desc,
        }))
      })
      // v0.86.5-6 DIAG: смена чата + геометрия + DOM-probe (вынесено в webviewDiagnostics.js)
      addListener('did-navigate-in-page', (e) => {
        try {
          const url = e?.url || ''
          const hash = url.split('#')[1] || ''
          traceNotif('nav', 'info', messengerId, hash.slice(0, 120), `inpage url=${url.slice(0, 80)}`)
          logGeometry(el, messengerId, traceNotif)
          runDomProbe(el, messengerId, traceNotif)
        } catch(_) {}
      })
      addListener('did-frame-finish-load', (e) => {
        if (e?.isMainFrame === false) traceNotif('frame', 'info', messengerId, '', `subframe finished`)
      })
      addListener('did-finish-load', () => {
        startupWebviewLog(messengerId, 'did-finish-load')
        updateHealth(messengerId, prev => markHealthOk(prev, {
          id: messengerId,
          type: 'webview',
          label: healthLabel(messengerId),
          url: healthUrl(el, messengerId),
          details: 'Страница загружена',
        }))
        scheduleHealthProbe(el, messengerId, 'Проверка после загрузки страницы', 150)
        attachRuntimeErrorCatcher(el)
      })

      // ── СЕКЦИЯ: DOM-ready — инициализация монитора ──
      addListener('dom-ready', () => {
        startupWebviewLog(messengerId, 'dom-ready')
        delete monitorReadyRef.current[messengerId]
        // v1.2.134 (вариант А, ADR-023): на vk.ru запасной впрыск НЕ нужен — основной путь
        // (детект списка чатов) работает, а executeJavaScript-впрыск vk.ru блокирует (CSP) →
        // бесполезная красная GUEST_VIEW_MANAGER_CALL при старте. Запускаем только не на vk.ru (vk.com).
        if (!/vk\.ru/i.test(healthUrl(el, messengerId) || '')) vkExecFallback.schedule(el, messengerId, 'dom-ready')
        updateHealth(messengerId, prev => markHealthOk(prev, {
          id: messengerId,
          type: 'webview',
          label: healthLabel(messengerId),
          url: healthUrl(el, messengerId),
          details: 'DOM готов',
        }))
        scheduleHealthProbe(el, messengerId, 'Проверка после готовности DOM', 250)
        // v0.84.0: Регистрация webContentsId для multi-account routing
        try {
          const wcId = el.getWebContentsId?.()
          if (wcId) window.api?.invoke('app:register-webview', { webContentsId: wcId, messengerId })
        } catch(e) { devError('[WebView] register-webview error:', e.message) }
        clearTimeout(retryTimers.current[messengerId])
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, 0), 3500
        )
        // Warm-up: игнорируем ВСЕ уведомления первые 5 сек после загрузки WebView
        // Мессенджеры при загрузке кидают Notification для старых непрочитанных (burst 1-3 сек).
        // v0.57.0: снижено с 30 до 5 сек — 30 сек блокировало реальные сообщения в MAX.
        notifReadyRef.current[messengerId] = false
        setTimeout(() => { notifReadyRef.current[messengerId] = true }, 5000)
        // Через 10 сек без завершения загрузки показываем пользователю медленное подключение.
        // Это больше не статус monitorStatus: UI-точка показывает качество сети/доступности.
        setTimeout(() => {
          updateHealth(messengerId, prev => {
            if (prev?.state === 'pending') {
              devError(`[ConnectionHealth] ${messengerId}: проверка дольше 10 сек → slow`)
              return markHealthSlow(prev, {
                id: messengerId,
                type: 'webview',
                label: healthLabel(messengerId),
                startedAt: webviewLoadStartedAt[messengerId],
                url: healthUrl(el, messengerId),
                details: 'Проверка дольше 10 сек',
              })
            }
            return prev || markHealthOk(null, { id: messengerId, type: 'webview', label: healthLabel(messengerId), url: healthUrl(el, messengerId) })
          })
        }, 10000)
        // Применяем зум если он не стандартный
        setTimeout(() => {
          const zoom = zoomLevelsRef.current[messengerId] || 100
          if (zoom !== 100) {
            try { webviewRefs.current[messengerId]?.setZoomFactor(zoom / 100) } catch (e) { devError('[Zoom]', e.message) }
          }
        }, 600)
        // Скрываем баннеры "браузер устарел" (VK и др.)
        try {
          el.insertCSS(`
            .BrowserUpdateLayer, .browser_update, .BrowserUpdate,
            [class*="BrowserUpdate"], [class*="browser_update"],
            [class*="browserUpdate"], [class*="unsupported-browser"],
            .UnsupportedBrowser, .stl__banner,
            .Popup--browserUpdate, .vkuiBanner--browser-update,
            .TopBrowserUpdateLayer, .BrowserUpdateOffer,
            [class*="browser-update"], [class*="BrowserOffer"] {
              display: none !important;
            }
          `)
          // JS-удаление баннеров "браузер устарел" по тексту (VK, MAX и др.)
          el.executeJavaScript(`
            (function hideBrowserBanners() {
              function remove() {
                document.querySelectorAll('div, span, section, aside, footer, [role="banner"], [role="alert"]').forEach(el => {
                  var t = (el.textContent || '').toLowerCase()
                  if ((t.includes('браузер устарел') || t.includes('browser is outdated') ||
                       (t.includes('обновите') && t.includes('браузер')) ||
                       (t.includes('update') && t.includes('browser'))) &&
                      el.children.length < 20) {
                    el.style.display = 'none'
                  }
                })
              }
              remove()
              setTimeout(remove, 2000)
              setTimeout(remove, 5000)
              setTimeout(remove, 10000)
              new MutationObserver(function() { remove() }).observe(document.body || document.documentElement, { childList: true, subtree: true })
            })()
          `).catch(() => {})
          // v0.82.0: Per-messenger notification hooks — загрузка из hooks/{type}.hook.js
          // Если preload <script> не сработал (CSP блокировал) — инжектим через executeJavaScript
          setTimeout(() => {
            const hookType = detectMessengerType(el.getURL?.() || '')
            window.api?.invoke('app:read-hook', hookType || 'telegram').then(hookCode => {
              if (!hookCode) return
              el.executeJavaScript(hookCode).then(() => {
                console.log('[NotifHook] executeJS hook applied (' + messengerId + ', type=' + hookType + ')')
              }).catch(() => {})
            }).catch(() => {})
          }, 1500)
          // v0.82.0: старый inline код (330 строк) УДАЛЁН — теперь hooks/{type}.hook.js
        } catch {}
      })

      // ── Page events: title-update → unread count + звук (НЕ ribbon) ──
      addListener('page-title-updated', (e) => {
        const match = e.title?.match(/\((\d+)\)/) || e.title?.match(/^(\d+)\s+непрочитанн/)
        if (match) {
          const count = parseInt(match[1], 10) || 0
          notifCountRef.current[messengerId] = Math.min(notifCountRef.current[messengerId] || 0, count)
          setUnreadCounts(prev => {
            if (prev[messengerId] === count) return prev
            const prevCount = prev[messengerId] || 0
            const titleUpdateUrlForDiag = (() => { try { return el?.getURL?.() || messengersRef.current.find(x => x.id === messengerId)?.url || '' } catch { return '' } })(); if (/web\.max\.ru/.test(titleUpdateUrlForDiag)) traceNotif('debug', 'info', messengerId, `title-count ${count}`, `MAX page-title-updated raw="${String(e.title || '').slice(0, 120)}" prevUnread=${prevCount} delta=${count - prevCount} notifRef=${notifCountRef.current[messengerId] || 0} activeId=${activeIdRef.current} focused=${windowFocusedRef.current} url=${titleUpdateUrlForDiag.slice(0, 120)}`)
            // v0.86.0: title-update остаётся звуковым fallback для мессенджеров без rich-event.
            // v1.2.7: MAX (web.max.ru) исключён — звук играет только после подтверждённого ribbon,
            // чтобы не было timestamp-фантомов, двойного звука и "пик без уведомления".
            const titleUpdateUrl = (() => { try { return el?.getURL?.() || messengersRef.current.find(x => x.id === messengerId)?.url || '' } catch { return '' } })()
            const isMaxTitleFallback = /web\.max\.ru/.test(titleUpdateUrl)
            const titleDecision = decideMaxTitleUnread({ state: titleUnreadBaselineRef.current, messengerId, messengerUrl: titleUpdateUrl, count })
            if (isMaxTitleFallback && !titleDecision.schedule) traceNotif('debug', 'info', messengerId, `title-count ${count}`, `MAX title-only no-ribbon | reason=${titleDecision.reason} raw="${String(e.title || '').slice(0, 120)}" count=${count} prevUnread=${prevCount} url=${titleUpdateUrl.slice(0, 120)}`)
            if (titleDecision.schedule && count > prevCount && notifReadyRef.current[messengerId]) {
              const titleDelta = isMaxTitleFallback && titleDecision.prevCount !== null ? Math.max(1, count - titleDecision.prevCount) : count - prevCount
              scheduleMaxTitleFallback({
                el,
                messengerId,
                delta: titleDelta,
                messengerUrl: titleUpdateUrl,
                notifReadyRef,
                lastRibbonTsRef,
                notifMidTsRef,
                timersRef: maxTitleFallbackTimers,
                fallbackStateRef: maxTitleFallbackStateRef,
                recentNotifsRef,
                senderCacheRef,
                cleanupSenderCache,
                handleNewMessage,
                traceNotif,
              })
              const s = settingsRef.current
              const mn = (s.messengerNotifs || {})[messengerId] || {}
              const muted = !!(s.mutedMessengers || {})[messengerId]
              const sndOn = mn.sound !== undefined ? mn.sound : !muted
              const lastSnd = lastSoundTsRef.current[messengerId] || 0
              const sinceLast = Date.now() - lastSnd
              if (!isMaxTitleFallback && s.soundEnabled !== false && sndOn && sinceLast > 3000) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
                lastSoundTsRef.current[messengerId] = Date.now()
                traceNotif('sound', 'pass', messengerId, `title +${titleDelta}`, 'звук title-update')
              } else if (isMaxTitleFallback) {
                traceNotif('sound', 'info', messengerId, `title +${titleDelta}`, 'MAX: title-update звук пропущен, ждём подтверждённый ribbon')
              }
            }
            return { ...prev, [messengerId]: count }
          })
          updateHealth(messengerId, prev => markHealthOk(prev, {
            id: messengerId,
            type: 'webview',
            label: healthLabel(messengerId),
            url: healthUrl(el, messengerId),
            details: 'title-update ответил',
          }))
          scheduleHealthProbe(el, messengerId, 'Проверка после title-update', 250)
        } else if (activeIdRef.current === messengerId && windowFocusedRef.current) {
          // v0.74.0: Title без числа — пользователь смотрит и всё прочитал. v1.2.374: КРОМЕ Ozon — у него в
          // заголовке числа НЕТ никогда, а непрочитанное ведёт наш сторож (ozonCounts) → обнуление сбрасывало значок рейла Ozon в 0.
          const titleResetUrl = (() => { try { return el?.getURL?.() || '' } catch { return '' } })()
          if (!isOzonWebview(el, messengerId)) {
            notifCountRef.current[messengerId] = 0
            try { if (/web\.max\.ru/.test(titleResetUrl)) traceNotif('debug', 'info', messengerId, '', `MAX title reset skipped | url=${titleResetUrl.slice(0, 120)} kept=true`); else resetMaxTitleUnread(titleUnreadBaselineRef.current, messengerId, titleResetUrl) } catch {}
            setUnreadCounts(prev => ((prev[messengerId] || 0) === 0) ? prev : { ...prev, [messengerId]: 0 })
          }
        }
      })

      // ── СЕКЦИЯ: IPC-message — обработка сообщений от WebView ──
      addListener('ipc-message', (e) => {
        // v0.86.0: Временный лог ВСЕХ IPC каналов от WhatsApp для диагностики
        if (messengerId === 'whatsapp' && e.channel !== 'unread-count' && e.channel !== 'unread-split') {
          try { window.api?.send('app:log', { level: 'TRACE', message: '[IPC-WA] channel=' + e.channel + ' args=' + JSON.stringify(e.args).slice(0,100) }) } catch {}
        }
        const ipcDiagUrl = (() => { try { return el?.getURL?.() || messengersRef.current.find(x => x.id === messengerId)?.url || '' } catch { return '' } })(); if (/web\.max\.ru/.test(ipcDiagUrl)) try { window.api?.send('app:log', { level: 'TRACE', message: '[IPC-MAX] channel=' + e.channel + ' activeId=' + activeIdRef.current + ' focused=' + windowFocusedRef.current + ' args=' + JSON.stringify(e.args).slice(0, 700) }) } catch {}
        if (e.channel === 'monitor-ready') {
          const payload = e.args[0] && typeof e.args[0] === 'object' ? e.args[0] : {}
          monitorReadyRef.current[messengerId] = { ...payload, ts: Date.now() }
          traceNotif('debug', 'info', messengerId, 'monitor-ready', `stage=${payload.stage || ''} type=${payload.type || ''} ready=${payload.ready || ''} url=${String(payload.url || '').slice(0, 180)}`)
          return
        } else if (e.channel === 'zoom-change') {
          const delta = e.args[0]?.delta || 0
          const cur = zoomLevelsRef.current[messengerId] || 100
          const clamped = Math.max(25, Math.min(200, Math.round((cur + delta) / 5) * 5))
          if (clamped === cur) return
          setZoomLevels(prev => { const next = { ...prev, [messengerId]: clamped }; saveZoomLevels(next); return next })
          animateZoom(messengerId, cur, clamped)
          return
        } else if (e.channel === 'zoom-reset') {
          const cur = zoomLevelsRef.current[messengerId] || 100
          setZoomLevels(prev => { const next = { ...prev, [messengerId]: 100 }; saveZoomLevels(next); return next })
          animateZoom(messengerId, cur, 100)
          return
        } else if (e.channel === 'unread-count') {
          // v1.2.375/376: Ozon сам ведёт счётчик (сторож __CC_OZON_COUNT__) — общий unread-count его не трогает (иначе 0 затрёт цифру). Единая проверка isOzonWebview (как title-reset выше).
          if (isOzonWebview(el, messengerId)) return
          // v0.72.8: unread-count IPC может ТОЛЬКО УВЕЛИЧИВАТЬ счётчик (для фоновых вкладок)
          // DOM-парсинг нестабилен — countUnread*() иногда возвращает 0 при ре-рендере DOM
          // v0.74.0: НО если пользователь СМОТРИТ на эту вкладку и DOM=0 — сброс (прочитал)
          const domCount = Number(e.args[0]) || 0
          const isViewing = activeIdRef.current === messengerId && windowFocusedRef.current
          // Сброс notifCountRef при просмотре — пользователь прочитал сообщения внутри мессенджера
          if (isViewing && domCount < (notifCountRef.current[messengerId] || 0)) {
            notifCountRef.current[messengerId] = domCount
          }
          const ipcCount = Math.max(domCount, notifCountRef.current[messengerId] || 0)
          setUnreadCounts(prev => {
            const prevCount = prev[messengerId] || 0
            // При просмотре — разрешаем уменьшение (пользователь видит реальный DOM)
            // В фоне — только увеличиваем (DOM может моргнуть в 0 при ре-рендере)
            const count = isViewing ? ipcCount : Math.max(ipcCount, prevCount)
            if (count === prevCount) return prev
            // Звук при увеличении счётчика (только если пользователь НЕ смотрит на этот чат)
            // Warm-up: при запуске счётчик идёт 0→N — не шуметь пока WebView не прогрелся
            if (count > prevCount && notifReadyRef.current[messengerId] && !(windowFocusedRef.current && activeIdRef.current === messengerId)) {
              const s = settingsRef.current
              const mn = (s.messengerNotifs || {})[messengerId] || {}
              const muted = !!(s.mutedMessengers || {})[messengerId]
              const sndOn = mn.sound !== undefined ? mn.sound : !muted
              // v0.62.6: дедупликация звука + логирование
              const lastSnd2 = lastSoundTsRef.current[messengerId] || 0
              const sinceLast2 = Date.now() - lastSnd2
              if (s.soundEnabled !== false && sndOn && sinceLast2 > 3000) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
                lastSoundTsRef.current[messengerId] = Date.now()
                traceNotif('sound', 'pass', messengerId, `ipc +${count - prevCount}`, 'звук unread-count IPC')
              } else if (s.soundEnabled !== false && sndOn) {
                traceNotif('sound', 'block', messengerId, `ipc +${count - prevCount}`, `dedup ipc ${sinceLast2}мс назад`)
              }
            }
            return { ...prev, [messengerId]: count }
          })
          updateHealth(messengerId, prev => markHealthOk(prev, {
            id: messengerId,
            type: 'webview',
            label: healthLabel(messengerId),
            url: healthUrl(el, messengerId),
            details: 'unread-count ответил',
          }))
          scheduleHealthProbe(el, messengerId, 'Проверка после unread-count', 250)
        } else if (e.channel === 'unread-split') {
          // Раздельный счётчик: личные vs каналы
          const split = e.args[0]
          if (split) setUnreadSplit(prev => ({ ...prev, [messengerId]: split }))
        } else if (e.channel === 'monitor-diag') {
          // v0.79.8: Диагностика DOM — трассировка в pipeline вместо state
          const diag = e.args[0]
          const diagStr = typeof diag === 'string' ? diag : JSON.stringify(diag)
          traceNotif('debug', 'info', messengerId, diagStr, 'monitor-diag')
          // v0.86.0: Прямой лог в файл для диагностики monitor
          try { window.api?.send('app:log', { level: 'TRACE', message: '[MONITOR] [' + (messengersRef.current.find(x=>x.id===messengerId)?.name||messengerId) + '] ' + diagStr }) } catch {}
        } else if (e.channel === 'new-message') {
          // Warm-up: игнорируем сообщения от MutationObserver первые 5 сек после dom-ready
          if (!notifReadyRef.current[messengerId]) {
            traceNotif('warmup', 'block', messengerId, (e.args[0] || '').slice(0, 50), 'warm-up 5с: IPC new-message заблокирован')
            return
          }
          const msgText = (e.args[0] || '').trim()
          if (!msgText) return
          // v0.78.5: Спам-фильтр из messengerConfigs.js
          if (isSpamText(msgText, 'ipc')) {
            traceNotif('spam', 'block', messengerId, msgText, 'спам-фильтр IPC new-message')
            return
          }
          // Per-messenger спам-фильтр
          const customSpamIpc = ((settingsRef.current.messengerNotifs || {})[messengerId] || {}).spamFilter
          if (customSpamIpc) {
            try { if (new RegExp(customSpamIpc, 'i').test(msgText)) { traceNotif('spam', 'block', messengerId, msgText, 'пользовательский спам-фильтр IPC'); return } } catch (e) { devError('[spam-regex]', e.message) }
          }
          // v0.60.2: per-messengerId dedup
          const midTsIpc = notifMidTsRef.current[messengerId], ipcUrl = (() => { try { return el?.getURL?.() || messengersRef.current.find(x => x.id === messengerId)?.url || '' } catch { return '' } })(), isMaxIpc = /web\.max\.ru/.test(ipcUrl)
          if (!isMaxIpc && midTsIpc && Date.now() - midTsIpc < 3000) {
            traceNotif('dedup', 'block', messengerId, msgText, `mid-dedup IPC | __CC_NOTIF__ от ${messengerId} был ${Date.now()-midTsIpc}мс назад`)
            return
          }
          traceNotif('source', 'info', messengerId, msgText, 'IPC new-message | ожидание 500мс для __CC_NOTIF__')
          setTimeout(() => {
            const dedupText = msgText.slice(0, 60)
            const nowIpcFallback = Date.now()
            const alreadyHandled = Array.from(recentNotifsRef.current).some(([k, ts]) => nowIpcFallback - ts <= 1500 && k.startsWith(messengerId + ':') && k.endsWith(':' + dedupText))
            if (!alreadyHandled) {
              traceNotif('source', 'warn', messengerId, msgText, 'IPC fallback | __CC_NOTIF__ не пришёл за 500мс')
              // Кэш sender fallback для IPC path
              const ipcExtra = e.args[1] && typeof e.args[1] === 'object' ? e.args[1] : null, cached = senderCacheRef.current[messengerId]
              const extra = ipcExtra || (cached && Date.now() - cached.ts < 300000
                ? { senderName: cached.name, ...(cached.avatar ? (cached.avatar.startsWith('data:') ? { iconDataUrl: cached.avatar } : { iconUrl: cached.avatar }) : {}) }
                : undefined)
              if (extra && cached && !ipcExtra) {
                traceNotif('enrich', 'info', messengerId, msgText, `senderCache fallback IPC | "${cached.name.slice(0,20)}"`)
                // v0.60.0 Решение #2: sender-based dedup
                const senderKey = messengerId + ':' + cached.name.slice(0, 30).toLowerCase()
                const senderTs = notifSenderTsRef.current[senderKey]
                if (senderTs && Date.now() - senderTs < 3000) {
                  traceNotif('dedup', 'block', messengerId, msgText, `sender-dedup IPC | "${cached.name.slice(0,20)}" ${Date.now()-senderTs}мс назад`)
                  return
                }
              }
              handleNewMessage(messengerId, msgText, extra)
            } else {
              traceNotif('source', 'info', messengerId, msgText, 'IPC skip | уже обработан через __CC_NOTIF__')
            }
          }, 500)
        }
      })
      // ── СЕКЦИЯ: Console-message — перехват Notification/Badge/MutationObserver ──
      // v0.84.3: Вынесено в consoleMessageHandler.js
      const consoleHandler = createConsoleMessageHandler({
        parseConsoleMessage, isSpamText, handleNewMessage, traceNotif, devError,
        recentNotifsRef, notifReadyRef, notifDedupRef, notifMidTsRef, notifSenderTsRef, senderCacheRef, pendingMsgRef,
        webviewRefs, messengersRef, settingsRef, windowFocusedRef, activeIdRef,
        cleanupSenderCache,
        setAccountInfo, setUnreadCounts, setConnectionHealth, notifCountRef, setOzonCounts,
      })
      const boundConsoleHandler = consoleHandler(el, messengerId)
      addListener('console-message', (e) => {
        if (vkExecFallback.handleConsole(e, messengerId)) return
        boundConsoleHandler(e)
      })
    }
  }
  return { setWebviewRef, handleNewMessage, traceNotif, recentNotifsRef, lastRibbonTsRef, lastSoundTsRef, notifSenderTsRef, notifMidTsRef, notifCountRef, pendingMarkReadsRef }
}
