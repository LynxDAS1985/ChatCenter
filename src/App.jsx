// v0.39.0 — Кастомные уведомления Messenger Ribbon
import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_MESSENGERS } from './constants.js'
import AddMessengerModal from './components/AddMessengerModal.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import AISidebar from './components/AISidebar.jsx'
import TemplatesPanel from './components/TemplatesPanel.jsx'
import AutoReplyPanel from './components/AutoReplyPanel.jsx'
import { devLog, devError } from './utils/devLog.js'
import { playNotificationSound } from './utils/sound.js'
import { buildChatNavigateScript } from './utils/navigateToChat.js'
import { createWebviewSetup } from './utils/webviewSetup.js'
import TabBar from './components/TabBar.jsx'
import NotifLogModal from './components/NotifLogModal.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import LogModal from './components/LogModal.jsx'

// Hooks
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts.js'
import useAIPanelResize from './hooks/useAIPanelResize.js'
import useWebViewZoom from './hooks/useWebViewZoom.js'
import useBadgeSync from './hooks/useBadgeSync.js'
import useTabManagement from './hooks/useTabManagement.js'
import useSearch from './hooks/useSearch.js'
import useTabContextMenu from './hooks/useTabContextMenu.js'

// Навигация → src/utils/navigateToChat.js | Звук → src/utils/sound.js | Вкладка → components/MessengerTab.jsx

// ─── Главный компонент ────────────────────────────────────────────────────

export default function App() {
  const [messengers, setMessengers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [accountInfo, setAccountInfo] = useState({})
  const [unreadCounts, setUnreadCounts] = useState({})
  const [unreadSplit, setUnreadSplit] = useState({})       // { [id]: { personal, channels } }
  const [monitorStatus, setMonitorStatus] = useState({})   // { [id]: 'loading'|'active'|'error' }
  const [statusBarMsg, setStatusBarMsg] = useState(null)   // последнее сообщение для статусбара
  const [messagePreview, setMessagePreview] = useState({}) // { [id]: 'текст превью' }
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingMessenger, setEditingMessenger] = useState(null) // v0.62.6: редактирование вкладки
  const [showSettings, setShowSettings] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const [settings, setSettings] = useState({ soundEnabled: true, minimizeToTray: true, theme: 'dark' })
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
  const [webviewLoading, setWebviewLoading] = useState({}) // { [id]: true/false }
  const [notifLogModal, setNotifLogModal] = useState(null)
  const [notifLogTab, setNotifLogTab] = useState('log')
  const [traceFilter, setTraceFilter] = useState('all')
  const [cellTooltip, setCellTooltip] = useState(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [logContent, setLogContent] = useState('')

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

  // Синхронизация рефов
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { messengersRef.current = messengers }, [messengers])
  useEffect(() => { zoomLevelsRef.current = zoomLevels }, [zoomLevels])

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
    setMonitorStatus, setNewMessageIds, setStatusBarMsg, setUnreadCounts, setUnreadSplit,
    setWebviewLoading, setZoomLevels, monitorPreloadUrl,
  })

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
    setMonitorStatus, setNotifLogModal, setNotifLogTab, setEditingMessenger, setSettings,
    askRemoveMessenger, traceNotif, handleNewMessage,
  })

  const { startResize } = useAIPanelResize({
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

  // ── v0.84.2: Renderer логирование + show-log-modal IPC ───────────────
  useEffect(() => {
    const origError = console.error.bind(console)
    const patchedError = (...args) => {
      origError(...args)
      try { window.api?.send('app:log', { level: 'ERROR', message: args.map(a => typeof a === 'string' ? a : String(a)).join(' ') }) } catch {}
    }
    console.error = patchedError
    let unsub
    const setup = () => {
      if (!window.api?.on) return
      unsub = window.api?.on('show-log-modal', () => {
        window.api?.invoke('app:read-log').then(content => {
          setLogContent(content || 'Лог пуст')
          setShowLogModal(true)
        })
      })
    }
    if (window.api?.on) setup()
    else setTimeout(setup, 1000)
    return () => { if (unsub) unsub(); console.error = origError }
  }, [])

  // ── Применение темы ────────────────────────────────────────────────────
  useEffect(() => {
    const theme = settings.theme || 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    window.api?.invoke('window:set-titlebar-theme', theme).catch(() => {})
  }, [settings.theme])

  // ── Загрузка при старте ────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      window.api?.invoke('messengers:load').then(list => {
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
      window.api?.invoke('settings:get').then(s => {
        setSettings(s)
        if (s.aiSidebarWidth) {
          const w = Math.max(240, Math.min(600, s.aiSidebarWidth))
          setAiWidth(w); aiWidthRef.current = w
        }
        if (s.zoomLevels && typeof s.zoomLevels === 'object') {
          setZoomLevels(s.zoomLevels)
          zoomLevelsRef.current = s.zoomLevels
        }
        const todayDate = new Date().toISOString().slice(0, 10)
        const savedStats = s.stats || {}
        const loadedStats = savedStats.date !== todayDate
          ? { today: 0, autoToday: 0, total: savedStats.total || 0, date: todayDate }
          : { today: savedStats.today || 0, autoToday: savedStats.autoToday || 0, total: savedStats.total || 0, date: savedStats.date }
        setStats(loadedStats)
        statsRef.current = loadedStats
      }).catch(() => {}),
      window.api?.invoke('app:get-paths').then(({ monitorPreload }) => {
        if (monitorPreload) {
          const url = 'file:///' + monitorPreload.replace(/\\/g, '/').replace(/^\//, '')
          setMonitorPreloadUrl(url)
        }
      }).catch(() => {})
    ]).finally(() => setAppReady(true))
  }, [])

  // ── Автосохранение мессенджеров ────────────────────────────────────────
  useEffect(() => {
    if (messengers.length === 0) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api?.invoke('messengers:save', messengers).catch(() => {})
    }, 600)
  }, [messengers])

  // ── IPC window-state ───────────────────────────────────────────────────
  useEffect(() => {
    return window.api?.on('window-state', (state) => {
      windowFocusedRef.current = state.focused
    })
  }, [])

  // ── Бейдж-события от ChatMonitor ───────────────────────────────────────
  useEffect(() => {
    return window.api?.on('messenger:badge', ({ id, count }) => {
      setUnreadCounts(prev => {
        const prev_count = prev[id] || 0
        if (count > prev_count && settingsRef.current.soundEnabled !== false) {
          const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[id]
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

  // ── Клик по кастомному уведомлению (Messenger Ribbon) ──────────────────
  useEffect(() => {
    return window.api?.on('notify:clicked', ({ messengerId, senderName, chatTag }) => {
      devLog('[GoChat] notify:clicked', { messengerId, senderName, chatTag })
      if (!messengerId) return
      setActiveId(messengerId)
      if (senderName || chatTag) {
        const tryNavigate = (attempt) => {
          if (activeIdRef.current !== messengerId) return
          const el = webviewRefs.current[messengerId]
          if (!el) return
          const url = el.getURL?.() || ''
          const script = buildChatNavigateScript(url, senderName, chatTag)
          if (!script) return
          el.executeJavaScript(script).then(result => {
            const ok = result === true || (result && result.ok)
            const method = result?.method || ''
            devLog(`[GoChat] attempt=${attempt} ok=${ok} method=${method}`, result)
            if (ok) {
              setStatusBarMsg(`>> "${senderName}" (${method})`)
            } else if (attempt >= 2 || activeIdRef.current !== messengerId) {
              setStatusBarMsg(`>> "${senderName}" - не найден в sidebar`)
            } else {
              setTimeout(() => tryNavigate(attempt + 1), 1500)
            }
          }).catch(err => { devError('[GoChat] executeJS error:', err.message) })
        }
        setTimeout(() => tryNavigate(0), 800)
      }
    })
  }, [])

  // ── "Прочитано" из ribbon ──────────────────────────────────────────────
  const executeMarkRead = useCallback(({ messengerId, senderName, chatTag }) => {
    const el = webviewRefs.current[messengerId]
    if (!el) { traceNotif('mark-read', 'warn', messengerId, senderName || '', 'webview ref не найден'); return }
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
    return window.api?.on('notify:mark-read', ({ messengerId, senderName, chatTag }) => {
      traceNotif('mark-read', 'info', messengerId, senderName || '', `sender="${(senderName||'').slice(0,30)}" tag=${!!chatTag} hidden=${document.hidden}`)
      if (!messengerId) return
      if (document.hidden) {
        pendingMarkReadsRef.current.push({ messengerId, senderName, chatTag })
        traceNotif('mark-read', 'info', messengerId, senderName || '', 'отложено — окно скрыто')
        return
      }
      executeMarkRead({ messengerId, senderName, chatTag })
    })
  }, [executeMarkRead])

  useEffect(() => {
    const handler = () => {
      if (!document.hidden && pendingMarkReadsRef.current.length > 0) {
        const pending = [...pendingMarkReadsRef.current]
        pendingMarkReadsRef.current = []
        traceNotif('mark-read', 'info', '', '', `обработка ${pending.length} отложенных mark-read`)
        pending.forEach(item => { setTimeout(() => executeMarkRead(item), 500) })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [executeMarkRead])

  // ── Автообновление лога уведомлений ────────────────────────────────────
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
            const trace = pipelineTraceRef.current.filter(e => !e.mid || e.mid === mid)
            setNotifLogModal(prev => prev && prev.messengerId === mid ? { ...prev, log, trace } : prev)
          } catch {}
        }).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [notifLogModal?.messengerId])

  // ── Очистка ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(retryTimers.current).forEach(t => clearTimeout(t))
      clearTimeout(saveTimer.current)
      clearTimeout(statsSaveTimer.current)
      clearTimeout(zoomSaveTimer.current)
    }
  }, [])

  // v0.75.5: Автосброс notifCountRef при переключении на вкладку
  useEffect(() => {
    if (!activeId) return
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

  // ── Computed values ────────────────────────────────────────────────────
  const pinnedTabs = settings.pinnedTabs || {}
  const theme = settings.theme || 'dark'
  const currentZoom = zoomLevels[activeId] || 100

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--cc-bg)' }} onClick={() => contextMenuTab && setContextMenuTab(null)}>

      <TabBar
        messengers={messengers} activeId={activeId} accountInfo={accountInfo}
        settings={settings} unreadCounts={unreadCounts} unreadSplit={unreadSplit}
        messagePreview={messagePreview} zoomLevels={zoomLevels} monitorStatus={monitorStatus}
        webviewLoading={webviewLoading} newMessageIds={newMessageIds} dragOverId={dragOverId}
        contextMenuTab={contextMenuTab} showAI={showAI} showTemplates={showTemplates}
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
        handleTabContextAction={handleTabContextAction}
        changeZoom={changeZoom} zoomEditing={zoomEditing} setZoomEditing={setZoomEditing}
        zoomInputValue={zoomInputValue} setZoomInputValue={setZoomInputValue} zoomInputRef={zoomInputRef}
        statusBarMsg={statusBarMsg} stats={stats} totalUnread={totalUnread}
      />

      {/* ── Основной layout ── */}
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
        <ErrorBoundary name="AISidebar"><AISidebar
          settings={settings}
          onSettingsChange={handleSettingsChange}
          lastMessage={lastMessage}
          visible={showAI}
          width={aiWidth}
          onToggle={() => setShowAI(!showAI)}
          panelRef={aiPanelRef}
          chatHistory={chatHistory}
          activeMessengerId={activeId}
        /></ErrorBoundary>
      </div>

      {/* ── Модальные окна ── */}
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
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{ backgroundColor: `${confirmClose.color}20` }}>
                {confirmClose.emoji || '💬'}
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--cc-text)' }}>Закрыть вкладку?</h3>
                <p className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>
                  Вкладка <span style={{ color: confirmClose.color, fontWeight: 600 }}>{confirmClose.name}</span> будет удалена.
                  <br />Сессия авторизации может сброситься.
                </p>
              </div>
              <div className="flex gap-3 w-full mt-1">
                <button
                  onClick={() => setConfirmClose(null)} autoFocus
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
      {notifLogModal && <ErrorBoundary name="NotifLog"><NotifLogModal ctx={{
        notifLogModal, setNotifLogModal, notifLogTab, setNotifLogTab,
        traceFilter, setTraceFilter, setCellTooltip,
        settings, setSettings, webviewRefs,
        handleTabContextAction_diag,
        traceNotif, handleNewMessage, pipelineTraceRef
      }} /></ErrorBoundary>}

      {/* ── v0.84.2: Модальное окно системного лога ── */}
      {showLogModal && <LogModal
        content={logContent}
        onClose={() => setShowLogModal(false)}
        onRefresh={() => window.api?.invoke('app:read-log').then(c => setLogContent(c || 'Лог пуст'))}
      />}

      {/* ── Тултип для ячеек таблицы лога ── */}
      {cellTooltip && (
        <div className="cc-notif-tooltip" style={{ left: Math.min(cellTooltip.x + 8, window.innerWidth - 460), top: cellTooltip.y + 16 }}>
          {cellTooltip.text}
        </div>
      )}
    </div>
  )
}
