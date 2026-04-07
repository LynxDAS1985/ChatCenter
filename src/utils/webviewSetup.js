// v0.82.6: WebView setup — вынесено из App.jsx для уменьшения файла
// Содержит: tryExtractAccount, notification refs, traceNotif, handleNewMessage, setWebviewRef
// Все event listeners для WebView (dom-ready, page-title-updated, ipc-message, console-message)
// v0.83.3: НЕ используем useRef — createWebviewSetup это обычная функция, не React hook
// Вместо useRef используем plain objects { current: ... } — работает аналогично в closure scope
import { detectMessengerType, isSpamText, ACCOUNT_SCRIPTS, DOM_SCAN_SCRIPTS } from './messengerConfigs.js'
import { isDuplicateExact, isDuplicateSubstring, stripSenderFromText, isOwnMessage, cleanupRecentMap, cleanSenderStatus } from './messageProcessing.js'
import { parseConsoleMessage } from './consoleMessageParser.js'
import { devLog, devError } from './devLog.js'
import { playNotificationSound } from './sound.js'
import { buildChatNavigateScript } from './navigateToChat.js'
import { createConsoleMessageHandler } from './consoleMessageHandler.js'
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
  const _traceSkipFile = { debug: true }
  // Человекочитаемые названия шагов для лога
  const _traceLabels = { source: 'Источник', spam: 'Спам', dedup: 'Дедуп', handle: 'Обработка', viewing: 'Видимость', sound: 'Звук', ribbon: 'Ribbon', enrich: 'Обогащение', 'go-chat': 'Переход', 'mark-read': 'Прочитано', crash: 'КРАШ', hang: 'ЗАВИСАНИЕ', 'load-fail': 'ОШИБКА ЗАГРУЗКИ', warmup: 'Разогрев', error: 'ОШИБКА' }
  const _traceTypeLabels = { pass: '✓', block: '✗', warn: '⚠', info: '·' }

  const traceNotif = (step, type, messengerId, text, detail) => {
    const mName = messengerId ? (messengersRef.current.find(x => x.id === messengerId)?.name || '') : ''
    pipelineTraceRef.current.push({
      ts: Date.now(), step, type, mid: messengerId || '', mName, text: (text || '').slice(0, 200), detail: detail || '',
    })
    if (pipelineTraceRef.current.length > 300) pipelineTraceRef.current.splice(0, 100)
    // v0.85.9: Пишем в chatcenter.log через app:log (кроме debug/badge_blocked)
    if (!_traceSkipFile[step]) {
      const icon = _traceTypeLabels[type] || '·'
      const label = _traceLabels[step] || step
      const shortText = (text || '').slice(0, 60)
      const msg = `[TRACE] ${icon} [${mName || messengerId || '?'}] ${label}: ${shortText}${detail ? ' | ' + detail.slice(0, 120) : ''}`
      try { window.api?.send('app:log', { level: 'TRACE', message: msg }) } catch {}
    }
  }

  // ── Обработка входящего сообщения (общая для ipc-message и console-message) ──
  // extra = { senderName, iconUrl } — опционально, из перехваченного Notification
  // Если extra есть → из __CC_NOTIF__ (Notification API) — надёжный источник
  // Если extra нет → из MutationObserver (new-message IPC) — может быть ложным
  const handleNewMessage = (messengerId, text, extra) => {
    if (!text) return
    traceNotif('handle', 'info', messengerId, text, `extra=${extra ? `{s:"${(extra.senderName||'').slice(0,20)}",icon:${!!(extra.iconUrl||extra.iconDataUrl)}}` : 'нет'}`)

    // v0.79.2: Дедупликация из messageProcessing.js
    const exactDedup = isDuplicateExact(messengerId, text, recentNotifsRef.current)
    if (exactDedup.blocked) {
      traceNotif('dedup', 'block', messengerId, text, `recentNotifs | age=${exactDedup.age}мс`)
      return
    }
    const subDedup = isDuplicateSubstring(messengerId, text, recentNotifsRef.current)
    if (subDedup.blocked) {
      traceNotif('dedup', 'block', messengerId, text, `substring-dedup | prevLen=${subDedup.prevLen} age=${subDedup.age}мс`)
      return
    }
    recentNotifsRef.current.set(exactDedup.key, exactDedup.now)
    cleanupRecentMap(recentNotifsRef.current)

    // v0.80.2: Sender clean + strip + own-msg
    const rawSender = extra?.senderName || ''
    const senderName = cleanSenderStatus(rawSender)
    if (rawSender !== senderName) traceNotif('handle', 'info', messengerId, text, `cleanSender: "${rawSender.slice(0,30)}" → "${senderName.slice(0,30)}"`)

    const stripped = stripSenderFromText(text, senderName)
    if (stripped.stripped) {
      text = stripped.text
      if (!text) return
      traceNotif('handle', 'info', messengerId, text, `sender-strip: убрано "${senderName}" из начала`)
    } else if (isOwnMessage(text, senderName, extra?.fromNotifAPI)) {
      traceNotif('dedup', 'block', messengerId, text, `own-msg | sender="${senderName}" textStart="${text.slice(0,20)}"`)
      return
    }

    // v0.80.3: Подавляем ribbon только если:
    // 1. fromNotifAPI=false (MutationObserver) — НЕ блокируем (VK не шлёт Notification API,
    //    мы не знаем открыт ли конкретный чат — лучше показать лишний раз чем пропустить)
    // 2. fromNotifAPI=true (Notification API) — мессенджер САМ решил показать уведомление,
    //    значит текущий чат ≠ чат сообщения → ПРОПУСКАЕМ (не блокируем)
    // Итого: viewing блокирует ТОЛЬКО если НЕТ extra (нет sender, нет source — мусор)
    const isViewingThisTab = windowFocusedRef.current && activeIdRef.current === messengerId
    if (isViewingThisTab && !extra) {
      traceNotif('viewing', 'block', messengerId, text, `focused=${windowFocusedRef.current} activeId=${activeIdRef.current}`)
      return
    }
    if (isViewingThisTab && extra?.fromNotifAPI) {
      traceNotif('viewing', 'pass', messengerId, text, `focused=true НО fromNotifAPI=true → мессенджер считает чат не открыт`)
    } else if (isViewingThisTab && extra && !extra.fromNotifAPI) {
      traceNotif('viewing', 'pass', messengerId, text, `focused=true НО MutationObserver → не знаем открыт ли чат → показываем`)
    } else {
      traceNotif('viewing', 'pass', messengerId, text, `focused=${windowFocusedRef.current} activeId=${activeIdRef.current}`)
    }

    // Автопереключение на вкладку с новым сообщением (если включено)
    if (settingsRef.current.autoSwitchOnMessage && messengerId !== activeIdRef.current) {
      setActiveId(messengerId)
    }

    // Звук и уведомление — per-messenger настройки (v0.47.0)
    const mNotifs = (settingsRef.current.messengerNotifs || {})[messengerId] || {}
    const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[messengerId]
    // Per-messenger sound: messengerNotifs[id].sound > mutedMessengers > глобальный soundEnabled
    const soundOn = mNotifs.sound !== undefined ? mNotifs.sound : !messengerMuted
    // Per-messenger ribbon: messengerNotifs[id].ribbon > notificationsEnabled (глобальный)
    const ribbonOn = mNotifs.ribbon !== undefined ? mNotifs.ribbon : true
    const mInfo = messengersRef.current.find(x => x.id === messengerId)
    if (settingsRef.current.soundEnabled !== false && soundOn) {
      playNotificationSound(mInfo?.color)
      lastSoundTsRef.current[messengerId] = Date.now()
      traceNotif('sound', 'pass', messengerId, text, 'звук воспроизведён')
    } else {
      traceNotif('sound', 'block', messengerId, text, `global=${settingsRef.current.soundEnabled !== false} muted=${messengerMuted} perMsg=${mNotifs.sound}`)
    }
    // v0.61.1: убираем суффикс #N для отображения (dedup уже прошёл)
    const displayText = text.replace(/ #\d+$/, '')

    if (settingsRef.current.notificationsEnabled !== false && ribbonOn) {
      lastRibbonTsRef.current[messengerId] = Date.now()
      const notifTitle = senderName
        ? `${mInfo?.name || 'ЦентрЧатов'} — ${senderName}`
        : (mInfo?.name || 'ЦентрЧатов')
      // v0.80.4: ribbon использует очищенный senderName (без "заходила X назад")
      window.api?.invoke('app:custom-notify', {
        title: senderName || '',
        body: displayText.length > 100 ? displayText.slice(0, 97) + '…' : displayText,
        fullBody: displayText.length > 100 ? displayText : '',
        iconUrl: extra?.iconUrl || undefined,
        iconDataUrl: extra?.iconDataUrl || undefined,
        color: mInfo?.color || '#2AABEE',
        emoji: mInfo?.emoji || '💬',
        messengerName: mInfo?.name || 'ЦентрЧатов',
        messengerId: messengerId,
        senderName: senderName || '',
        chatTag: extra?.chatTag || '',
      }).catch(() => {})
      traceNotif('ribbon', 'pass', messengerId, text, `отправлен | sender="${senderName.slice(0,20)}" iconUrl=${(extra?.iconUrl||'нет').slice(0,30)} iconData=${(extra?.iconDataUrl||'нет').slice(0,30)}`)
    } else {
      traceNotif('ribbon', 'block', messengerId, text, `выключен | global=${settingsRef.current.notificationsEnabled !== false} perMsg=${ribbonOn}`)
    }

    // v0.72.5: Fallback Notification count — увеличиваем при каждом __CC_NOTIF__
    notifCountRef.current[messengerId] = (notifCountRef.current[messengerId] || 0) + 1
    // Если DOM-парсинг (unreadCounts) = 0, используем notifCount как fallback
    setUnreadCounts(prev => {
      if ((prev[messengerId] || 0) === 0 && notifCountRef.current[messengerId] > 0) {
        return { ...prev, [messengerId]: notifCountRef.current[messengerId] }
      }
      return prev
    })

    // Превью сообщения в бейдже вкладки (5 секунд)
    const previewText = displayText.slice(0, 32) + (displayText.length > 32 ? '…' : '')
    setMessagePreview(prev => ({ ...prev, [messengerId]: previewText }))
    clearTimeout(previewTimers.current[messengerId])
    previewTimers.current[messengerId] = setTimeout(() => {
      setMessagePreview(prev => { const p = { ...prev }; delete p[messengerId]; return p })
    }, 5000)

    // Добавляем в историю AI
    setChatHistory(prev => [...prev.slice(-19), { messengerId, text, ts: Date.now() }])

    // Авто-ответчик по ключевым словам
    const rules = settingsRef.current.autoReplyRules || []
    let autoReplied = false
    for (const rule of rules) {
      if (!rule.active) continue
      const matched = rule.keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))
      if (matched) {
        navigator.clipboard.writeText(rule.reply).catch(() => {})
        window.api?.invoke('app:custom-notify', {
          title: '🤖 Авто-ответ',
          body: `Правило: "${rule.keywords[0]}" — ответ в буфере`,
          color: mInfo?.color || '#2AABEE',
          emoji: mInfo?.emoji || '🤖',
          messengerName: mInfo?.name || 'ЦентрЧатов',
          messengerId: messengerId,
        }).catch(() => {})
        autoReplied = true
        break
      }
    }

    // Статистика сообщений
    bumpStatsRef.current?.({ today: 1, total: 1, ...(autoReplied ? { autoToday: 1 } : {}) })

    // Анимация на вкладке (ping 3 секунды)
    setNewMessageIds(prev => { const n = new Set(prev); n.add(messengerId); return n })
    setTimeout(() => {
      setNewMessageIds(prev => { const n = new Set(prev); n.delete(messengerId); return n })
    }, 3000)

    setLastMessage(text)

    // Последнее сообщение в статусбар (исчезает через 8 сек)
    const mName = messengersRef.current.find(x => x.id === messengerId)?.name || ''
    const displayName = extra?.senderName ? `${mName} — ${extra.senderName}` : mName
    const shortText = text.slice(0, 40) + (text.length > 40 ? '…' : '')
    setStatusBarMsg(`${displayName}: ${shortText}`)
    clearTimeout(statusBarMsgTimer.current)
    statusBarMsgTimer.current = setTimeout(() => setStatusBarMsg(null), 8000)
  }

  // ── Инициализация WebView ─────────────────────────────────────────────────
  const setWebviewRef = (el, messengerId) => {
    if (el && !el._chatcenterInit) {
      el._chatcenterInit = true
      el._chatcenterListeners = [] // v0.80.0: сохраняем ссылки для cleanup
      webviewRefs.current[messengerId] = el

      // v0.80.0: helper — addEventListener с сохранением для cleanup
      const addListener = (event, fn) => { el.addEventListener(event, fn); el._chatcenterListeners.push([event, fn]) }

      // Статус мониторинга: loading при инициализации
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

      // ── СЕКЦИЯ: Page events — title, favicon, navigate ──
      // page-title-updated — мгновенное обновление счётчика из title WebView
      // Telegram: "(26) Telegram Web", WhatsApp: "(5) WhatsApp", VK: "(3) ВКонтакте"
      // MAX: "1 непрочитанный чат" / "5 непрочитанных чатов" (БЕЗ скобок!)
      addListener('page-title-updated', (e) => {
        const match = e.title?.match(/\((\d+)\)/) || e.title?.match(/^(\d+)\s+непрочитанн/)
        if (match) {
          const count = parseInt(match[1], 10) || 0
          // v0.74.0: Сбрасываем notifCountRef когда title показывает реальное число
          notifCountRef.current[messengerId] = Math.min(notifCountRef.current[messengerId] || 0, count)
          setUnreadCounts(prev => {
            if (prev[messengerId] === count) return prev
            // Звук при увеличении счётчика (только если пользователь НЕ смотрит на этот чат)
            // Warm-up: при запуске счётчик идёт 0→N — не шуметь пока WebView не прогрелся
            if (count > (prev[messengerId] || 0) && notifReadyRef.current[messengerId] && !(windowFocusedRef.current && activeIdRef.current === messengerId)) {
              const s = settingsRef.current
              const mn = (s.messengerNotifs || {})[messengerId] || {}
              const muted = !!(s.mutedMessengers || {})[messengerId]
              const sndOn = mn.sound !== undefined ? mn.sound : !muted
              const ribOn = mn.ribbon !== undefined ? mn.ribbon : true
              // v0.62.6: дедупликация звука + логирование
              const lastSnd = lastSoundTsRef.current[messengerId] || 0
              const sinceLast = Date.now() - lastSnd
              if (s.soundEnabled !== false && sndOn && sinceLast > 3000) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
                lastSoundTsRef.current[messengerId] = Date.now()
                traceNotif('sound', 'pass', messengerId, `title +${count - (prev[messengerId] || 0)}`, 'звук title-update')
              } else if (s.soundEnabled !== false && sndOn) {
                traceNotif('sound', 'block', messengerId, `title +${count - (prev[messengerId] || 0)}`, `dedup title ${sinceLast}мс назад`)
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
          traceNotif('debug', 'info', messengerId, JSON.stringify(diag).slice(0, 200), 'monitor-diag')
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
