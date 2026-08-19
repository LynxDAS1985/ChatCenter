// v0.39.0 — Кастомные уведомления Messenger Ribbon
// v0.87.82 — Refactored: 3 useEffect вынесены в useAppBootstrap / useConsoleErrorLogger / useAppIPCListeners
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { DEFAULT_MESSENGERS } from './constants.js'
import { devLog, devError } from './utils/devLog.js'
import { playNotificationSound } from './utils/sound.js'
import { buildChatNavigateScript } from './utils/navigateToChat.js'
import { createWebviewSetup } from './utils/webviewSetup.js'
// v1.2.22: Вариант A — тумблер useWebContentsView открывает Макс в ОТДЕЛЬНОМ окне (main: max-test:*),
// а не WebContentsView внутри главного окна (тот крашил Electron на Win11 — Issue #44934/#47247).
import { markHealthPending } from './utils/connectionHealth.js'
import { probeWebviewHealth } from './utils/webviewHealthProbe.js'
import { probeBlackScreen } from './utils/webviewDiagnostics.js'
import { runSelectedDiagnosticsDeepCheck } from './utils/runSelectedDiagnosticsDeepCheck.js'
import {
  HEALTH_SCHEDULER_TICK_MS,
  selectConnectionHealthJobs,
} from './utils/connectionHealthScheduler.js'
import TabBar from './components/TabBar.jsx'
import TabContextMenu from './components/TabContextMenu.jsx' // v1.2.271: меню правого клика на уровне App
import ErrorBoundary from './components/ErrorBoundary.jsx'
// v0.89.42 (Phase 2.2): WebContentsView pilot — условный рендер по settings.useWebContentsView.
// v0.91.0: WebContentsViewSlot откачен (Issue #44934 Windows 11 crash)
// import WebContentsViewSlot from './components/WebContentsViewSlot.jsx'
import UncaughtErrorToast from './components/UncaughtErrorToast.jsx'
// v0.89.44 (Совет 1): bridge для подключения webviewSetup к WebContentsView через wcv:* IPC.
// v0.91.0: WebContentsViewBridge откачен
// import { createWebContentsViewBridge } from './utils/webContentsViewBridge.js'

// Hooks
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts.js'
import useAIPanelResize from './hooks/useAIPanelResize.js'
import useWebViewZoom from './hooks/useWebViewZoom.js'
import useBadgeSync from './hooks/useBadgeSync.js'
import useTabManagement from './hooks/useTabManagement.js'
import useSearch from './hooks/useSearch.js'
import useWebAccountAvatars from './hooks/useWebAccountAvatars.js' // v1.2.275: аватар веб-аккаунта на значок полосы
import useTabContextMenu from './hooks/useTabContextMenu.js'
import useNotifyNavigation from './hooks/useNotifyNavigation.js'
import useWebViewLifecycle from './hooks/useWebViewLifecycle.js'
import useAppBootstrap from './hooks/useAppBootstrap.js'
import useConsoleErrorLogger from './hooks/useConsoleErrorLogger.js'
import useAppIPCListeners from './hooks/useAppIPCListeners.js'
// v1.0.1: счётчики для badge на иконках 📝 ⏰ в шапке.
import useAppCounters from './hooks/useAppCounters.js'
// v0.96.0 (Phase 0): cross-tab notify:clicked listener в корневом App.jsx.
// До v0.96.0 listener был внутри NativeApp.jsx, но NativeApp монтируется
// только при activeId === NATIVE_CC_ID — если юзер на webview-вкладке,
// событие терялось. См. .memory-bank/ai-agent-plan/problems.md P-01.

try { window.__ccStartupMark?.('module:App', 'module evaluated after static imports') } catch {}

const NativeApp = lazy(() => {
  try { window.__ccStartupMark?.('module:NativeApp', 'lazy import requested') } catch {}
  return import('./native/NativeApp.jsx').then((module) => {
    try { window.__ccStartupMark?.('module:NativeApp', 'lazy import resolved') } catch {}
    return module
  })
})

const AddMessengerModal = lazy(() => import('./components/AddMessengerModal.jsx'))
const AISidebar = lazy(() => import('./components/AISidebar.jsx'))
const SettingsPanel = lazy(() => import('./components/SettingsPanel.jsx'))
const TemplatesPanel = lazy(() => import('./components/TemplatesPanel.jsx'))
const AutoReplyPanel = lazy(() => import('./components/AutoReplyPanel.jsx'))
const NotifLogModal = lazy(() => import('./components/NotifLogModal.jsx'))
const ConfirmCloseModal = lazy(() => import('./components/ConfirmCloseModal.jsx'))
const LogModal = lazy(() => import('./components/LogModal.jsx'))
const ConnectionsPanel = lazy(() => import('./components/ConnectionsPanel.jsx'))
const DiagnosticsSessionHost = lazy(() => import('./components/DiagnosticsSessionHost.jsx'))
// v0.95.25: модалка «Что нового» — показывается при первом запуске после обновления.
const WhatsNewModal = lazy(() => import('./components/WhatsNewModal.jsx'))
// v1.0.1: 3 панели — Задачи / Напоминания / AI Activity (Phase 4).
const PanelModal = lazy(() => import('./components/PanelModal.jsx'))
const TasksPanel = lazy(() => import('./components/TasksPanel.jsx'))
const RemindersPanel = lazy(() => import('./components/RemindersPanel.jsx'))
const AIActivityDashboard = lazy(() => import('./components/AIActivityDashboard.jsx'))
// v1.1.0 (Phase 4.3): AI auto-reply rules.
const AIAutoReplyRules = lazy(() => import('./components/AIAutoReplyRules.jsx'))

// v0.87.0: специальный "виртуальный" мессенджер — рендерит NativeApp вместо <webview>
// v1.1.9: NATIVE_CC_ID/TAB + AISidebarFallback + NativeAppFallback вынесены
// в appFallbacks.jsx (App.jsx был на пределе exception 940).
import { NATIVE_CC_ID, NATIVE_CC_TAB, AISidebarFallback, NativeAppFallback } from './appFallbacks.jsx'

// Навигация → src/utils/navigateToChat.js | Звук → src/utils/sound.js | Вкладка → components/MessengerTab.jsx
// ─── Главный компонент ────────────────────────────────────────────────────

export default function App() {
  try {
    if (!window.__ccAppFirstRenderLogged) {
      window.__ccAppFirstRenderLogged = true
      window.__ccStartupMark?.('component:App', 'first render start')
    }
  } catch {}
  const [messengers, setMessengers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [accountInfo, setAccountInfo] = useState({})
  // v0.96.0 (Phase 0 M0.3): pendingNativeNotify — payload передаётся в NativeApp
  // через prop. NativeApp при mount читает и выполняет setActiveAccount + setActiveChat
  // + requestScrollToMessage, потом вызывает clearPendingNativeNotify().
  const [pendingNativeNotify, setPendingNativeNotify] = useState(null)
  // v0.99.0 (Phase 3): payload от кнопки «🤖 AI» в уведомлении.
  // App.jsx ловит ai:agent:invoke-from-notify, ставит в state.
  // AISidebar при наличии этого payload показывает AISidebarAgent.
  const [pendingAiInvocation, setPendingAiInvocation] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({})
  const [unreadSplit, setUnreadSplit] = useState({})       // { [id]: { personal, channels } }
  const [connectionHealth, setConnectionHealth] = useState({}) // { [id]: connection quality/status }
  const [statusBarMsg, setStatusBarMsg] = useState(null)   // последнее сообщение для статусбара
  const [messagePreview, setMessagePreview] = useState({}) // { [id]: 'текст превью' }
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingMessenger, setEditingMessenger] = useState(null) // v0.62.6: редактирование вкладки
  const [showSettings, setShowSettings] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const [settings, setSettings] = useState({ soundEnabled: true, minimizeToTray: true, theme: 'dark' })
  const [monitorPreloadUrl, setMonitorPreloadUrl] = useState(null)
  const [appReady, setAppReady] = useState(false)
  // v0.95.25: «Что нового» — модалка с changelog при первом запуске после обновления.
  const [whatsNew, setWhatsNew] = useState(null)  // {prevVersion, currentVersion} | null
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
  const [webviewLoading, setWebviewLoading] = useState({}) // { [id]: true/false }
  const [notifLogModal, setNotifLogModal] = useState(null)
  const [notifLogTab, setNotifLogTab] = useState('log')
  const [traceFilter, setTraceFilter] = useState('all')
  const [cellTooltip, setCellTooltip] = useState(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [logContent, setLogContent] = useState('')
  const [showConnectionsPanel, setShowConnectionsPanel] = useState(false)
  const [showSystemDiagnostics, setShowSystemDiagnostics] = useState(false)
  const [diagnosticsHostMounted, setDiagnosticsHostMounted] = useState(false)
  const [activeNativeAccountId, setActiveNativeAccountId] = useState(null)
  // v1.0.1: модалки Phase 4 — Задачи / Напоминания / AI Activity.
  // v1.0.3: mutually-exclusive — одна модалка за раз.
  // v1.1.0: добавлена 'autoreply' (Phase 4.3) — правила автоответа.
  const [openPanel, setOpenPanel] = useState(null)
  const showTasks = openPanel === 'tasks'
  const showReminders = openPanel === 'reminders'
  const showActivity = openPanel === 'activity'
  const showAutoReplyRules = openPanel === 'autoreply'
  const setShowTasks = useCallback((v) => setOpenPanel(v ? 'tasks' : null), [])
  const setShowReminders = useCallback((v) => setOpenPanel(v ? 'reminders' : null), [])
  const setShowActivity = useCallback((v) => setOpenPanel(v ? 'activity' : null), [])
  const setShowAutoReplyRules = useCallback((v) => setOpenPanel(v ? 'autoreply' : null), [])
  const { tasks: tasksCount, reminders: remindersCount } = useAppCounters()

  const webviewRefs = useRef({})
  const notifReadyRef = useRef({})
  const notifDedupRef = useRef(new Map())
  const pipelineTraceRef = useRef([])
  const pendingMsgRef = useRef(new Map())
  const senderCacheRef = useRef({})
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
  const windowFocusedRef = useRef(true)
  const aiWidthRef = useRef(300)
  const aiPanelRef = useRef(null)
  const zoomLevelsRef = useRef({})
  const zoomInputRef = useRef(null)
  const statusBarMsgTimer = useRef(null)
  const statsRef = useRef({ today: 0, autoToday: 0, total: 0, date: '' })
  const statsSaveTimer = useRef(null)
  const zoomSaveTimer = useRef(null)
  const bumpStatsRef = useRef(null)
  const nativeConnectionActionsRef = useRef(null)
  const connectionHealthRef = useRef({})
  const webviewLoadingRef = useRef({})
  const activeNativeAccountIdRef = useRef(null)
  const healthInFlightWebviewRef = useRef(new Set())
  const healthInFlightNativeRef = useRef(new Set())

  // Синхронизация рефов
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { messengersRef.current = messengers }, [messengers])
  useEffect(() => { zoomLevelsRef.current = zoomLevels }, [zoomLevels])
  useEffect(() => { connectionHealthRef.current = connectionHealth }, [connectionHealth])
  useEffect(() => { webviewLoadingRef.current = webviewLoading }, [webviewLoading])
  useEffect(() => { activeNativeAccountIdRef.current = activeNativeAccountId }, [activeNativeAccountId])
  // v1.2.12: при переключении на webview-вкладку — снимок состояния отрисовки в лог (диагностика чёрного экрана)
  useEffect(() => {
    if (!activeId) return undefined
    const m = messengersRef.current.find(x => x.id === activeId)
    if (!m || m.isNative) return undefined
    const t = setTimeout(() => { const wv = webviewRefs.current[activeId]; if (wv) probeBlackScreen(wv, activeId) }, 500)
    return () => clearTimeout(t)
  }, [activeId])
  useEffect(() => {
    try {
      window.__ccStartupMark?.('component:App', `mounted messengers=${messengers.length} active=${activeId || 'none'} nativeTab=${messengers.some(m => m.isNative)}`)
      window.__ccStartupSummary?.('App-mounted')
    } catch {}
  }, [])

  // v0.96.0 (Phase 0 M0.3): cross-tab listener для native_cc уведомлений.
  // Слушает в КОРНЕВОМ App.jsx — работает с ЛЮБОЙ активной вкладки
  // (включая webview). Если юзер на Telega/Макс/etc и пришло уведомление от
  // native_cc — переключаем на ЦентрЧатов + передаём payload в NativeApp.
  //
  // Для webview уведомлений → ничего не делаем (обрабатывает useNotifyNavigation).
  useEffect(() => {
    if (!window.api?.on) return undefined
    const unsub = window.api?.on('notify:clicked', (payload) => {
      if (!payload || payload.messengerId !== NATIVE_CC_ID) return
      try {
        // Переключить активную вкладку на ЦентрЧатов
        setActiveId(NATIVE_CC_ID)
        // Передать payload — NativeApp при mount/update выполнит навигацию
        setPendingNativeNotify(payload)
      } catch (e) {
        devError('[App] cross-tab notify:clicked handler error', e)
      }
    })
    return unsub
  }, [])

  const clearPendingNativeNotify = useCallback(() => setPendingNativeNotify(null), [])

  // v0.99.0 (Phase 3 M3.1): слушатель «🤖 AI» из уведомления.
  // Юзер кликнул кнопку → main отправил ai:agent:invoke-from-notify с source.
  // Открываем AI sidebar + ставим pendingAiInvocation для AISidebarAgent.
  useEffect(() => {
    if (!window.api?.on) return undefined
    const unsub = window.api?.on('ai:agent:invoke-from-notify', (payload) => {
      if (!payload || !payload.source) return
      try {
        setActiveId(NATIVE_CC_ID)  // переключаемся на ЦентрЧатов
        setShowAI(true)             // открываем AI sidebar
        setPendingAiInvocation(payload)
      } catch (e) {
        devError('[App] ai:agent:invoke-from-notify error', e)
      }
    })
    return unsub
  }, [])

  const clearPendingAiInvocation = useCallback(() => setPendingAiInvocation(null), [])

  // v1.0.1: переход к источнику (сообщению) из TasksPanel / RemindersPanel / AIActivityDashboard.
  // source = NotificationSource паспорт (messengerId/chatId/messageId/accountId/...).
  // Для native_cc — переключаем активную вкладку + кладём в pendingNativeNotify
  // (тот же путь что и для notify:clicked). Для webview мессенджеров пока silent skip.
  const handleGoToSource = useCallback((source) => {
    if (!source) return
    setOpenPanel(null)  // v1.0.3: единая точка закрытия любой панели
    if (source.messengerId === NATIVE_CC_ID) {
      setActiveId(NATIVE_CC_ID)
      setPendingNativeNotify({ ...source })
    }
  }, [])

  // bumpStats обновляется каждый рендер
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
      window.api?.invoke('settings:save', upd).catch(() => {})
    }, 2000)
  }

  // ── v0.82.6: WebView setup ─────────────────────────────────────────────
  const { setWebviewRef, handleNewMessage, traceNotif, recentNotifsRef, lastRibbonTsRef, lastSoundTsRef, notifSenderTsRef, notifMidTsRef, notifCountRef, pendingMarkReadsRef } = createWebviewSetup({
    webviewRefs, notifReadyRef, notifDedupRef, pipelineTraceRef, pendingMsgRef, senderCacheRef,
    retryTimers, previewTimers, statusBarMsgTimer, bumpStatsRef: { current: null },
    settingsRef, activeIdRef, messengersRef, windowFocusedRef, zoomLevelsRef,
    setAccountInfo, setActiveId, setChatHistory, setLastMessage, setMessagePreview,
    setConnectionHealth, setNewMessageIds, setStatusBarMsg, setUnreadCounts, setUnreadSplit,
    setWebviewLoading, setZoomLevels, monitorPreloadUrl,
  })

  // v1.2.275: аватарки залогиненных веб-аккаунтов (для значков боковой полосы). Лёгкий сбор
  // в отдельном хуке — webviewSetup/App у потолка размера, поэтому не в них. Нет фото → значок логотипом.
  const webAccountAvatars = useWebAccountAvatars(webviewRefs, messengersRef)

  // v1.2.22: Вариант A — флаг useWebContentsView открывает Макс в ОТДЕЛЬНОМ окне Electron
  // (проверка ServiceWorker-уведомлений). Главное окно не трогаем (Макс остаётся в <webview>).
  // Отдельное окно = обычный WebContents, где SW работает; и краша из Issue #44934 там нет.
  useEffect(() => {
    const list = messengersRef.current || []
    const max = list.find(m => /web\.max\.ru/.test(m.url || ''))
    if (settings.useWebContentsView && max) {
      try { window.api?.invoke('max-test:open', { url: max.url, partition: max.partition }) } catch (_) {}
    } else {
      try { window.api?.invoke('max-test:close') } catch (_) {}
    }
  }, [settings.useWebContentsView])

  // ── Hooks ──────────────────────────────────────────────────────────────

  const { handleSearch, toggleSearch, searchText, searchVisible } = useSearch({
    webviewRefs, activeIdRef, searchInputRef,
  })

  const { changeZoom, applyZoom, animateZoom, saveZoomLevels } = useWebViewZoom({
    webviewRefs, zoomLevelsRef, zoomSaveTimer, settingsRef,
    activeId, zoomLevels, setZoomLevels,
  })

  const { handleTabClick, handleDragStart, handleDragOver, handleDrop, handleDragEnd, dragOverId } = useTabManagement({
    webviewRefs, activeIdRef, dragStartId, notifCountRef, windowFocusedRef,
    setActiveId, setMessengers, setNewMessageIds, setUnreadCounts,
    searchText, searchVisible,
  })

  const removeMessenger = useCallback((id) => {
    // v0.89.44 (Совет 3): авто-cleanup partition при удалении мессенджера.
    // full:true — чистим ВСЁ (cookies, localStorage, IndexedDB) = эффект logout.
    // Иначе осколки сессии остаются на диске даже если мессенджер удалён из UI.
    // v0.91.0: wcv:cleanup-partition убран (WCV миграция откачена)
    setMessengers(prev => {
      const next = prev.filter(m => m.id !== id)
      setActiveId(curr => curr === id ? (next[0]?.id || null) : curr)
      return next
    })
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

  const askRemoveMessenger = useCallback((id) => {
    const m = messengersRef.current.find(x => x.id === id)
    if (!m) return
    setConfirmClose({ id: m.id, name: m.name, color: m.color, emoji: m.emoji })
  }, [])

  const { handleTabContextAction, handleTabContextAction_diag, contextMenuTab, setContextMenuTab, togglePinTab } = useTabContextMenu({
    webviewRefs, messengersRef, settingsRef, pipelineTraceRef,
    messengers, settings,
    setConnectionHealth, setNotifLogModal, setNotifLogTab, setEditingMessenger, setSettings,
    askRemoveMessenger, traceNotif, handleNewMessage,
  })

  const { startResize, onPointerMove, onPointerUp } = useAIPanelResize({
    isResizingRef, resizeStartRef, aiWidthRef, aiPanelRef, settingsRef,
    setIsResizing, setAiWidth, setSettings,
  })

  const { totalUnread, totalPersonalWithFallback, totalChannels } = useBadgeSync({
    unreadCounts, unreadSplit, messengers, settingsRef, settings,
  })

  useKeyboardShortcuts({
    messengersRef, activeIdRef, settingsRef, zoomLevelsRef,
    setShowAddModal, setShowSettings, setActiveId, toggleSearch,
    askRemoveMessenger, saveZoomLevels, animateZoom, setZoomLevels,
    searchInputRef,
  })

  // ── v0.87.82: Renderer логирование + show-log-modal IPC → useConsoleErrorLogger
  useConsoleErrorLogger({ setLogContent, setShowLogModal })

  // ── Применение темы ────────────────────────────────────────────────────
  useEffect(() => {
    const theme = settings.theme || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    window.api?.invoke('window:set-titlebar-theme', theme).catch(() => {})
  }, [settings.theme])

  // ── Загрузка при старте → useAppBootstrap (v0.87.82)
  useAppBootstrap({
    NATIVE_CC_TAB, NATIVE_CC_ID,
    setMessengers, setActiveId, setSettings, setAiWidth, setZoomLevels, setStats,
    setMonitorPreloadUrl, setAppReady,
    aiWidthRef, zoomLevelsRef, statsRef,
  })

  // ── Автосохранение мессенджеров ────────────────────────────────────────
  useEffect(() => {
    if (messengers.length === 0) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api?.invoke('messengers:save', messengers).catch(() => {})
    }, 600)
  }, [messengers])

  // ── IPC listeners + auto-reset notifCount + notifLog polling → useAppIPCListeners (v0.87.82)
  // (window-state, messenger:badge, notifLogModal polling, notifCountRef auto-reset)
  useAppIPCListeners({
    windowFocusedRef, settingsRef, messengersRef, lastSoundTsRef, notifCountRef,
    webviewRefs, pipelineTraceRef,
    activeId, notifLogModal,
    setUnreadCounts, setNotifLogModal,
    traceNotif,
  })

  useNotifyNavigation({
    webviewRefs, activeIdRef, windowFocusedRef, pendingMarkReadsRef,
    settingsRef, messengersRef, lastSoundTsRef,
    setActiveId, setStatusBarMsg, setUnreadCounts,
    buildChatNavigateScript, playNotificationSound,
    traceNotif, devLog, devError,
    notifCountRef, lastRibbonTsRef, notifSenderTsRef,
  })

  // v0.87.82: notifLog polling + notifCount auto-reset → useAppIPCListeners (выше)

  // ── Cleanup таймеров на unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(retryTimers.current).forEach(t => clearTimeout(t))
      clearTimeout(saveTimer.current)
      clearTimeout(statsSaveTimer.current)
      clearTimeout(zoomSaveTimer.current)
    }
  }, [])

  // ── v0.86.5-6: WebView lifecycle (вынесено в useWebViewLifecycle.js для лимита 600 строк)
  // Ловушка 64: forced resize + warm-up + health-check
  useWebViewLifecycle({ activeId, messengers, appReady, webviewRefs, setActiveId })

  // ── v0.95.25: Проверка «Что нового» при первом запуске после обновления версии.
  // Сравниваем settings.lastSeenVersion с реальной версией app:info → показываем модалку.
  // Запускается ОДИН раз после appReady (settings уже загружены).
  useEffect(() => {
    if (!appReady) return
    let cancelled = false
    ;(async () => {
      try {
        const info = await window.api?.invoke?.('app:info')
        const currentVersion = info?.data?.version || info?.version || null
        if (!currentVersion || cancelled) return
        const lastSeen = settings.lastSeenVersion || null
        if (lastSeen === currentVersion) return  // юзер уже видел changelog этой версии
        setWhatsNew({ prevVersion: lastSeen, currentVersion })
      } catch (_) { /* silent — модалка не блокирует приложение */ }
    })()
    return () => { cancelled = true }
  }, [appReady])

  const handleWhatsNewClose = useCallback(() => {
    if (!whatsNew) return
    const next = { ...settings, lastSeenVersion: whatsNew.currentVersion }
    setSettings(next)
    try { window.api?.invoke('settings:save', next) } catch (_) {}
    setWhatsNew(null)
  }, [whatsNew, settings])

  // ── Добавление / сохранение мессенджера ────────────────────────────────
  const addMessenger = useCallback((m) => {
    setMessengers(prev => [...prev, m])
    setActiveId(m.id)
    setShowAddModal(false)
  }, [])

  const saveMessenger = useCallback((updated) => {
    setMessengers(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
    setEditingMessenger(null)
  }, [])

  const handleSettingsChange = useCallback((newSettings) => {
    setSettings(newSettings)
    window.api?.invoke('settings:save', newSettings).catch(() => {})
  }, [])

  const handleNativeConnectionSnapshot = useCallback((items) => {
    setConnectionHealth(prev => {
      const next = {}
      for (const [id, value] of Object.entries(prev)) {
        if (value?.type !== 'native') next[id] = value
      }
      for (const item of items || []) {
        if (item?.id) next[item.id] = item
      }
      return next
    })
  }, [])

  const openConnectionsPanel = useCallback(() => setShowConnectionsPanel(true), [])

  const runWebviewHealthProbe = useCallback((check) => {
    const id = check?.id
    if (!id || healthInFlightWebviewRef.current.has(id)) return Promise.resolve(null)
    const webview = check.webview || webviewRefs.current[id]
    if (!webview) return Promise.resolve(null)
    healthInFlightWebviewRef.current.add(id)
    return probeWebviewHealth({
      webview,
      id,
      label: check.label,
      url: check.url,
      setConnectionHealth,
      details: check.details,
    }).finally(() => {
      healthInFlightWebviewRef.current.delete(id)
    })
  }, [])

  const runNativeHealthCheck = useCallback((id) => {
    if (!id || healthInFlightNativeRef.current.has(id)) return Promise.resolve(null)
    healthInFlightNativeRef.current.add(id)
    return Promise.resolve(nativeConnectionActionsRef.current?.refreshOne?.(id))
      .finally(() => {
        healthInFlightNativeRef.current.delete(id)
      })
  }, [])

  const refreshAllConnections = useCallback(() => {
    const webviewChecks = []
    setConnectionHealth(prev => {
      const next = { ...prev }
      for (const m of messengersRef.current) {
        if (m.isNative) continue
        const wv = webviewRefs.current[m.id]
        if (wv) {
          next[m.id] = markHealthPending(next[m.id], {
            id: m.id,
            type: 'webview',
            label: m.name,
            url: m.url,
            details: 'Проверка всех подключений',
          })
          webviewChecks.push({ webview: wv, id: m.id, label: m.name, url: m.url })
        }
      }
      return next
    })
    setTimeout(() => {
      for (const check of webviewChecks) {
        runWebviewHealthProbe({
          ...check,
          details: 'Ручная проверка всех подключений',
        })
      }
    }, 0)
    nativeConnectionActionsRef.current?.refreshAll?.()
  }, [runWebviewHealthProbe])

  const refreshProblematicConnections = useCallback((target) => {
    const nativeProblemIds = []
    const webviewChecks = []
    if (runSelectedDiagnosticsDeepCheck({ target, webviewRefs, messengersRef, runWebviewHealthProbe, traceNotif })) return
    setConnectionHealth(prev => {
      const next = { ...prev }
      for (const [id, item] of Object.entries(prev)) {
        if (!['slow', 'error'].includes(item?.state)) continue
        if (item.type === 'native') {
          nativeProblemIds.push(id)
          continue
        }
        if (item.type !== 'webview') continue
        const wv = webviewRefs.current[id]
        const m = messengersRef.current.find(x => x.id === id)
        if (wv) {
          next[id] = markHealthPending(item, {
            id,
            type: 'webview',
            label: m?.name || item.label || id,
            url: m?.url || item.url || '',
            details: 'Проверка проблемного подключения',
          })
          webviewChecks.push({ webview: wv, id, label: m?.name || item.label || id, url: m?.url || item.url || '' })
        }
      }
      return next
    })
    setTimeout(() => {
      for (const check of webviewChecks) {
        runWebviewHealthProbe({
          ...check,
          details: 'Ручная проверка проблемного подключения',
        })
      }
    }, 0)
    if (nativeProblemIds.length) {
      for (const id of nativeProblemIds) runNativeHealthCheck(id)
    }
  }, [runNativeHealthCheck, runWebviewHealthProbe, traceNotif])

  useEffect(() => {
    const runSchedulerTick = () => {
      const jobs = selectConnectionHealthJobs({
        connectionHealth: connectionHealthRef.current,
        messengers: messengersRef.current,
        activeId: activeIdRef.current,
        activeNativeAccountId: activeIdRef.current === NATIVE_CC_ID ? activeNativeAccountIdRef.current : null,
        windowFocused: windowFocusedRef.current,
        webviewLoading: webviewLoadingRef.current,
        inFlightWebview: healthInFlightWebviewRef.current,
        inFlightNative: healthInFlightNativeRef.current,
      })

      for (const job of jobs.webview) {
        const webview = webviewRefs.current[job.id]
        if (!webview) continue
        runWebviewHealthProbe({
          webview,
          ...job,
          details: 'Автоматическая проверка подключения',
        })
      }

      for (const job of jobs.native) {
        runNativeHealthCheck(job.id)
      }
    }

    const timer = setInterval(runSchedulerTick, HEALTH_SCHEDULER_TICK_MS)
    const firstTick = setTimeout(runSchedulerTick, 1500)
    return () => {
      clearInterval(timer)
      clearTimeout(firstTick)
    }
  }, [runNativeHealthCheck, runWebviewHealthProbe])

  const openSystemLog = useCallback(() => {
    setShowLogModal(true)
    window.api?.invoke('app:read-log').then(c => setLogContent(c || 'Лог пуст')).catch(() => setLogContent('Не удалось прочитать лог'))
  }, [])

  const openSystemDiagnostics = useCallback(() => {
    setDiagnosticsHostMounted(true)
    setShowSystemDiagnostics(true)
  }, [])

  // ── Computed values ────────────────────────────────────────────────────
  const pinnedTabs = settings.pinnedTabs || {}
  const theme = settings.theme || 'dark'
  const currentZoom = zoomLevels[activeId] || 100

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--cc-bg)' }} onClick={() => contextMenuTab && setContextMenuTab(null)}>

      <TabBar
        messengers={messengers} activeId={activeId} accountInfo={accountInfo}
        settings={settings} unreadCounts={unreadCounts} unreadSplit={unreadSplit}
        messagePreview={messagePreview} zoomLevels={zoomLevels} connectionHealth={connectionHealth}
        webviewLoading={webviewLoading} newMessageIds={newMessageIds} dragOverId={dragOverId}
        showAI={showAI} showTemplates={showTemplates}
        showAutoReply={showAutoReply} searchVisible={searchVisible} searchText={searchText}
        theme={theme} currentZoom={currentZoom}
        handleTabClick={handleTabClick} handleDragStart={handleDragStart}
        handleDragOver={handleDragOver} handleDrop={handleDrop} handleDragEnd={handleDragEnd}
        askRemoveMessenger={askRemoveMessenger} setShowAddModal={setShowAddModal}
        setContextMenuTab={setContextMenuTab} toggleSearch={toggleSearch}
        setShowAI={setShowAI} setShowTemplates={setShowTemplates} setShowAutoReply={setShowAutoReply}
        setShowSettings={setShowSettings} handleSettingsChange={handleSettingsChange}
        handleSearch={handleSearch} searchInputRef={searchInputRef}
        webviewRefs={webviewRefs} activeIdRef={activeIdRef}
        changeZoom={changeZoom} zoomEditing={zoomEditing} setZoomEditing={setZoomEditing}
        zoomInputValue={zoomInputValue} setZoomInputValue={setZoomInputValue} zoomInputRef={zoomInputRef}
        statusBarMsg={statusBarMsg} stats={stats} totalUnread={totalUnread}
        onOpenConnections={openConnectionsPanel}
        showTasks={showTasks} setShowTasks={setShowTasks}
        showReminders={showReminders} setShowReminders={setShowReminders}
        showActivity={showActivity} setShowActivity={setShowActivity}
        showAutoReplyRules={showAutoReplyRules} setShowAutoReplyRules={setShowAutoReplyRules}
        tasksCount={tasksCount} remindersCount={remindersCount}
      />

      {/* v1.2.271: меню правого клика — на уровне App (вынесено из TabBar). Триггер (правый клик)
          у вкладок и у значков полосы; после удаления вкладок меню полосы продолжит работать. */}
      <TabContextMenu contextMenuTab={contextMenuTab} setContextMenuTab={setContextMenuTab}
        pinnedTabs={settings.pinnedTabs || {}} messengers={messengers} onAction={handleTabContextAction} />

      {/* ── Основной layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* v1.2.262: слот боковой полосы. NativeApp порталит сюда рейл (аккаунты+веб+разделитель)
            → полоса ВСЕГДА видна слева, даже когда активен веб-мессенджер (веб открывается ПРАВЕЕ).
            v1.2.263: ширину задаёт сама полоса (портал вставляется до отрисовки через useLayoutEffect),
            поэтому фиксированный minWidth убран — иначе полоса не сужалась при перетаскивании. */}
        <div id="app-native-rail" className="flex shrink-0" />

        {/* ── Область WebView ── */}
        <div className="flex-1 relative overflow-hidden" style={{ backgroundColor: 'var(--cc-bg)', cursor: isResizing ? 'col-resize' : undefined }}>
          {/* v1.2.262: полоска «← Общий чат» над активным веб-мессенджером → возврат к API-чатам
              (native инбокс). Показывается только когда открыт веб (не нативный/не пусто). */}
          {(() => {
            const am = messengers.find(m => m.id === activeId)
            if (!am || am.isNative || am.id === NATIVE_CC_ID) return null
            return (
              <button
                type="button"
                onClick={() => {
                  try { window.api?.send?.('app:log', { level: 'INFO', message: `[rail] «← Общий чат»: возврат к API-чатам с веба ${activeId}` }) } catch (_) {}
                  handleTabClick(NATIVE_CC_ID)
                }}
                title="Вернуться к общему чату (API)"
                /* v1.2.293: полупрозрачная «таблетка»-стекло (backdrop-blur) вместо полосы; плавает, светлеет при наведении, «прилипает» само (оверлей поверх страницы мессенджера). */
                className="group absolute top-1 left-2 z-[3] inline-flex items-center gap-1.5 rounded-full px-3 py-1 cursor-pointer border transition-colors backdrop-blur-md bg-[rgba(16,20,28,0.5)] hover:bg-[rgba(44,56,74,0.62)]"
                style={{ borderColor: 'rgba(255,255,255,0.12)', color: '#e2e8f0', fontSize: 12.5, maxWidth: 'calc(100% - 16px)' }}
              >
                <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5" style={{ fontSize: 14, lineHeight: 1 }}>←</span>
                <span style={{ fontWeight: 600, lineHeight: 1 }}>Общий чат</span>
                <span style={{ opacity: 0.5, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {am.name}</span>
              </button>
            )
          })()}
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
                  // v1.2.296: убран верхний отступ (30→0) — таблетка «← Общий чат» плавает ПОВЕРХ страницы мессенджера, без чёрной полосы, что ела место.
                  top: 0,
                  // НЕ используем visibility:hidden — Chromium останавливает загрузку hidden WebView
                  // Чёрный экран решён через disable-gpu-compositing в main.js
                }}
              >
                {m.isNative || m.id === NATIVE_CC_ID ? (
                  <Suspense fallback={<NativeAppFallback />}>
                    <NativeApp
                      onOpenConnections={openConnectionsPanel}
                      onConnectionSnapshot={handleNativeConnectionSnapshot}
                      onConnectionActionsReady={(actions) => { nativeConnectionActionsRef.current = actions }}
                      onActiveNativeAccountChange={setActiveNativeAccountId}
                      webSources={messengers.filter(m => !m.isNative && m.id !== NATIVE_CC_ID)}
                      activeMessengerId={activeId}
                      onSelectSource={handleTabClick}
                      onActivateNative={() => {
                        // v1.2.263: тык в API-аккаунт/«Все» при открытом вебе → показываем API-чаты.
                        if (activeId === NATIVE_CC_ID) return
                        try { window.api?.send?.('app:log', { level: 'INFO', message: `[rail] возврат к API-чатам (аккаунт/Все) с веба ${activeId}` }) } catch (_) {}
                        handleTabClick(NATIVE_CC_ID)
                      }}
                      webUnread={unreadCounts} webHealth={connectionHealth} webNew={newMessageIds}
                      webAccountInfo={accountInfo} webAccountAvatars={webAccountAvatars}
                      webLoading={webviewLoading}
                      onWebContextMenu={(id, x, y) => setContextMenuTab({ id, x, y })}
                      onWebDragStart={handleDragStart} onWebDragOver={handleDragOver}
                      onWebDrop={handleDrop} onWebDragEnd={handleDragEnd} webDragOverId={dragOverId}
                      onAddWeb={(entry) => {
                        // v1.2.264: из окна «Добавить». entry = пресет DEFAULT_MESSENGERS → новая вкладка
                        // (свежая partition/сессия, как в AddMessengerModal); null → ручной ввод URL.
                        if (!entry) { setShowAddModal(true); return }
                        const ts = Date.now()
                        addMessenger({ id: `custom_${ts}`, name: entry.name, url: entry.url, color: entry.color,
                          partition: `persist:custom_${ts}`, emoji: entry.emoji, isDefault: false, accountScript: entry.accountScript })
                        try { window.api?.send?.('app:log', { level: 'INFO', message: `[add-source] добавлен веб-мессенджер: ${entry.name}` }) } catch (_) {}
                      }}
                      pendingNotify={pendingNativeNotify}
                      clearPendingNotify={clearPendingNativeNotify}
                    />
                  </Suspense>
                ) : (
                  /* v1.2.22: Вариант A — Макс ВСЕГДА через <webview> в главном окне (как раньше).
                     Тумблер useWebContentsView теперь открывает Макс в ОТДЕЛЬНОМ окне (main: max-test:*),
                     а не внутри главного — child WebContentsView крашит Electron на Win11 (Issue #44934). */
                  <webview
                    ref={el => setWebviewRef(el, m.id)}
                    src={m.url}
                    partition={m.partition}
                    preload={monitorPreloadUrl || undefined}
                    style={{ width: '100%', height: '100%' }}
                    allowpopups="true"
                    webpreferences="backgroundThrottling=no"
                  />
                )}
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-2xl animate-pulse" style={{ color: 'var(--cc-text-dimmer)' }}>⏳</div>
            </div>
          )}

          {/* v0.89.38: глобальный fixed overlay вынесен на корень App (см. ниже).
              Локальный absolute inset-0 z-50 не покрывал AI sidebar webview —
              события мыши уходили в webview (отдельный процесс по Electron docs)
              → mouseup не доходил до window → разделитель залипал. */}
        </div>

        {/* ── Resizer ── */}
        {/* v0.89.38: pointer events (W3C 2018+) вместо устаревших mouse events.
            setPointerCapture гарантирует доставку до pointerup; touchAction:'none'
            предотвращает дефолтный pan/zoom на touch-устройствах. */}
        {showAI && (
          <div
            onPointerDown={startResize}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="shrink-0 cursor-col-resize transition-colors duration-150"
            style={{ width: '6px', backgroundColor: isResizing ? '#2AABEE88' : 'var(--cc-border)', touchAction: 'none' }}
            onMouseEnter={e => { if (!isResizing) e.currentTarget.style.backgroundColor = '#2AABEE66' }}
            onMouseLeave={e => { if (!isResizing) e.currentTarget.style.backgroundColor = 'var(--cc-border)' }}
            title="Потяни для изменения ширины панели ИИ"
          />
        )}

        {/* ── ИИ-боковая панель ── */}
        <ErrorBoundary name="AISidebar">
          <Suspense fallback={<AISidebarFallback visible={showAI} width={aiWidth} panelRef={aiPanelRef} />}>
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
              pendingAiInvocation={pendingAiInvocation}
              clearPendingAiInvocation={clearPendingAiInvocation}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* ── Модальные окна ── */}
      <Suspense fallback={null}>
        {showConnectionsPanel && <ConnectionsPanel
          connectionHealth={connectionHealth}
          messengers={messengers}
          activeId={activeId}
          activeNativeAccountId={activeNativeAccountId}
          webviewLoading={webviewLoading}
          onClose={() => setShowConnectionsPanel(false)}
          onRefreshAll={refreshAllConnections}
          onRefreshProblematic={refreshProblematicConnections}
          onOpenLog={openSystemLog}
        />}

        {showAddModal && (
          <AddMessengerModal onAdd={addMessenger} onClose={() => setShowAddModal(false)} />
        )}

        {editingMessenger && (
          <AddMessengerModal editing={editingMessenger} onSave={saveMessenger} onAdd={() => {}} onClose={() => setEditingMessenger(null)} />
        )}

        {showSettings && (
          <ErrorBoundary name="Settings"><SettingsPanel
            messengers={messengers} settings={settings}
            onMessengersChange={setMessengers} onSettingsChange={handleSettingsChange}
            onClose={() => setShowSettings(false)}
            onOpenSystemDiagnostics={openSystemDiagnostics}
          /></ErrorBoundary>
        )}

        {showTemplates && (
          <ErrorBoundary name="Templates"><TemplatesPanel
            settings={settings} onSettingsChange={handleSettingsChange} onClose={() => setShowTemplates(false)}
          /></ErrorBoundary>
        )}

        {showAutoReply && (
          <ErrorBoundary name="AutoReply"><AutoReplyPanel
            settings={settings} onSettingsChange={handleSettingsChange} onClose={() => setShowAutoReply(false)}
          /></ErrorBoundary>
        )}
      </Suspense>

      <Suspense fallback={null}>
        {confirmClose && <ConfirmCloseModal
          confirmClose={confirmClose}
          onCancel={() => setConfirmClose(null)}
          onConfirm={() => removeMessenger(confirmClose.id)}
        />}
      </Suspense>

      {/* ── Модальное окно: Лог уведомлений ── */}
      <Suspense fallback={null}>
        {notifLogModal && <ErrorBoundary name="NotifLog"><NotifLogModal ctx={{
          notifLogModal, setNotifLogModal, notifLogTab, setNotifLogTab,
          traceFilter, setTraceFilter, setCellTooltip,
          settings, setSettings, webviewRefs,
          handleTabContextAction_diag,
          traceNotif, handleNewMessage, pipelineTraceRef
        }} /></ErrorBoundary>}
      </Suspense>
      <Suspense fallback={null}>
        {diagnosticsHostMounted && <ErrorBoundary name="SystemDiagnostics"><DiagnosticsSessionHost
          open={showSystemDiagnostics}
          onOpen={openSystemDiagnostics}
          runtimeContext={{
            messengers,
            activeId,
            activeNativeAccountId,
            connectionHealth,
            webviewLoading,
            unreadCounts,
            unreadSplit,
            pipelineTrace: pipelineTraceRef.current,
            appReady,
            showAI,
            tasksCount,
            remindersCount,
          }}
          onRunDeepCheck={refreshProblematicConnections}
          onClose={() => setShowSystemDiagnostics(false)}
        /></ErrorBoundary>}
      </Suspense>


      {/* ── v0.84.2: Модальное окно системного лога ── */}
      <Suspense fallback={null}>
        {showLogModal && <LogModal
          content={logContent}
          onClose={() => setShowLogModal(false)}
          onRefresh={() => window.api?.invoke('app:read-log').then(c => setLogContent(c || 'Лог пуст'))}
        />}
      </Suspense>

      {/* v0.95.25: «Что нового» — модалка с changelog при первом запуске после
          обновления версии. Lazy-loaded; не блокирует appReady. */}
      <Suspense fallback={null}>
        {whatsNew && <WhatsNewModal
          prevVersion={whatsNew.prevVersion}
          currentVersion={whatsNew.currentVersion}
          onClose={handleWhatsNewClose}
        />}
      </Suspense>

      {/* v1.0.1: Phase 4 модалки — Задачи / Напоминания / AI Activity.
          Открываются по клику на иконки 📝 ⏰ 📊 в шапке. PanelModal — overlay + ✕.
          onGoToSource (для Tasks/Reminders) переключает на ЦентрЧатов + scroll to message. */}
      <Suspense fallback={null}>
        {showTasks && (
          <PanelModal title="📝 Задачи" onClose={() => setShowTasks(false)} width={760}>
            <TasksPanel onGoToSource={handleGoToSource} />
          </PanelModal>
        )}
        {showReminders && (
          <PanelModal title="⏰ Напоминания" onClose={() => setShowReminders(false)} width={680}>
            <RemindersPanel onGoToSource={handleGoToSource} />
          </PanelModal>
        )}
        {showActivity && (
          <PanelModal title="📊 AI Activity" onClose={() => setShowActivity(false)} width={900}>
            <AIActivityDashboard />
          </PanelModal>
        )}
        {showAutoReplyRules && (
          <PanelModal title="🤖 Правила автоответа" onClose={() => setShowAutoReplyRules(false)} width={760}>
            <AIAutoReplyRules />
          </PanelModal>
        )}
      </Suspense>

      {/* ── Тултип для ячеек таблицы лога ── */}
      {cellTooltip && (
        <div className="cc-notif-tooltip" style={{ left: Math.min(cellTooltip.x + 8, window.innerWidth - 460), top: cellTooltip.y + 16 }}>
          {cellTooltip.text}
        </div>
      )}

      {/* v0.89.38: глобальный fixed overlay при resize разделителя AI sidebar.
          По Electron docs https://www.electronjs.org/docs/latest/api/webview-tag
          события мыши не пересекают границу <webview> — это отдельный процесс.
          Без overlay поверх ВСЕХ webview (мессенджеры + AI) mouseup мог
          застрять в webview, isResizingRef.current оставался true → разделитель
          залипал. Глобальный fixed overlay с z-index 999999 покрывает оба
          webview гарантированно. */}
      {isResizing && (
        <div
          data-cc-resize-overlay="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            cursor: 'col-resize', userSelect: 'none',
          }}
        />
      )}

      {/* v0.89.49 (Совет toast): плашка в углу при uncaught error в renderer.
          Юзер сразу видит «что-то сломалось», не нужно открывать лог. */}
      <UncaughtErrorToast />
    </div>
  )
}
