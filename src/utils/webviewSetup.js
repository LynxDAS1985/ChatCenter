// v0.82.6: WebView setup — вынесено из App.jsx для уменьшения файла
// Содержит: tryExtractAccount, notification refs, traceNotif, handleNewMessage, setWebviewRef
// Все event listeners для WebView (dom-ready, page-title-updated, ipc-message, console-message)
import { useRef } from 'react'
import { detectMessengerType, isSpamText, ACCOUNT_SCRIPTS, DOM_SCAN_SCRIPTS } from './messengerConfigs.js'
import { isDuplicateExact, isDuplicateSubstring, stripSenderFromText, isOwnMessage, cleanupRecentMap, cleanSenderStatus } from './messageProcessing.js'
import { parseConsoleMessage } from './consoleMessageParser.js'
import { devLog, devError } from './devLog.js'
import { playNotificationSound } from './sound.js'
import { buildChatNavigateScript } from './navigateToChat.js'
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
  const recentNotifsRef = useRef(new Map()) // key → timestamp
  const lastRibbonTsRef = useRef({}) // { [messengerId]: timestamp } — когда последний раз показали ribbon
  const lastSoundTsRef = useRef({}) // { [messengerId]: timestamp } — дедупликация звука между __CC_NOTIF__ и unread-count paths
  // v0.72.5: Fallback Notification count — если DOM-парсинг (unread-count IPC) = 0,
  // считаем непрочитанные по количеству __CC_NOTIF__ с момента последнего просмотра вкладки
  const notifCountRef = useRef({}) // { [messengerId]: number }
  const pendingMarkReadsRef = useRef([]) // v0.62.6: очередь mark-read при свёрнутом окне
  // v0.60.0 Решение #2: sender-based dedup — если __CC_NOTIF__ уже прошёл для sender,
  // блокируем __CC_MSG__ от того же sender в течение 3 сек (даже если текст другой)
  const notifSenderTsRef = useRef({}) // { [messengerId + ':' + senderName]: timestamp }
  // v0.60.2: per-messengerId dedup — если __CC_NOTIF__ от этого messengerId был <3 сек назад,
  // блокируем __CC_MSG__ целиком (sender name может отличаться из-за разного enrichment)
  const notifMidTsRef = useRef({}) // { [messengerId]: timestamp }

  // ── Pipeline Trace Logger (v0.55.0) ──────────────────────────────────────────
  // Записывает КАЖДЫЙ шаг pipeline уведомлений для диагностики
  // step: source|spam|dedup|handle|viewing|sound|ribbon|enrich|error
  // type: info|pass|block|warn
  const traceNotif = (step, type, messengerId, text, detail) => {
    // v0.60.0: добавляем имя мессенджера для идентификации в логах
    const mName = messengerId ? (messengersRef.current.find(x => x.id === messengerId)?.name || '') : ''
    pipelineTraceRef.current.push({
      ts: Date.now(), step, type, mid: messengerId || '', mName, text: (text || '').slice(0, 200), detail: detail || '',
    })
    if (pipelineTraceRef.current.length > 300) pipelineTraceRef.current.splice(0, 100)
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
    if (settingsRef.current.notificationsEnabled !== false && ribbonOn) {
      lastRibbonTsRef.current[messengerId] = Date.now()
      // v0.80.6: НЕ переопределяем senderName — используем очищенный из cleanSenderStatus (строка 697)
      const notifTitle = senderName
        ? `${mInfo?.name || 'ЦентрЧатов'} — ${senderName}`
        : (mInfo?.name || 'ЦентрЧатов')
      // v0.61.1: убираем суффикс #N для отображения (dedup уже прошёл)
      // Покрывает: "📎 Стикер #3", "🖼 Картинка #2", "🎬 Анимация #1", "😇😉👍 #4"
      const displayText = text.replace(/ #\d+$/, '')
      // v0.80.4: ribbon использует очищенный senderName (без "заходила X назад")
      window.api.invoke('app:custom-notify', {
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
        window.api.invoke('app:custom-notify', {
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

      // ── СЕКЦИЯ: DOM-ready — инициализация монитора ──
      addListener('dom-ready', () => {
        clearTimeout(retryTimers.current[messengerId])
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, 0), 3500
        )
        // Warm-up: игнорируем ВСЕ уведомления первые 5 сек после загрузки WebView
        // Мессенджеры при загрузке кидают Notification для старых непрочитанных (burst 1-3 сек).
        // v0.57.0: снижено с 30 до 5 сек — 30 сек блокировало реальные сообщения в MAX.
        notifReadyRef.current[messengerId] = false
        setTimeout(() => { notifReadyRef.current[messengerId] = true }, 5000)
        // Через 20 сек если монитор не ответил — помечаем как error
        setTimeout(() => {
          setMonitorStatus(prev => {
            if (prev[messengerId] === 'loading') return { ...prev, [messengerId]: 'error' }
            return prev
          })
        }, 20000)
        // Применяем зум если он не стандартный
        setTimeout(() => {
          const zoom = zoomLevelsRef.current[messengerId] || 100
          if (zoom !== 100) {
            try { webviewRefs.current[messengerId]?.setZoomFactor(zoom / 100) } catch {}
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
            window.api.invoke('app:read-hook', hookType || 'telegram').then(hookCode => {
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
      // console-message: перехват Notification + MutationObserver backup (v0.39.5)
      addListener('console-message', (e) => {
        const msg = e.message
        if (!msg) return
        // v0.79.8: Парсинг через consoleMessageParser.js
        const parsed = parseConsoleMessage(msg)
        if (parsed) {
          const ready = !!notifReadyRef.current[messengerId]
          traceNotif('debug', 'info', messengerId, (parsed.text || parsed.body || parsed.value || '').toString().slice(0, 200), `${parsed.prefix || parsed.type} | ready=${ready}`)
        }
        // ── __CC_BADGE_BLOCKED__: Telegram Badge API ──
        if (parsed && parsed.type === 'badge_blocked') {
          if (parsed.value === 0 && activeIdRef.current === messengerId && windowFocusedRef.current) {
            if (notifCountRef.current[messengerId] > 0) {
              notifCountRef.current[messengerId] = 0
            }
            setUnreadCounts(prev => prev[messengerId] > 0 ? { ...prev, [messengerId]: 0 } : prev)
          }
          return
        }
        // ── __CC_ACCOUNT__: имя профиля ──
        if (parsed && parsed.type === 'account') {
          if (parsed.name && parsed.name.length > 1 && parsed.name.length < 80) {
            setAccountInfo(prev => ({ ...prev, [messengerId]: parsed.name }))
          }
          return
        }
        // ── __CC_MSG__: backup MutationObserver через console.log (v0.39.5) ──
        // Обогащаем данными отправителя из DOM активного чата (v0.47.0)
        if (msg.startsWith('__CC_MSG__')) {
          if (!notifReadyRef.current[messengerId]) {
            traceNotif('warmup', 'block', messengerId, msg.slice(10, 50), 'warm-up 5с: __CC_MSG__ заблокирован')
            return
          }
          const text = msg.slice(10).trim()
          if (!text) return
          // v0.78.5: Спам-фильтр из messengerConfigs.js
          if (isSpamText(text, 'msg')) {
            traceNotif('spam', 'block', messengerId, text, 'спам-фильтр __CC_MSG__')
            return
          }
          // Per-messenger спам-фильтр (v0.56.0)
          const customSpam = ((settingsRef.current.messengerNotifs || {})[messengerId] || {}).spamFilter
          if (customSpam) {
            try { if (new RegExp(customSpam, 'i').test(text)) { traceNotif('spam', 'block', messengerId, text, 'пользовательский спам-фильтр'); return } } catch (e) { devError('[spam-regex]', e.message) }
          }
          // v0.60.2: per-messengerId dedup — если __CC_NOTIF__ от этого мессенджера был <3 сек назад
          const midTs = notifMidTsRef.current[messengerId]
          if (midTs && Date.now() - midTs < 3000) {
            traceNotif('dedup', 'block', messengerId, text, `mid-dedup __CC_MSG__ | __CC_NOTIF__ от ${messengerId} был ${Date.now()-midTs}мс назад`)
            return
          }
          traceNotif('source', 'info', messengerId, text, '__CC_MSG__ | ожидание enriched __CC_NOTIF__ 200мс')
          // Приоритет enriched: ждём 200мс — если __CC_NOTIF__ придёт с enriched данными, он отменит этот таймер
          // Если не придёт — запускаем собственное enrichment через DOM
          const pendingKey = messengerId + ':' + text.slice(0, 40)
          // Отменяем предыдущий pending для того же текста
          if (pendingMsgRef.current.has(pendingKey)) clearTimeout(pendingMsgRef.current.get(pendingKey).timer)
          const safeBody = JSON.stringify(text)
          const safeSlice = JSON.stringify(text.slice(0, 30))
          const pendingTimer = setTimeout(() => {
            pendingMsgRef.current.delete(pendingKey)
            traceNotif('enrich', 'info', messengerId, text, '__CC_MSG__ | enriched NOTIF не пришёл → DOM enrichment')
            el.executeJavaScript(`(function() {
            try {
              var name = '', avatar = '';
              // v0.77.1: Конвертация img→data:URL (blob URL не работает вне WebView)
              function _imgToDataUrl(img) {
                try {
                  if (!img || !img.src) return '';
                  if (img.src.startsWith('data:')) return img.src;
                  if (img.src.startsWith('http') && !img.src.startsWith('blob:')) return img.src;
                  // blob: URL → canvas → data:URL
                  var c = document.createElement('canvas');
                  var w = img.naturalWidth || img.width || 40;
                  var h = img.naturalHeight || img.height || 40;
                  if (w < 5 || h < 5) return '';
                  c.width = Math.min(w, 80); c.height = Math.min(h, 80);
                  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                  return c.toDataURL('image/jpeg', 0.7);
                } catch(e) { return ''; }
              }
              // 1. Header активного чата — расширенные селекторы (TG/MAX/Generic)
              // MAX (SvelteKit): .topbar.svelte-* → первый child div содержит имя
              var headerSels = [
                // v0.59.2: VK реальные классы
                '.ConvoHeader__info',
                // v0.60.0: MAX реальные классы — .topbar .headerWrapper содержит "Окно чата с ИмяФамилия"
                '.topbar .headerWrapper',
                '.chat-info .peer-title', '.topbar .peer-title',
                '.topbar [class*="info" i] [class*="title" i]',
                '.topbar [class*="info" i] [class*="name" i]',
                '[class*="chat-header" i] [class*="title" i]',
                '[class*="top-bar" i] [class*="title" i]',
                '[class*="topbar" i] [class*="name" i]',
                '[class*="chat-header" i] [class*="name" i]',
                'header [class*="title" i]', 'header [class*="name" i]'
              ];
              for (var si = 0; si < headerSels.length; si++) {
                var h = document.querySelector(headerSels[si]);
                if (h) {
                  var hn = (h.textContent || '').trim();
                  // v0.59.2: VK "Елена Дугинаonline" → чистим статус
                  hn = hn.replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|печатает|typing)\s*$/i, '').trim();
                  // v0.60.0: MAX "Окно чата с ИмяФамилия" → убираем префикс
                  hn = hn.replace(/^окно\s+чата\s+с\s+/i, '').trim();
                  // v0.60.2: MAX textContent дублирует имя ("Иванов Иван     Иванов Иван") → дедупликация
                  if (hn.length > 10) {
                    var halfN = Math.ceil(hn.length / 2);
                    var p1N = hn.slice(0, halfN).trim();
                    var p2N = hn.slice(halfN).trim();
                    if (p1N === p2N) hn = p1N;
                  }
                  if (hn && hn.length >= 2 && hn.length <= 80) { name = hn; break; }
                }
              }
              // MAX fallback: .topbar содержит "Окно чата с ИмяФамилия" — извлекаем имя из первого div > div
              if (!name) {
                var tb = document.querySelector('.topbar');
                if (tb) {
                  // Ищем первый элемент с коротким текстом (имя чата) среди children
                  var tbKids = tb.querySelectorAll('div, span, h1, h2, h3');
                  for (var ti = 0; ti < tbKids.length && ti < 20; ti++) {
                    var tbText = (tbKids[ti].textContent || '').trim();
                    // Пропускаем длинные тексты (весь .topbar textContent), статусы, пустые
                    if (tbText.length < 2 || tbText.length > 60) continue;
                    if (/^(был|была|в сети|online|offline|печатает|typing|окно чата)/i.test(tbText)) continue;
                    // Первый подходящий — имя чата
                    name = tbText;
                    break;
                  }
                }
              }
              if (name) {
                var av = document.querySelector('.chat-info img.avatar-photo, .topbar img.avatar-photo, .chat-info [class*="avatar" i] img, header img[class*="avatar" i], header [class*="avatar" i] img');
                if (av) avatar = _imgToDataUrl(av);
              }
              // 2. Активный/выделенный чат в sidebar (не зависит от обновления preview)
              if (!name) {
                var activeSels = ['.chatlist-chat.active', '.chatlist-chat.selected', '[class*="chat"][class*="active" i]', '[class*="dialog"][class*="active" i]', '[class*="conversation"][class*="active" i]'];
                for (var ai = 0; ai < activeSels.length; ai++) {
                  var act = document.querySelector(activeSels[ai]);
                  if (!act) continue;
                  var pt0 = act.querySelector('.peer-title, [class*="title" i], [class*="name" i]');
                  var nm0 = pt0 ? (pt0.textContent || '').trim() : '';
                  if (nm0 && nm0.length >= 2 && nm0.length <= 80) {
                    name = nm0;
                    var avAct = act.querySelector('img.avatar-photo, [class*="avatar"] img, canvas.avatar-photo');
                    if (avAct && avAct.tagName === 'IMG') avatar = _imgToDataUrl(avAct);
                    break;
                  }
                }
              }
              // 3. Поиск по тексту в chatlist (fallback)
              if (!name) {
                var bodySlice = ${safeSlice};
                var chats = document.querySelectorAll('.chatlist-chat');
                for (var i = 0; i < chats.length && i < 50; i++) {
                  if ((chats[i].textContent || '').indexOf(bodySlice) === -1) continue;
                  var pt = chats[i].querySelector('.peer-title');
                  var nm = pt ? (pt.textContent || '').trim() : '';
                  if (!nm) continue;
                  name = nm;
                  var avEl = chats[i].querySelector('img.avatar-photo, [class*="avatar"] img');
                  if (avEl) avatar = _imgToDataUrl(avEl);
                  break;
                }
              }
              if (window.__cc_notif_log) {
                window.__cc_notif_log.push({ ts: Date.now(), status: 'passed', title: name || '', body: (${safeBody}).slice(0, 200), tag: '', reason: 'addedNodes', enrichedTitle: name || '' });
                if (window.__cc_notif_log.length > 100) window.__cc_notif_log.shift();
              }
              return JSON.stringify({ n: name, a: avatar });
            } catch(e) { return ''; }
          })()`)
            .then(result => {
              const extra = {}
              if (result) {
                try {
                  const info = JSON.parse(result)
                  if (info.n) {
                    // v0.60.2: belt-and-suspenders strip после executeJavaScript
                    let sn = info.n.trim()
                    sn = sn.replace(/^окно\s+чата\s+с\s+/i, '').trim()
                    sn = sn.replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|печатает|typing)\s*$/i, '').trim()
                    // Убираем дубль имени: "Иванов Иван     Иванов Иван" → "Иванов Иван"
                    if (sn.length > 10) {
                      const half = Math.ceil(sn.length / 2)
                      const p1 = sn.slice(0, half).trim()
                      const p2 = sn.slice(half).trim()
                      if (p1 === p2) sn = p1
                    }
                    extra.senderName = sn
                  }
                  if (info.a) {
                    if (info.a.startsWith('data:')) extra.iconDataUrl = info.a
                    else if (info.a.startsWith('http') || info.a.startsWith('blob:')) extra.iconUrl = info.a
                  }
                } catch {}
              }
              // Кэш sender (улучшение #3) — сохраняем при успехе, используем при неудаче
              if (extra.senderName) {
                senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconUrl || extra.iconDataUrl || '', ts: Date.now() }; cleanupSenderCache(senderCacheRef.current)
              } else {
                const cached = senderCacheRef.current[messengerId]
                if (cached && Date.now() - cached.ts < 300000) { // 5 мин
                  extra.senderName = cached.name
                  if (cached.avatar && !extra.iconUrl && !extra.iconDataUrl) {
                    if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar
                    else extra.iconUrl = cached.avatar
                  }
                  traceNotif('enrich', 'info', messengerId, text, `senderCache fallback | "${cached.name.slice(0,20)}" age=${Math.round((Date.now()-cached.ts)/1000)}с`)
                }
              }
              traceNotif('enrich', extra.senderName ? 'pass' : 'warn', messengerId, text, `__CC_MSG__ enriched | sender="${(extra.senderName||'нет').slice(0,20)}" icon=${!!(extra.iconUrl||extra.iconDataUrl)}`)
              // v0.60.0 Решение #2: sender-based dedup — если __CC_NOTIF__ уже обработан для этого sender
              if (extra.senderName) {
                const senderKey = messengerId + ':' + extra.senderName.slice(0, 30).toLowerCase()
                const senderTs = notifSenderTsRef.current[senderKey]
                if (senderTs && Date.now() - senderTs < 3000) {
                  traceNotif('dedup', 'block', messengerId, text, `sender-dedup | __CC_NOTIF__ от "${extra.senderName.slice(0,20)}" был ${Date.now()-senderTs}мс назад`)
                  return
                }
              }
              // v0.58.1: Если текст = имя отправителя → медиа без текста (стикер, фото, GIF)
              let finalText = text
              if (extra.senderName && text.trim().toLowerCase() === extra.senderName.trim().toLowerCase()) {
                finalText = '📎 Медиа'
                traceNotif('enrich', 'info', messengerId, text, `текст = sender "${extra.senderName.slice(0,20)}" → заменён на "📎 Медиа"`)
              }
              handleNewMessage(messengerId, finalText, Object.keys(extra).length ? extra : undefined)
            })
            .catch(() => {
              traceNotif('enrich', 'warn', messengerId, text, '__CC_MSG__ enrichment failed')
              // Кэш sender fallback
              const cached = senderCacheRef.current[messengerId]
              if (cached && Date.now() - cached.ts < 300000) {
                const extra = { senderName: cached.name }
                if (cached.avatar) { if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar; else extra.iconUrl = cached.avatar }
                // v0.58.1: текст = sender → медиа
                const ft = (text.trim().toLowerCase() === cached.name.trim().toLowerCase()) ? '📎 Медиа' : text
                handleNewMessage(messengerId, ft, extra)
              } else {
                handleNewMessage(messengerId, text)
              }
            })
          }, 200) // 200мс ожидание enriched __CC_NOTIF__
          pendingMsgRef.current.set(pendingKey, { timer: pendingTimer, messengerId, text })
          return
        }
        if (!msg.startsWith('__CC_NOTIF__')) return
        // Warm-up: игнорируем уведомления до готовности (5 сек после dom-ready)
        if (!notifReadyRef.current[messengerId]) {
          try {
            const d = JSON.parse(msg.slice(12))
            traceNotif('warmup', 'block', messengerId, (d.b || '').slice(0, 50), `warm-up 5с: __CC_NOTIF__ заблокирован | t="${(d.t||'').slice(0,20)}"`)
          } catch { traceNotif('warmup', 'block', messengerId, msg.slice(12, 50), 'warm-up 5с: __CC_NOTIF__ заблокирован') }
          return
        }
        try {
          const data = JSON.parse(msg.slice(12)) // после '__CC_NOTIF__'
          const text = (data.b || '').trim()
          traceNotif('source', 'info', messengerId, text, `__CC_NOTIF__ | t="${(data.t||'').slice(0,20)}" icon=${!!data.i} tag=${!!data.g}`)
          // v0.79.0: Спам-фильтр из messengerConfigs.js (единый для всех путей)
          if (isSpamText(text, 'notif')) {
            traceNotif('spam', 'block', messengerId, text, 'спам-фильтр __CC_NOTIF__')
            return
          }
          // Per-messenger спам-фильтр (v0.56.0)
          const customSpamN = ((settingsRef.current.messengerNotifs || {})[messengerId] || {}).spamFilter
          if (customSpamN && text) {
            try { if (new RegExp(customSpamN, 'i').test(text)) { traceNotif('spam', 'block', messengerId, text, 'пользовательский спам-фильтр'); return } } catch (e) { devError('[spam-regex]', e.message) }
          }
          if (text) {
            // Дедупликация: Telegram шлёт Notification + ServiceWorker.showNotification → 2 __CC_NOTIF__
            // Нормализуем body: убираем trailing timestamps (вида "15:57" или "15:5715:57")
            const normalizedText = text.replace(/\d{1,2}:\d{2}(:\d{2})?/g, '').trim()
            const dedupKey = messengerId + ':' + (normalizedText || text).slice(0, 40)
            const now = Date.now()
            if (notifDedupRef.current.has(dedupKey) && now - notifDedupRef.current.get(dedupKey) < 5000) {
              traceNotif('dedup', 'block', messengerId, text, `notifDedup | age=${now - notifDedupRef.current.get(dedupKey)}мс`)
              return
            }
            notifDedupRef.current.set(dedupKey, now)
            // Очистка старых записей
            if (notifDedupRef.current.size > 30) {
              for (const [k, ts] of notifDedupRef.current) { if (now - ts > 15000) notifDedupRef.current.delete(k) }
            }
            // Приоритет enriched: если есть pending __CC_MSG__ для того же текста — отменить его
            const pendingKey = messengerId + ':' + text.slice(0, 40)
            const pending = pendingMsgRef.current.get(pendingKey)
            if (pending) {
              clearTimeout(pending.timer)
              pendingMsgRef.current.delete(pendingKey)
              traceNotif('enrich', 'pass', messengerId, text, '__CC_NOTIF__ отменил pending __CC_MSG__ — enriched приоритет')
            }
            // data.t = title (имя отправителя), data.i = icon URL (аватарка)
            const extra = {}
            if (data.t) extra.senderName = data.t
            if (data.g) extra.chatTag = data.g
            // v0.77.2: blob icon → конвертируем ПЕРЕД handleNewMessage
            if (data.i && data.i.startsWith('blob:')) {
              const wv = webviewRefs.current[messengerId]
              if (wv) {
                wv.executeJavaScript(`(function(){try{var img=new Image();img.crossOrigin='anonymous';return new Promise(function(ok){img.onload=function(){var c=document.createElement('canvas');c.width=Math.min(img.width,80);c.height=Math.min(img.height,80);c.getContext('2d').drawImage(img,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',0.7))};img.onerror=function(){ok('')};img.src=${JSON.stringify(data.i)}})}catch(e){return Promise.resolve('')}})()`)
                  .then(dataUrl => {
                    if (dataUrl) extra.iconDataUrl = dataUrl
                    else {
                      // Кэш fallback
                      const cached = senderCacheRef.current[messengerId]
                      if (cached?.avatar) {
                        if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar
                        else extra.iconUrl = cached.avatar
                      }
                    }
                    if (extra.senderName) senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconDataUrl || '', ts: Date.now() }; cleanupSenderCache(senderCacheRef.current)
                    extra.fromNotifAPI = true
                    senderNotifTsRef.current[extra.senderName] = Date.now()
                    notifMidTsRef.current[messengerId] = Date.now()
                    handleNewMessage(messengerId, text, extra)
                  }).catch(() => {
                    extra.fromNotifAPI = true
                    handleNewMessage(messengerId, text, extra)
                  })
                return // НЕ вызываем handleNewMessage синхронно — ждём конвертации
              }
            }
            if (data.i) {
              if (data.i.startsWith('data:')) {
                extra.iconDataUrl = data.i
              } else if (data.i.startsWith('http')) {
                extra.iconUrl = data.i
              } else if (data.i.startsWith('/')) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                if (mi?.url) { try { extra.iconUrl = new URL(data.i, mi.url).href } catch {} }
              }
            }
            // Кэш sender
            if (extra.senderName) {
              senderCacheRef.current[messengerId] = { name: extra.senderName, avatar: extra.iconUrl || extra.iconDataUrl || '', ts: Date.now() }; cleanupSenderCache(senderCacheRef.current)
            }
            // v0.58.0: fromNotifAPI=true → пропускаем viewing-блок
            // Если мессенджер сам вызвал showNotification — пользователь НЕ видит этот чат
            extra.fromNotifAPI = true
            // v0.60.0 Решение #2: записываем sender+timestamp — блокируем __CC_MSG__ от того же sender
            if (extra.senderName) {
              notifSenderTsRef.current[messengerId + ':' + extra.senderName.slice(0, 30).toLowerCase()] = Date.now()
            }
            // v0.60.2: per-messengerId dedup — блокируем __CC_MSG__ от этого мессенджера на 3 сек
            notifMidTsRef.current[messengerId] = Date.now()
            handleNewMessage(messengerId, text, extra)
          }
        } catch {}
      })
    }
  }

  return { setWebviewRef, handleNewMessage, traceNotif, recentNotifsRef, lastRibbonTsRef, lastSoundTsRef, notifSenderTsRef, notifMidTsRef, notifCountRef, pendingMarkReadsRef }
}
