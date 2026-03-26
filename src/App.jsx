// v0.39.0 — Кастомные уведомления Messenger Ribbon
import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_MESSENGERS } from './constants.js'
import AddMessengerModal from './components/AddMessengerModal.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import AISidebar from './components/AISidebar.jsx'
import TemplatesPanel from './components/TemplatesPanel.jsx'
import AutoReplyPanel from './components/AutoReplyPanel.jsx'
import { detectMessengerType, isSpamText, ACCOUNT_SCRIPTS, DOM_SCAN_SCRIPTS, DIAG_FULL_SCRIPTS } from './utils/messengerConfigs.js'
import { isDuplicateExact, isDuplicateSubstring, stripSenderFromText, isOwnMessage, cleanupRecentMap, cleanSenderStatus } from './utils/messageProcessing.js'
import { parseConsoleMessage } from './utils/consoleMessageParser.js'
import { devLog, devError } from './utils/devLog.js'
import { playNotificationSound } from './utils/sound.js'
import { buildChatNavigateScript } from './utils/navigateToChat.js'
import { createWebviewSetup } from './utils/webviewSetup.js'
import MessengerTab from './components/MessengerTab.jsx'
import NotifLogModal from './components/NotifLogModal.jsx'

// v0.78.3: Звук вынесен в src/utils/sound.js

// v0.78.4: MessengerTab вынесен в src/components/MessengerTab.jsx

// Навигация → src/utils/navigateToChat.js | Звук → src/utils/sound.js | Вкладка → components/MessengerTab.jsx

// ─── Главный компонент ────────────────────────────────────────────────────

export default function App() {
  const [messengers, setMessengers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [accountInfo, setAccountInfo] = useState({})
  const [unreadCounts, setUnreadCounts] = useState({})
  const [unreadSplit, setUnreadSplit] = useState({})       // { [id]: { personal, channels } }
  // v0.79.8: monitorDiag удалён (не использовался)
  const [monitorStatus, setMonitorStatus] = useState({})   // { [id]: 'loading'|'active'|'error' }
  const [statusBarMsg, setStatusBarMsg] = useState(null)   // последнее сообщение для статусбара
  const [messagePreview, setMessagePreview] = useState({}) // { [id]: 'текст превью' }
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingMessenger, setEditingMessenger] = useState(null) // v0.62.6: редактирование вкладки
  const [showSettings, setShowSettings] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [settings, setSettings] = useState({ soundEnabled: true, minimizeToTray: true, theme: 'dark' })
  const [dragOverId, setDragOverId] = useState(null)
  const [monitorPreloadUrl, setMonitorPreloadUrl] = useState(null)
  const [appReady, setAppReady] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const [aiWidth, setAiWidth] = useState(300)
  const [chatHistory, setChatHistory] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAutoReply, setShowAutoReply] = useState(false)
  const [stats, setStats] = useState({ today: 0, autoToday: 0, total: 0, date: '' })
  const [newMessageIds, setNewMessageIds] = useState(new Set())
  const [isResizing, setIsResizing] = useState(false)
  const [zoomLevels, setZoomLevels] = useState({})
  const [zoomEditing, setZoomEditing] = useState(false)
  const [zoomInputValue, setZoomInputValue] = useState('')
  const [confirmClose, setConfirmClose] = useState(null) // { id, name, color }
  const [webviewLoading, setWebviewLoading] = useState({}) // { [id]: true/false } — загружается ли страница WebView

  const webviewRefs = useRef({})
  const notifReadyRef = useRef({})   // { [id]: true } — warm-up: игнорируем ВСЕ уведомления первые 30 сек
  const notifDedupRef = useRef(new Map()) // дедупликация __CC_NOTIF__ — messengerId:normalizedBody → timestamp
  const pipelineTraceRef = useRef([]) // Pipeline Trace Logger — трассировка ВСЕХ шагов уведомлений
  const pendingMsgRef = useRef(new Map()) // { messengerId:text → { timer, messengerId, text } } — ожидание enriched __CC_NOTIF__ 200мс
  const senderCacheRef = useRef({}) // { [messengerId]: { name, avatar, ts } } — кэш sender при неудачном enrichment (до 5 мин)
  const retryTimers = useRef({})
  const previewTimers = useRef({})
  const saveTimer = useRef(null)
  const searchInputRef = useRef(null)
  const dragStartId = useRef(null)
  const settingsRef = useRef(settings)
  const activeIdRef = useRef(activeId)
  const messengersRef = useRef(messengers)
  const isResizingRef = useRef(false)
  const resizeStartRef = useRef({ x: 0, w: 300 })
  const windowFocusedRef = useRef(true) // IPC window-state: main process сообщает о focus/blur
  const aiWidthRef = useRef(300)
  const aiPanelRef = useRef(null)
  const zoomLevelsRef = useRef({})
  const zoomInputRef = useRef(null)
  const statusBarMsgTimer = useRef(null)
  const tabContextMenu = useRef({ id: null, x: 0, y: 0 })
  const [contextMenuTab, setContextMenuTab] = useState(null) // { id, x, y }
  const [notifLogModal, setNotifLogModal] = useState(null) // { messengerId, name, log: [], trace: [] } | null
  const [notifLogTab, setNotifLogTab] = useState('log') // 'log' | 'trace'
  const [traceFilter, setTraceFilter] = useState('all') // 'all' | 'block' | 'source' | 'decision'
  const [cellTooltip, setCellTooltip] = useState(null) // { text, x, y } | null
  const statsRef = useRef({ today: 0, autoToday: 0, total: 0, date: '' })
  const statsSaveTimer = useRef(null)
  const zoomSaveTimer = useRef(null)
  const bumpStatsRef = useRef(null)

  // Синхронизация рефов
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { messengersRef.current = messengers }, [messengers])
  useEffect(() => { zoomLevelsRef.current = zoomLevels }, [zoomLevels])

  // bumpStats обновляется каждый рендер — чтобы ipc-handler всегда звал актуальную версию
  bumpStatsRef.current = (delta) => {
    const todayDate = new Date().toISOString().slice(0, 10)
    const cur = statsRef.current
    const base = cur.date !== todayDate
      ? { today: 0, autoToday: 0, total: cur.total || 0, date: todayDate }
      : cur
    const next = {
      ...base,
      today: (base.today || 0) + (delta.today || 0),
      autoToday: (base.autoToday || 0) + (delta.autoToday || 0),
      total: (base.total || 0) + (delta.total || 0),
    }
    statsRef.current = next
    setStats(next)
    clearTimeout(statsSaveTimer.current)
    statsSaveTimer.current = setTimeout(() => {
      const upd = { ...settingsRef.current, stats: statsRef.current }
      settingsRef.current = upd
      window.api.invoke('settings:save', upd).catch(() => {})
    }, 2000)
  }

  // ── Применение темы ──────────────────────────────────────────────────────
  useEffect(() => {
    const theme = settings.theme || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    window.api?.invoke('window:set-titlebar-theme', theme).catch(() => {})
  }, [settings.theme])

  // ── Загрузка при старте ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      window.api.invoke('messengers:load').then(list => {
        // Для дефолтных мессенджеров — всегда берём accountScript из constants.js
        const cleaned = list.map(m => {
          const def = DEFAULT_MESSENGERS.find(d => d.id === m.id)
          if (def) {
            const { accountScript, ...rest } = m
            return def.accountScript ? { ...rest, accountScript: def.accountScript } : rest
          }
          return m
        })
        setMessengers(cleaned)
        setActiveId(cleaned[0]?.id || null)
      }).catch(() => {
        setMessengers(DEFAULT_MESSENGERS)
        setActiveId(DEFAULT_MESSENGERS[0].id)
      }),
      window.api.invoke('settings:get').then(s => {
        setSettings(s)
        if (s.aiSidebarWidth) {
          const w = Math.max(240, Math.min(600, s.aiSidebarWidth))
          setAiWidth(w); aiWidthRef.current = w
        }
        // Загружаем зум вкладок
        if (s.zoomLevels && typeof s.zoomLevels === 'object') {
          setZoomLevels(s.zoomLevels)
          zoomLevelsRef.current = s.zoomLevels
        }
        // Загружаем статистику с ежедневным сбросом
        const todayDate = new Date().toISOString().slice(0, 10)
        const savedStats = s.stats || {}
        const loadedStats = savedStats.date !== todayDate
          ? { today: 0, autoToday: 0, total: savedStats.total || 0, date: todayDate }
          : { today: savedStats.today || 0, autoToday: savedStats.autoToday || 0, total: savedStats.total || 0, date: savedStats.date }
        setStats(loadedStats)
        statsRef.current = loadedStats
      }).catch(() => {}),
      window.api.invoke('app:get-paths').then(({ monitorPreload }) => {
        if (monitorPreload) {
          const url = 'file:///' + monitorPreload.replace(/\\/g, '/').replace(/^\//, '')
          setMonitorPreloadUrl(url)
        }
      }).catch(() => {})
    ]).finally(() => setAppReady(true))
  }, [])

  // ── Автосохранение мессенджеров ──────────────────────────────────────────
  useEffect(() => {
    if (messengers.length === 0) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api.invoke('messengers:save', messengers).catch(() => {})
    }, 600)
  }, [messengers])

  // ── IPC window-state: main process сообщает о focus/blur/minimize/restore ──
  useEffect(() => {
    return window.api.on('window-state', (state) => {
      windowFocusedRef.current = state.focused
    })
  }, [])

  // ── Бейдж-события от ChatMonitor ─────────────────────────────────────────
  useEffect(() => {
    return window.api.on('messenger:badge', ({ id, count }) => {
      setUnreadCounts(prev => {
        const prev_count = prev[id] || 0
        if (count > prev_count && settingsRef.current.soundEnabled !== false) {
          const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[id]
          // v0.62.6: дедупликация звука + логирование
          const lastSnd = lastSoundTsRef.current[id] || 0
          const sinceLast = Date.now() - lastSnd
          if (!messengerMuted && sinceLast > 3000) {
            const m = messengersRef.current.find(x => x.id === id)
            playNotificationSound(m?.color)
            lastSoundTsRef.current[id] = Date.now()
            traceNotif('sound', 'pass', id, `badge +${count - prev_count}`, 'звук badge')
          } else if (!messengerMuted) {
            traceNotif('sound', 'block', id, `badge +${count - prev_count}`, `dedup badge ${sinceLast}мс назад`)
          }
        }
        return { ...prev, [id]: count }
      })
    })
  }, [])

  // ── Клик по кастомному уведомлению (Messenger Ribbon) ────────────────────
  useEffect(() => {
    return window.api.on('notify:clicked', ({ messengerId, senderName, chatTag }) => {
      devLog('[GoChat] notify:clicked', { messengerId, senderName, chatTag })
      if (!messengerId) return
      setActiveId(messengerId)
      // Навигация к конкретному чату внутри WebView
      if (senderName || chatTag) {
        const tryNavigate = (attempt) => {
          // Проверяем что пользователь всё ещё на этой вкладке
          if (activeIdRef.current !== messengerId) {
            devLog(`[GoChat] attempt=${attempt} — CANCELLED (user switched to ${activeIdRef.current})`)
            return
          }
          const el = webviewRefs.current[messengerId]
          if (!el) {
            devLog(`[GoChat] attempt=${attempt} — webview ref NOT FOUND for ${messengerId}`)
            return
          }
          const url = el.getURL?.() || ''
          const script = buildChatNavigateScript(url, senderName, chatTag)
          if (!script) {
            devLog(`[GoChat] attempt=${attempt} — no script for url=${url.slice(0,50)}`)
            return
          }
          el.executeJavaScript(script).then(result => {
            const ok = result === true || (result && result.ok)
            const method = result?.method || ''
            devLog(`[GoChat] attempt=${attempt} ok=${ok} method=${method}`, result)
            if (ok) {
              setStatusBarMsg(`>> "${senderName}" (${method})`)
            } else if (attempt >= 2 || activeIdRef.current !== messengerId) {
              // Все попытки исчерпаны — показать что чат не найден
              setStatusBarMsg(`>> "${senderName}" - не найден в sidebar`)
            } else {
              setTimeout(() => tryNavigate(attempt + 1), 1500)
            }
          }).catch(err => { devError('[GoChat] executeJS error:', err.message) })
        }
        // Одна попытка через 800ms — без агрессивных retry
        setTimeout(() => tryNavigate(0), 800)
      }
    })
  }, [])

  // ── "Прочитано" из ribbon — клик по чату в WebView чтобы мессенджер пометил прочитанным (v0.62.0) ──
  // v0.62.6: выполнение mark-read скрипта (вынесено для вызова из очереди)
  const executeMarkRead = useCallback(({ messengerId, senderName, chatTag }) => {
    const el = webviewRefs.current[messengerId]
    if (!el) {
      traceNotif('mark-read', 'warn', messengerId, senderName || '', 'webview ref не найден')
      return
    }
    const url = el.getURL?.() || ''
    const script = buildChatNavigateScript(url, senderName, chatTag)
    if (script) {
      el.executeJavaScript(script).then(result => {
        const ok = result === true || (result && result.ok)
        traceNotif('mark-read', ok ? 'pass' : 'warn', messengerId, senderName || '', `ok=${ok} method=${result?.method || ''} ${result?.log || ''}`)
      }).catch(err => {
        traceNotif('mark-read', 'warn', messengerId, senderName || '', `ошибка: ${err.message}`)
      })
    } else {
      traceNotif('mark-read', 'warn', messengerId, senderName || '', `нет скрипта для url=${url.slice(0,50)}`)
    }
  }, [])

  useEffect(() => {
    return window.api.on('notify:mark-read', ({ messengerId, senderName, chatTag }) => {
      traceNotif('mark-read', 'info', messengerId, senderName || '', `sender="${(senderName||'').slice(0,30)}" tag=${!!chatTag} hidden=${document.hidden}`)
      if (!messengerId) return
      // v0.62.6: если окно свёрнуто/скрыто — отложить до visibilitychange
      if (document.hidden) {
        pendingMarkReadsRef.current.push({ messengerId, senderName, chatTag })
        traceNotif('mark-read', 'info', messengerId, senderName || '', 'отложено — окно скрыто')
        return
      }
      executeMarkRead({ messengerId, senderName, chatTag })
    })
  }, [executeMarkRead])

  // v0.62.6: обработка отложенных mark-read при появлении окна
  useEffect(() => {
    const handler = () => {
      if (!document.hidden && pendingMarkReadsRef.current.length > 0) {
        const pending = [...pendingMarkReadsRef.current]
        pendingMarkReadsRef.current = []
        traceNotif('mark-read', 'info', '', '', `обработка ${pending.length} отложенных mark-read`)
        pending.forEach(item => {
          setTimeout(() => executeMarkRead(item), 500)
        })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [executeMarkRead])

  // ── Автообновление лога уведомлений (каждые 3 сек пока окно открыто) ────
  useEffect(() => {
    if (!notifLogModal) return
    const mid = notifLogModal.messengerId
    const interval = setInterval(() => {
      const wv = webviewRefs.current[mid]
      if (!wv) return
      wv.executeJavaScript(`(function() { return JSON.stringify(window.__cc_notif_log || []); })()`)
        .then(json => {
          try {
            const log = JSON.parse(json)
            // Обновляем и лог, и trace (trace из ref, фильтруем по messengerId)
            const trace = pipelineTraceRef.current.filter(e => !e.mid || e.mid === mid)
            setNotifLogModal(prev => prev && prev.messengerId === mid ? { ...prev, log, trace } : prev)
          } catch {}
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [notifLogModal?.messengerId])

  // ── Горячие клавиши ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!e.ctrlKey) return
      const ms = messengersRef.current
      const aid = activeIdRef.current

      if (e.key >= '1' && e.key <= '9') {
        const m = ms[parseInt(e.key) - 1]
        if (m) { setActiveId(m.id); e.preventDefault() }
      } else if ((e.key === 't' || e.key === 'T') && !e.shiftKey) {
        setShowAddModal(true); e.preventDefault()
      } else if (e.key === 'w' || e.key === 'W') {
        if (aid && !(settingsRef.current.pinnedTabs || {})[aid]) { askRemoveMessenger(aid); e.preventDefault() }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleSearch(); e.preventDefault()
      } else if (e.key === ',') {
        setShowSettings(true); e.preventDefault()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const idx = ms.findIndex(m => m.id === aid)
        const len = ms.length
        if (len < 2) return
        const next = e.shiftKey ? (idx - 1 + len) % len : (idx + 1) % len
        setActiveId(ms[next].id)
      } else if (e.key === '=' || e.key === '+') {
        // Ctrl+= / Ctrl++ → увеличить зум
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        const clamped = Math.min(200, Math.round((cur + 10) / 5) * 5)
        setZoomLevels(prev => { const next = { ...prev, [aid]: clamped }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, clamped)
      } else if (e.key === '-' || e.key === '_') {
        // Ctrl+- → уменьшить зум
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        const clamped = Math.max(25, Math.round((cur - 10) / 5) * 5)
        setZoomLevels(prev => { const next = { ...prev, [aid]: clamped }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, clamped)
      } else if (e.key === '0') {
        // Ctrl+0 → сбросить зум
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        setZoomLevels(prev => { const next = { ...prev, [aid]: 100 }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, 100)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line

  // ── Resizer AI-панели ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!isResizingRef.current) return
      const delta = resizeStartRef.current.x - e.clientX
      const newW = Math.max(240, Math.min(600, resizeStartRef.current.w + delta))
      aiWidthRef.current = newW
      if (aiPanelRef.current) {
        aiPanelRef.current.style.width = `${newW}px`
        const inner = aiPanelRef.current.firstChild
        if (inner) { inner.style.width = `${newW}px`; inner.style.minWidth = `${newW}px` }
      }
    }
    const onUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const newW = aiWidthRef.current
      setAiWidth(newW)
      const updated = { ...settingsRef.current, aiSidebarWidth: newW }
      setSettings(updated)
      window.api.invoke('settings:save', updated).catch(() => {})
      if (aiPanelRef.current) aiPanelRef.current.style.transition = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startResize = (e) => {
    isResizingRef.current = true
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, w: aiWidthRef.current }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    if (aiPanelRef.current) aiPanelRef.current.style.transition = 'none'
    e.preventDefault()
  }

  // ── Зум WebView ──────────────────────────────────────────────────────────
  const applyZoom = (id, pct) => {
    try { webviewRefs.current[id]?.setZoomFactor(pct / 100) } catch {}
  }

  // Плавная анимация зума (ease-out, ~6 кадров)
  const animateZoom = (id, from, to) => {
    if (from === to) { applyZoom(id, to); return }
    const steps = 6
    let step = 0
    const tick = () => {
      step++
      const t = step / steps
      const eased = 1 - Math.pow(1 - t, 2)
      const val = from + (to - from) * eased
      try { webviewRefs.current[id]?.setZoomFactor(val / 100) } catch {}
      if (step < steps) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  const saveZoomLevels = (next) => {
    clearTimeout(zoomSaveTimer.current)
    zoomSaveTimer.current = setTimeout(() => {
      const updated = { ...settingsRef.current, zoomLevels: next }
      settingsRef.current = updated
      window.api.invoke('settings:save', updated).catch(() => {})
    }, 800)
  }

  const changeZoom = (pct) => {
    if (!activeId) return
    const from = zoomLevelsRef.current[activeId] || 100
    const clamped = Math.max(25, Math.min(200, Math.round(pct / 5) * 5))
    setZoomLevels(prev => {
      const next = { ...prev, [activeId]: clamped }
      saveZoomLevels(next)
      return next
    })
    animateZoom(activeId, from, clamped)
  }

  // Применяем сохранённый зум при переключении вкладки
  useEffect(() => {
    if (!activeId) return
    const zoom = zoomLevelsRef.current[activeId] || 100
    const t = setTimeout(() => applyZoom(activeId, zoom), 60)
    return () => clearTimeout(t)
  }, [activeId]) // eslint-disable-line

  // ── Очистка ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(retryTimers.current).forEach(t => clearTimeout(t))
      clearTimeout(saveTimer.current)
      clearTimeout(statsSaveTimer.current)
      clearTimeout(zoomSaveTimer.current)
    }
  }, [])

  // v0.75.5: Автосброс notifCountRef при переключении на вкладку (ЛЮБЫМ способом)
  // Покрывает: handleTabClick, notify:clicked, Ctrl+Tab, Ctrl+1-9, автопереключение
  useEffect(() => {
    if (!activeId) return
    // Задержка 1.5с — даём DOM-подсчёту время отработать
    const timer = setTimeout(() => {
      if (notifCountRef.current[activeId] > 0 && windowFocusedRef.current) {
        devLog(`[BADGE] auto-reset notifCountRef[${activeId}] = ${notifCountRef.current[activeId]} → 0 (viewing)`)
        notifCountRef.current[activeId] = 0
        setUnreadCounts(prev => {
          if (prev[activeId] > 0) return { ...prev, [activeId]: 0 }
          return prev
        })
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [activeId])

  // ── Переключение вкладки ──────────────────────────────────────────────────
  const handleTabClick = (id) => {
    setActiveId(id)
    // v0.72.5: Обнуляем fallback Notification count при просмотре вкладки
    notifCountRef.current[id] = 0
    // v0.74.4: НЕ обнуляем unreadCounts принудительно — это ломает overlay для мессенджеров с title-числом.
    // Для WhatsApp (title без числа) сброс произойдёт через unread-count IPC (domCount=0, isViewing=true).
    // Убираем анимацию при клике на вкладку
    setNewMessageIds(prev => { const n = new Set(prev); n.delete(id); return n })
    if (searchVisible && searchText) {
      setTimeout(() => { webviewRefs.current[id]?.findInPage(searchText) }, 200)
    }
  }

  // ── Закрытие вкладки ──────────────────────────────────────────────────────
  const removeMessenger = useCallback((id) => {
    setMessengers(prev => {
      const next = prev.filter(m => m.id !== id)
      setActiveId(curr => curr === id ? (next[0]?.id || null) : curr)
      return next
    })
    // v0.80.0: Cleanup WebView event listeners перед удалением
    const wv = webviewRefs.current[id]
    if (wv && wv._chatcenterListeners) {
      for (const [event, fn] of wv._chatcenterListeners) {
        try { wv.removeEventListener(event, fn) } catch {}
      }
      wv._chatcenterListeners = null
    }
    delete webviewRefs.current[id]
    clearTimeout(retryTimers.current[id])
    delete retryTimers.current[id]
    setAccountInfo(prev => { const n = { ...prev }; delete n[id]; return n })
    setUnreadCounts(prev => { const n = { ...prev }; delete n[id]; return n })
    setConfirmClose(null)
  }, [])

  // Запрос подтверждения перед закрытием
  const askRemoveMessenger = useCallback((id) => {
    const m = messengersRef.current.find(x => x.id === id)
    if (!m) return
    setConfirmClose({ id: m.id, name: m.name, color: m.color, emoji: m.emoji })
  }, [])

  // ── Добавление мессенджера ────────────────────────────────────────────────
  const addMessenger = useCallback((m) => {
    setMessengers(prev => [...prev, m])
    setActiveId(m.id)
    setShowAddModal(false)
  }, [])

  // v0.62.6: сохранение изменений вкладки
  const saveMessenger = useCallback((updated) => {
    setMessengers(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
    setEditingMessenger(null)
  }, [])

  // ── Drag-and-drop вкладок ────────────────────────────────────────────────
  const handleDragStart = (id) => { dragStartId.current = id }
  const handleDragOver = (id) => { setDragOverId(id) }
  const handleDrop = (id) => {
    const fromId = dragStartId.current
    if (!fromId || fromId === id) { setDragOverId(null); dragStartId.current = null; return }
    setMessengers(prev => {
      const list = [...prev]
      const fi = list.findIndex(m => m.id === fromId)
      const ti = list.findIndex(m => m.id === id)
      if (fi < 0 || ti < 0) return prev
      const [item] = list.splice(fi, 1)
      list.splice(ti, 0, item)
      return list
    })
    setDragOverId(null)
    dragStartId.current = null
  }
  const handleDragEnd = () => { setDragOverId(null); dragStartId.current = null }

  // ── Поиск ─────────────────────────────────────────────────────────────────
  const handleSearch = (text) => {
    setSearchText(text)
    const wv = webviewRefs.current[activeIdRef.current]
    if (!wv) return
    text ? wv.findInPage(text, { findNext: false }) : wv.stopFindInPage('clearSelection')
  }

  const toggleSearch = useCallback(() => {
    setSearchVisible(prev => {
      if (prev) {
        setSearchText('')
        webviewRefs.current[activeIdRef.current]?.stopFindInPage('clearSelection')
        return false
      }
      setTimeout(() => searchInputRef.current?.focus(), 80)
      return true
    })
  }, [])

  // ── Настройки ─────────────────────────────────────────────────────────────
  const handleSettingsChange = useCallback((newSettings) => {
    setSettings(newSettings)
    window.api.invoke('settings:save', newSettings).catch(() => {})
  }, [])

  // v0.82.6: WebView setup вынесен в src/utils/webviewSetup.js (~842 строки)
  const { setWebviewRef, handleNewMessage, traceNotif, recentNotifsRef, lastRibbonTsRef, lastSoundTsRef, notifSenderTsRef, notifMidTsRef, notifCountRef, pendingMarkReadsRef } = createWebviewSetup({
    webviewRefs, notifReadyRef, notifDedupRef, pipelineTraceRef, pendingMsgRef, senderCacheRef,
    retryTimers, previewTimers, statusBarMsgTimer, bumpStatsRef: { current: null },
    settingsRef, activeIdRef, messengersRef, windowFocusedRef, zoomLevelsRef,
    setAccountInfo, setActiveId, setChatHistory, setLastMessage, setMessagePreview,
    setMonitorStatus, setNewMessageIds, setStatusBarMsg, setUnreadCounts, setUnreadSplit,
    setWebviewLoading, setZoomLevels, monitorPreloadUrl,
  })

  // ── Контекстное меню вкладки ────────────────────────────────────────────
  // v0.78.2: Диагностики → мессенджер-специфичные скрипты из messengerConfigs.js
  const handleTabContextAction_diag = (action, mid, wv) => {
    if (!wv || !mid) return
    // Определяем тип мессенджера по URL
    const mInfo = messengersRef.current.find(x => x.id === mid)
    const mType = detectMessengerType(mInfo?.url || '')

    if (action === 'diagDOM') {
      const script = DOM_SCAN_SCRIPTS[mType] || DOM_SCAN_SCRIPTS.unknown
      wv.executeJavaScript(script)
        .then(res => {
          try {
            const data = JSON.parse(res)
            setNotifLogModal(prev => prev ? { ...prev, domScanData: data } : prev)
            navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {})
          } catch {}
        }).catch(err => {
          devError('[DOM-скан] ошибка:', err)
          setNotifLogModal(prev => prev ? { ...prev, domScanData: { error: err.message || String(err), type: mType } } : prev)
        })
    } else if (action === 'diagFull') {
      wv.executeJavaScript(DIAG_FULL_SCRIPTS.common)
        .then(json => {
          try {
            const data = JSON.parse(json)
            setNotifLogModal(prev => prev ? { ...prev, diagFullData: data } : prev)
            navigator.clipboard.writeText(json).catch(() => {})
          } catch {}
        }).catch(err => {
          setNotifLogModal(prev => prev ? { ...prev, diagFullData: { error: err.message || String(err) } } : prev)
        })
    } else if (action === 'diagAccount') {
      const script = ACCOUNT_SCRIPTS[mType] || ACCOUNT_SCRIPTS.telegram
      wv.executeJavaScript(script)
        .then(name => {
          const data = { type: mType, name: name || 'не найдено', script: mType }
          setNotifLogModal(prev => prev ? { ...prev, diagAccountData: data } : prev)
          navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {})
        }).catch(err => {
          setNotifLogModal(prev => prev ? { ...prev, diagAccountData: { error: err.message || String(err), type: mType } } : prev)
        })
    }
  }

  const handleTabContextAction = (action) => {
    const id = contextMenuTab?.id
    setContextMenuTab(null)
    if (!id) return
    const wv = webviewRefs.current[id]
    if (action === 'reload') {
      if (wv) { try { wv.reload() } catch {} }
      setMonitorStatus(prev => ({ ...prev, [id]: 'loading' }))
    } else if (action === 'diag') {
      if (wv) { try { wv.send('run-diagnostics') } catch {} }
    } else if (action === 'notifLog') {
      // Лог уведомлений — извлекаем массив из WebView main world + pipeline trace
      if (wv) {
        const trace = pipelineTraceRef.current.filter(e => !e.mid || e.mid === id)
        wv.executeJavaScript(`(function() { return JSON.stringify(window.__cc_notif_log || []); })()`)
          .then(json => {
            try {
              const log = JSON.parse(json)
              const mInfo = messengers.find(x => x.id === id)
              setNotifLogModal({ messengerId: id, name: mInfo?.name || id, log, trace })
              setNotifLogTab('log')
            } catch {}
          })
          .catch(() => {
            setNotifLogModal({ messengerId: id, name: id, log: [], trace })
            setNotifLogTab('log')
          })
      }
    } else if (action === 'copyUrl') {
      const m = messengers.find(x => x.id === id)
      if (m?.url) navigator.clipboard.writeText(m.url).catch(() => {})
    } else if (action === 'edit') {
      const m = messengersRef.current.find(x => x.id === id)
      if (m) setEditingMessenger({ ...m })
    } else if (action === 'pin') {
      togglePinTab(id)
    } else if (action === 'close') {
      askRemoveMessenger(id)
    }
  }

  // ── Pin/unpin вкладки ────────────────────────────────────────────────────
  const pinnedTabs = settings.pinnedTabs || {}
  const togglePinTab = useCallback((id) => {
    const cur = settingsRef.current.pinnedTabs || {}
    const next = { ...cur }
    if (next[id]) { delete next[id] } else { next[id] = true }
    const updated = { ...settingsRef.current, pinnedTabs: next }
    settingsRef.current = updated
    setSettings(updated)
    window.api.invoke('settings:save', updated).catch(() => {})
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  const theme = settings.theme || 'dark'
  const currentZoom = zoomLevels[activeId] || 100

  // v0.74.1: Overlay badge с раздельным счётчиком личные/каналы
  const overlayTimerRef = useRef(null)
  // Суммарный счётчик личных сообщений (из unreadSplit)
  const totalPersonal = Object.entries(unreadSplit).reduce((sum, [id, split]) => {
    if (split && split.personal > 0) return sum + split.personal
    return sum
  }, 0)
  // Для мессенджеров без split (MAX, VK, WhatsApp) — весь unreadCount считаем личным
  const totalPersonalWithFallback = Object.entries(unreadCounts).reduce((sum, [id, count]) => {
    if (count <= 0) return sum
    const split = unreadSplit[id]
    if (split) return sum + (split.personal || 0)
    return sum + count // нет split → всё считаем личным
  }, 0)
  // v0.74.5: Суммарный счётчик каналов (из unreadSplit)
  const totalChannels = Object.entries(unreadSplit).reduce((sum, [id, split]) => {
    if (split && split.channels > 0) return sum + split.channels
    return sum
  }, 0)
  useEffect(() => {
    const details = Object.entries(unreadCounts).filter(([,v]) => v > 0).map(([id, v]) => {
      const m = messengers.find(x => x.id === id)
      const split = unreadSplit[id]
      const extra = split ? ` (💬${split.personal} 📢${split.channels})` : ''
      return `${(m?.name || id).slice(0, 8)}:${v}${extra}`
    }).join(' ')
    // v0.76.7: Детальный лог split для каждого мессенджера
    const splitDetails = Object.entries(unreadCounts).filter(([,v]) => v > 0).map(([id, v]) => {
      const split = unreadSplit[id]
      return `${id.slice(0,12)}:count=${v},split=${split ? `p${split.personal}c${split.channels}` : 'NONE'}`
    }).join(' | ')
    devLog(`[BADGE] total=${totalUnread} personal=${totalPersonalWithFallback} channels=${totalChannels} mode=${settingsRef.current.overlayMode} [${splitDetails}]`)

    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    overlayTimerRef.current = setTimeout(() => {
      const breakdown = Object.entries(unreadCounts)
        .filter(([, v]) => v > 0)
        .map(([id, v]) => {
          const m = messengers.find(x => x.id === id)
          const split = unreadSplit[id]
          return { name: m?.name || id, count: v, personal: split?.personal, channels: split?.channels }
        })
      const overlayMode = settingsRef.current.overlayMode || 'personal'
      devLog(`[BADGE] FIRE tray:set-badge count=${totalUnread} personal=${totalPersonalWithFallback} channels=${totalChannels} mode=${overlayMode}`)
      window.api.invoke('tray:set-badge', { count: totalUnread, personal: totalPersonalWithFallback, channels: totalChannels, breakdown, overlayMode })
    }, 500)
    return () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current) }
  }, [totalUnread, totalPersonalWithFallback, totalChannels, settings.overlayMode])

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--cc-bg)' }} onClick={() => contextMenuTab && setContextMenuTab(null)}>

      {/* ── Шапка ── */}
      <div
        className="flex items-center h-[48px] shrink-0 select-none"
        style={{
          backgroundColor: 'var(--cc-surface)',
          borderBottom: '1px solid var(--cc-border)',
          WebkitAppRegion: 'drag',
        }}
      >
        {/* Ручка перетаскивания */}
        <div
          className="flex items-center justify-center w-[28px] h-full shrink-0 cursor-grab"
          title="Перетащить окно"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
            {[0, 6].map(x => [2, 6, 10].map(y => (
              <circle key={`${x}-${y}`} cx={x + 2} cy={y} r={1.2} fill="var(--cc-icon)" />
            )))}
          </svg>
        </div>

        {/* Логотип */}
        <div
          className="pr-3 text-[13px] font-semibold whitespace-nowrap shrink-0"
          style={{ color: 'var(--cc-text-dim)' }}
        >
          ЦентрЧатов
        </div>

        {/* Вкладки — no-drag */}
        <div
          className="flex items-center flex-1 overflow-x-auto h-full min-w-0"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          {messengers.map(m => (
            <MessengerTab
              key={m.id}
              messenger={m}
              isActive={activeId === m.id}
              accountInfo={accountInfo[m.id]}
              unreadCount={
                // v0.76.6: При "Только личные" — бейдж вкладки показывает personal (не allTotal)
                settings.overlayMode === 'personal' && unreadSplit[m.id]
                  ? (unreadSplit[m.id].personal || 0)
                  : (unreadCounts[m.id] || 0)
              }
              unreadSplit={unreadSplit[m.id]}
              messagePreview={messagePreview[m.id]}
              zoomLevel={zoomLevels[m.id]}
              monitorStatus={monitorStatus[m.id]}
              isPageLoading={!!webviewLoading[m.id]}
              isNew={newMessageIds.has(m.id)}
              isPinned={!!pinnedTabs[m.id]}
              isDragOver={dragOverId === m.id}
              onClick={() => handleTabClick(m.id)}
              onClose={() => { if (!pinnedTabs[m.id]) askRemoveMessenger(m.id) }}
              onContextMenu={(e) => { e.preventDefault(); setContextMenuTab({ id: m.id, x: e.clientX, y: e.clientY }) }}
              onDragStart={() => handleDragStart(m.id)}
              onDragOver={() => handleDragOver(m.id)}
              onDrop={() => handleDrop(m.id)}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Кнопка «+» */}
          <button
            onClick={() => setShowAddModal(true)}
            title="Добавить мессенджер (Ctrl+T)"
            className="flex items-center justify-center h-[30px] w-[30px] rounded-lg ml-1 text-xl leading-none transition-all duration-150 cursor-pointer shrink-0"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >+</button>
        </div>

        {/* Правые кнопки — no-drag */}
        <div
          className="flex items-center gap-0.5 px-2 shrink-0"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            onClick={toggleSearch}
            title="Поиск (Ctrl+F)"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: searchVisible ? 'rgba(42,171,238,0.15)' : 'transparent',
              color: searchVisible ? '#2AABEE' : 'var(--cc-icon)',
            }}
            onMouseEnter={e => { if (!searchVisible) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
            onMouseLeave={e => { if (!searchVisible) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
          >🔍</button>

          <button
            onClick={() => setShowAI(!showAI)}
            title="ИИ-помощник"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: showAI ? 'rgba(42,171,238,0.15)' : 'transparent',
              color: showAI ? '#2AABEE' : 'var(--cc-icon)',
            }}
            onMouseEnter={e => { if (!showAI) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
            onMouseLeave={e => { if (!showAI) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
          >🤖</button>

          <button
            onClick={() => setShowTemplates(!showTemplates)}
            title="Шаблоны ответов"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: showTemplates ? 'rgba(34,197,94,0.15)' : 'transparent',
              color: showTemplates ? '#22c55e' : 'var(--cc-icon)',
            }}
            onMouseEnter={e => { if (!showTemplates) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
            onMouseLeave={e => { if (!showTemplates) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
          >📋</button>

          <button
            onClick={() => setShowAutoReply(!showAutoReply)}
            title="Авто-ответчик"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{
              backgroundColor: showAutoReply ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: showAutoReply ? '#a855f7' : 'var(--cc-icon)',
            }}
            onMouseEnter={e => { if (!showAutoReply) { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' } }}
            onMouseLeave={e => { if (!showAutoReply) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' } }}
          >⚡</button>

          <button
            onClick={() => handleSettingsChange({ ...settings, theme: theme === 'dark' ? 'light' : 'dark' })}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >{theme === 'dark' ? '☀️' : '🌙'}</button>

          <button
            onClick={() => setShowSettings(true)}
            title="Настройки (Ctrl+,)"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >⚙️</button>

          {/* Общий бейдж непрочитанных убран (v0.20.0) — по запросу пользователя */}
        </div>

        <div className="wco-spacer" />
      </div>

      {/* ── Строка поиска ── */}
      {searchVisible && (
        <div
          className="flex items-center h-[38px] px-3 gap-2 shrink-0"
          style={{ backgroundColor: 'var(--cc-surface-alt)', borderBottom: '1px solid var(--cc-border)' }}
        >
          <span className="text-sm" style={{ color: 'var(--cc-text-dimmer)' }}>🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') toggleSearch()
              if (e.key === 'Enter') {
                const wv = webviewRefs.current[activeIdRef.current]
                if (wv && searchText) wv.findInPage(searchText, { findNext: true, forward: !e.shiftKey })
              }
            }}
            placeholder="Поиск в мессенджере... (Enter — следующий, Shift+Enter — предыдущий)"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--cc-text)' }}
          />
          <button
            onClick={toggleSearch}
            className="text-sm px-1 cursor-pointer transition-colors"
            style={{ color: 'var(--cc-text-dimmer)' }}
          >✕</button>
        </div>
      )}

      {/* ── Основной layout ── */}
      {/* ── Контекстное меню вкладки ── */}
      {contextMenuTab && (
        <div
          className="fixed z-[100]"
          style={{ left: contextMenuTab.x, top: contextMenuTab.y }}
          onMouseLeave={() => setContextMenuTab(null)}
        >
          <div
            className="rounded-lg py-1 shadow-xl text-[12px] min-w-[180px]"
            style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
          >
            {(() => {
              const tabPinned = !!(settings.pinnedTabs || {})[contextMenuTab?.id]
              return [
                { action: 'reload', icon: '🔄', label: 'Перезагрузить' },
                { action: 'notifLog', icon: '📊', label: 'Диагностика и логи' },
                { action: 'copyUrl', icon: '📋', label: 'Копировать URL' },
                { action: 'edit', icon: '✏️', label: 'Изменить вкладку' },
                { action: 'pin', icon: tabPinned ? '📌' : '🔒', label: tabPinned ? 'Открепить вкладку' : 'Закрепить вкладку' },
                ...(!tabPinned ? [{ action: 'close', icon: '✕', label: 'Закрыть вкладку', color: '#f87171' }] : []),
              ].map(item => (
                <button
                  key={item.action}
                  onClick={() => handleTabContextAction(item.action)}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors cursor-pointer"
                  style={{ color: item.color || 'inherit' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <span className="w-[16px] text-center">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))
            })()}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Область WebView ── */}
        <div className="flex-1 relative overflow-hidden" style={{ backgroundColor: 'var(--cc-bg)', cursor: isResizing ? 'col-resize' : undefined }}>
          {messengers.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center px-8">
                <div className="text-6xl mb-5">💬</div>
                <p className="text-lg font-medium mb-2" style={{ color: 'var(--cc-text-dim)' }}>Нет мессенджеров</p>
                <p className="text-sm mb-5" style={{ color: 'var(--cc-text-dimmer)' }}>Добавьте мессенджер, чтобы начать работу</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-5 py-2 rounded-lg text-white text-sm font-medium transition-opacity cursor-pointer"
                  style={{ backgroundColor: '#2AABEE' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  + Добавить мессенджер
                </button>
              </div>
            </div>
          ) : appReady ? (
            messengers.map(m => (
              <div
                key={m.id}
                className="absolute inset-0"
                style={{
                  zIndex: activeId === m.id ? 2 : 0,
                  pointerEvents: activeId === m.id ? 'auto' : 'none',
                }}
              >
                <webview
                  ref={el => setWebviewRef(el, m.id)}
                  src={m.url}
                  partition={m.partition}
                  preload={monitorPreloadUrl || undefined}
                  style={{ width: '100%', height: '100%' }}
                  allowpopups="true"
                  webpreferences="backgroundThrottling=no"
                />
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-2xl animate-pulse" style={{ color: 'var(--cc-text-dimmer)' }}>⏳</div>
            </div>
          )}

          {/* Overlay во время resize — блокирует WebView от захвата mousemove/mouseup */}
          {isResizing && (
            <div className="absolute inset-0 z-50" style={{ cursor: 'col-resize' }} />
          )}
        </div>

        {/* ── Resizer ── */}
        {showAI && (
          <div
            onMouseDown={startResize}
            className="shrink-0 cursor-col-resize transition-colors duration-150"
            style={{ width: '6px', backgroundColor: isResizing ? '#2AABEE88' : 'var(--cc-border)' }}
            onMouseEnter={e => { if (!isResizing) e.currentTarget.style.backgroundColor = '#2AABEE66' }}
            onMouseLeave={e => { if (!isResizing) e.currentTarget.style.backgroundColor = 'var(--cc-border)' }}
            title="Потяни для изменения ширины панели ИИ"
          />
        )}

        {/* ── ИИ-боковая панель ── */}
        <AISidebar
          settings={settings}
          onSettingsChange={handleSettingsChange}
          lastMessage={lastMessage}
          visible={showAI}
          width={aiWidth}
          onToggle={() => setShowAI(!showAI)}
          panelRef={aiPanelRef}
          chatHistory={chatHistory}
          activeMessengerId={activeId}
        />
      </div>

      {/* ── Строка статистики ── */}
      <div
        className="flex items-center px-3 h-[26px] text-[11px] gap-3 shrink-0 select-none"
        style={{
          backgroundColor: 'var(--cc-surface)',
          borderTop: '1px solid var(--cc-border)',
          color: 'var(--cc-text-dimmer)',
        }}
      >
        <span title="Входящих сообщений сегодня">💬 <span style={{ color: 'var(--cc-text-dim)', fontWeight: 600 }}>{stats.today}</span> сегодня</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span title="Авто-ответов отправлено сегодня">⚡ <span style={{ color: stats.autoToday > 0 ? '#a855f7' : 'var(--cc-text-dim)', fontWeight: 600 }}>{stats.autoToday}</span> авто</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span title="Всего сообщений за всё время">📊 <span style={{ color: 'var(--cc-text-dim)', fontWeight: 600 }}>{stats.total}</span> всего</span>
        {totalUnread > 0 && (
          <>
            <span style={{ opacity: 0.3 }}>·</span>
            <span title={Object.entries(unreadCounts).filter(([,v]) => v > 0).map(([id, v]) => {
              const m = messengers.find(x => x.id === id)
              return `${m?.name || id}: ${v}`
            }).join(', ')}>📥 <span style={{ color: '#f87171', fontWeight: 600 }}>{totalUnread}</span> непрочитано{' '}
              <span style={{ color: 'var(--cc-text-dim)', fontSize: '10px' }}>[{Object.entries(unreadCounts).filter(([,v]) => v > 0).map(([id, v]) => {
                const m = messengers.find(x => x.id === id)
                const short = (m?.name || '?').slice(0, 3)
                return `${short}:${v}`
              }).join(' ')}]</span>
            </span>
          </>
        )}

        {/* ── Последнее сообщение (бегущая строка, 8 сек) ── */}
        {statusBarMsg && (
          <>
            <span style={{ opacity: 0.3 }}>·</span>
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[300px]"
              style={{ color: 'var(--cc-text-dim)' }}
              title={statusBarMsg}
            >💬 {statusBarMsg}</span>
          </>
        )}

        {/* ── Зум текущей вкладки ── */}
        {activeId && (
          <div className="ml-auto flex items-center gap-0.5" title={`Масштаб окна чата: ${currentZoom}%`}>
            <button
              onClick={() => changeZoom(currentZoom - 5)}
              disabled={currentZoom <= 25}
              className="w-[16px] h-[16px] flex items-center justify-center rounded cursor-pointer leading-none"
              style={{ color: 'var(--cc-text-dim)', opacity: currentZoom <= 25 ? 0.3 : 1, fontSize: 14 }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Уменьшить (−5%)"
            >−</button>

            {zoomEditing ? (
              <input
                ref={zoomInputRef}
                type="number"
                min={25}
                max={200}
                value={zoomInputValue}
                onChange={e => setZoomInputValue(e.target.value)}
                onBlur={() => {
                  const v = parseInt(zoomInputValue)
                  if (!isNaN(v)) changeZoom(v)
                  setZoomEditing(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { const v = parseInt(zoomInputValue); if (!isNaN(v)) changeZoom(v); setZoomEditing(false) }
                  else if (e.key === 'Escape') setZoomEditing(false)
                }}
                className="w-[38px] text-center bg-transparent outline-none border-b"
                style={{ color: 'var(--cc-text)', borderColor: 'var(--cc-border)', fontSize: 10 }}
                autoFocus
              />
            ) : (
              <span
                onClick={() => { setZoomEditing(true); setZoomInputValue(String(currentZoom)) }}
                className="w-[34px] text-center cursor-pointer rounded px-0.5"
                style={{ color: currentZoom !== 100 ? '#2AABEE' : 'var(--cc-text-dim)', fontSize: 10 }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                title="Нажмите для ввода точного значения"
              >{currentZoom}%</span>
            )}

            <button
              onClick={() => changeZoom(currentZoom + 5)}
              disabled={currentZoom >= 200}
              className="w-[16px] h-[16px] flex items-center justify-center rounded cursor-pointer leading-none"
              style={{ color: 'var(--cc-text-dim)', opacity: currentZoom >= 200 ? 0.3 : 1, fontSize: 14 }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Увеличить (+5%)"
            >+</button>

            {currentZoom !== 100 && (
              <button
                onClick={() => changeZoom(100)}
                className="text-[9px] px-0.5 rounded cursor-pointer ml-0.5"
                style={{ color: 'var(--cc-text-dimmer)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--cc-text)'; e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--cc-text-dimmer)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                title="Сбросить масштаб к 100%"
              >↺</button>
            )}
          </div>
        )}
      </div>

      {/* ── Модальные окна ── */}
      {showAddModal && (
        <AddMessengerModal
          onAdd={addMessenger}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editingMessenger && (
        <AddMessengerModal
          editing={editingMessenger}
          onSave={saveMessenger}
          onAdd={() => {}}
          onClose={() => setEditingMessenger(null)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          messengers={messengers}
          settings={settings}
          onMessengersChange={setMessengers}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showTemplates && (
        <TemplatesPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {showAutoReply && (
        <AutoReplyPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setShowAutoReply(false)}
        />
      )}

      {/* ── Диалог подтверждения закрытия вкладки ── */}
      {confirmClose && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'var(--cc-overlay)' }}
          onClick={() => setConfirmClose(null)}
          onKeyDown={e => { if (e.key === 'Escape') setConfirmClose(null) }}
        >
          <div
            className="rounded-2xl p-6 w-[380px] shadow-2xl"
            style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center gap-4">
              {/* Иконка предупреждения */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{ backgroundColor: `${confirmClose.color}20` }}
              >
                {confirmClose.emoji || '💬'}
              </div>

              <div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--cc-text)' }}>
                  Закрыть вкладку?
                </h3>
                <p className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>
                  Вкладка <span style={{ color: confirmClose.color, fontWeight: 600 }}>{confirmClose.name}</span> будет удалена.
                  <br />Сессия авторизации может сброситься.
                </p>
              </div>

              {/* Кнопки */}
              <div className="flex gap-3 w-full mt-1">
                <button
                  onClick={() => setConfirmClose(null)}
                  autoFocus
                  className="flex-1 py-2.5 rounded-lg text-sm transition-all cursor-pointer"
                  style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dim)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-border)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
                >Отмена</button>
                <button
                  onClick={() => removeMessenger(confirmClose.id)}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-all cursor-pointer"
                  style={{ backgroundColor: '#ef4444' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >Закрыть</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Модальное окно: Лог уведомлений ── */}
      {notifLogModal && <NotifLogModal ctx={{
        notifLogModal, setNotifLogModal, notifLogTab, setNotifLogTab,
        traceFilter, setTraceFilter, setCellTooltip,
        settings, setSettings, webviewRefs,
        handleTabContextAction_diag,
        traceNotif, handleNewMessage, pipelineTraceRef
      }} />}

      {/* ── Тултип для ячеек таблицы лога ── */}
      {cellTooltip && (
        <div className="cc-notif-tooltip" style={{ left: Math.min(cellTooltip.x + 8, window.innerWidth - 460), top: cellTooltip.y + 16 }}>
          {cellTooltip.text}
        </div>
      )}
    </div>
  )
}
