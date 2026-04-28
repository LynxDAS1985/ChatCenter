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
import { logGeometry, runDomProbe, attachRuntimeErrorCatcher } from './webviewDiagnostics.js'
import { createHandleNewMessage } from './webviewHandleNewMessage.js'
import { DEFAULT_MESSENGERS } from '../constants.js'

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
    setMonitorStatus, setNewMessageIds, setStatusBarMsg, setUnreadCounts, setUnreadSplit,
    setWebviewLoading, setZoomLevels, monitorPreloadUrl,
  } = deps
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
    pipelineTraceRef.current.push({
      ts: Date.now(), step, type, mid: messengerId || '', mName, text: (text || '').slice(0, 200), detail: detail || '',
    })
    if (pipelineTraceRef.current.length > 300) pipelineTraceRef.current.splice(0, 100)
    // v0.86.0: Пишем в chatcenter.log (кроме badge_blocked и notif_hook_ok спама)
    const _skipDetail = detail && (detail.includes('badge_blocked') || detail.includes('notif_hook_ok'))
    if (!_skipDetail) {
      const icon = _traceTypeLabels[type] || '·'
      const label = _traceLabels[step] || step
      const shortText = (text || '').slice(0, 60)
      const msg = `[TRACE] ${icon} [${mName || messengerId || '?'}] ${label}: ${shortText}${detail ? ' | ' + detail.slice(0, 250) : ''}`
      try { window.api?.send('app:log', { level: 'TRACE', message: msg }) } catch {}
    }
  }

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
  const setWebviewRef = (el, messengerId) => {
    if (el && !el._chatcenterInit) {
      el._chatcenterInit = true
      el._chatcenterListeners = []
      webviewRefs.current[messengerId] = el
      const addListener = (event, fn) => { el.addEventListener(event, fn); el._chatcenterListeners.push([event, fn]) }
      setMonitorStatus(prev => ({ ...prev, [messengerId]: 'loading' }))
      // ── СЕКЦИЯ: События загрузки страницы ──
      setWebviewLoading(prev => ({ ...prev, [messengerId]: true }))
      addListener('did-start-loading', () => {
        setWebviewLoading(prev => ({ ...prev, [messengerId]: true }))
      })
      addListener('did-stop-loading', () => {
        setWebviewLoading(prev => ({ ...prev, [messengerId]: false }))
      })

      // v0.85.5: WebView crash/unresponsive → логируем + статус error
      addListener('render-process-gone', (e) => {
        const reason = e?.details?.reason || e?.reason || 'unknown'
        devError(`[WebView CRASH] ${messengerId}: reason=${reason}`)
        traceNotif('crash', 'error', messengerId, '', `WebView crashed: ${reason}`)
        setMonitorStatus(prev => ({ ...prev, [messengerId]: 'error' }))
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
      addListener('did-finish-load', () => { attachRuntimeErrorCatcher(el) })

      // ── СЕКЦИЯ: DOM-ready — инициализация монитора ──
      addListener('dom-ready', () => {
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
        // v0.85.5: Через 10 сек если монитор не ответил — помечаем как error
        // Монитор шлёт __CC_DIAG__, __CC_NOTIF_HOOK_OK__, unread-count — любой из них → active
        setTimeout(() => {
          setMonitorStatus(prev => {
            if (prev[messengerId] === 'loading') {
              devError(`[Monitor] ${messengerId}: не ответил за 10 сек → error`)
              return { ...prev, [messengerId]: 'error' }
            }
            return prev
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
            // v0.86.0: Звук при увеличении — разрешаем даже при activeId=messengerId
            // WhatsApp не шлёт __CC_NOTIF__ при активной вкладке, title-update = единственный канал для звука
            // Ribbon НЕ отправляем здесь — он приходит через __CC_NOTIF__ с именем и текстом
            if (count > prevCount && notifReadyRef.current[messengerId]) {
              const s = settingsRef.current
              const mn = (s.messengerNotifs || {})[messengerId] || {}
              const muted = !!(s.mutedMessengers || {})[messengerId]
              const sndOn = mn.sound !== undefined ? mn.sound : !muted
              const lastSnd = lastSoundTsRef.current[messengerId] || 0
              const sinceLast = Date.now() - lastSnd
              if (s.soundEnabled !== false && sndOn && sinceLast > 3000) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
                lastSoundTsRef.current[messengerId] = Date.now()
                traceNotif('sound', 'pass', messengerId, `title +${count - prevCount}`, 'звук title-update')
              }
            }
            return { ...prev, [messengerId]: count }
          })
          // Обновляем статус мониторинга — title работает
          setMonitorStatus(prev => ({ ...prev, [messengerId]: 'active' }))
        } else if (activeIdRef.current === messengerId && windowFocusedRef.current) {
          // v0.74.0: Title без числа (например "MAX") — пользователь смотрит и всё прочитал
          notifCountRef.current[messengerId] = 0
          setUnreadCounts(prev => {
            if ((prev[messengerId] || 0) === 0) return prev
            return { ...prev, [messengerId]: 0 }
          })
        }
      })

      // ── СЕКЦИЯ: IPC-message — обработка сообщений от WebView ──
      addListener('ipc-message', (e) => {
        // v0.86.0: Временный лог ВСЕХ IPC каналов от WhatsApp для диагностики
        if (messengerId === 'whatsapp' && e.channel !== 'unread-count' && e.channel !== 'unread-split') {
          try { window.api?.send('app:log', { level: 'TRACE', message: '[IPC-WA] channel=' + e.channel + ' args=' + JSON.stringify(e.args).slice(0,100) }) } catch {}
        }
        if (e.channel === 'zoom-change') {
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
          // Монитор прислал данные — значит работает
          setMonitorStatus(prev => ({ ...prev, [messengerId]: 'active' }))
        } else if (e.channel === 'unread-split') {
          // Раздельный счётчик: личные vs каналы
          const split = e.args[0]
          if (split) setUnreadSplit(prev => ({ ...prev, [messengerId]: split }))
        } else if (e.channel === 'monitor-diag') {
          // v0.79.8: Диагностика DOM — трассировка в pipeline вместо state
          const diag = e.args[0]
          const diagStr = typeof diag === 'string' ? diag : JSON.stringify(diag).slice(0, 200)
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
          const midTsIpc = notifMidTsRef.current[messengerId]
          if (midTsIpc && Date.now() - midTsIpc < 3000) {
            traceNotif('dedup', 'block', messengerId, msgText, `mid-dedup IPC | __CC_NOTIF__ от ${messengerId} был ${Date.now()-midTsIpc}мс назад`)
            return
          }
          traceNotif('source', 'info', messengerId, msgText, 'IPC new-message | ожидание 500мс для __CC_NOTIF__')
          setTimeout(() => {
            const dedupKey = messengerId + ':' + msgText.slice(0, 60)
            if (!recentNotifsRef.current.has(dedupKey)) {
              traceNotif('source', 'warn', messengerId, msgText, 'IPC fallback | __CC_NOTIF__ не пришёл за 500мс')
              // Кэш sender fallback для IPC path
              const cached = senderCacheRef.current[messengerId]
              const extra = cached && Date.now() - cached.ts < 300000
                ? { senderName: cached.name, ...(cached.avatar ? (cached.avatar.startsWith('data:') ? { iconDataUrl: cached.avatar } : { iconUrl: cached.avatar }) : {}) }
                : undefined
              if (extra) {
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
        setAccountInfo, setUnreadCounts, setMonitorStatus, notifCountRef,
      })
      addListener('console-message', consoleHandler(el, messengerId))
    }
  }
  return { setWebviewRef, handleNewMessage, traceNotif, recentNotifsRef, lastRibbonTsRef, lastSoundTsRef, notifSenderTsRef, notifMidTsRef, notifCountRef, pendingMarkReadsRef }
}
