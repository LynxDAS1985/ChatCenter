// v0.10.0 — Стриминг AI (SSE), автосохранение черновика, бейдж трея
import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_MESSENGERS } from './constants.js'
import AddMessengerModal from './components/AddMessengerModal.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import AISidebar from './components/AISidebar.jsx'
import TemplatesPanel from './components/TemplatesPanel.jsx'
import AutoReplyPanel from './components/AutoReplyPanel.jsx'

// ─── Звуковое уведомление (Web Audio API) ─────────────────────────────────

function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
  } catch {}
}

// ─── Компонент вкладки мессенджера ────────────────────────────────────────

function MessengerTab({
  messenger: m, isActive, accountInfo, unreadCount, isNew,
  unreadSplit, messagePreview,
  onClick, onClose, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      draggable
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDrop={e => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      title={accountInfo ? `${m.name} — ${accountInfo}` : m.name}
      className="relative flex items-center gap-2 h-[40px] px-3 cursor-pointer shrink-0 transition-all duration-150"
      style={{
        backgroundColor: isActive ? `${m.color}1A` : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderBottom: isActive ? `2px solid ${m.color}` : '2px solid transparent',
        borderRadius: '6px 6px 0 0',
        outline: isDragOver ? `2px dashed ${m.color}66` : 'none',
        outlineOffset: '-2px',
      }}
    >
      {/* Цветная точка + ping-анимация при новом сообщении */}
      <span className="relative inline-flex w-2 h-2 shrink-0">
        {isNew && !isActive && (
          <span
            className="animate-ping absolute inset-0 rounded-full"
            style={{ backgroundColor: m.color, opacity: 0.6 }}
          />
        )}
        <span
          className="relative w-2 h-2 rounded-full block transition-all duration-150"
          style={{ backgroundColor: isActive ? m.color : `${m.color}55` }}
        />
      </span>

      {/* Название + аккаунт */}
      <span className="flex flex-col items-start leading-tight">
        <span
          className="text-sm font-medium whitespace-nowrap transition-colors duration-150"
          style={{ color: isActive ? m.color : 'var(--cc-text-dim)' }}
        >
          {m.name}
        </span>
        {(messagePreview || accountInfo) && (
          <span
            className="text-[10px] whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis leading-tight"
            style={{ color: messagePreview ? m.color : (isActive ? `${m.color}AA` : 'var(--cc-text-dimmer)') }}
          >
            {messagePreview ? `💬 ${messagePreview}` : accountInfo}
          </span>
        )}
      </span>

      {/* Бейдж непрочитанных — раздельный (личные 💬 / каналы 📢) или общий */}
      {unreadCount > 0 && !hovered && (
        unreadSplit && unreadSplit.personal > 0 && unreadSplit.channels > 0 ? (
          // Два бейджа: личные (цвет мессенджера) + каналы (серый)
          <span className="absolute top-0.5 right-0.5 flex flex-col gap-0.5 items-end">
            <span
              className="min-w-[15px] h-[14px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none"
              style={{ backgroundColor: m.color, animation: isNew ? 'bounce 0.6s ease 3' : 'none' }}
              title="Личные сообщения"
            >💬{unreadSplit.personal > 99 ? '99+' : unreadSplit.personal}</span>
            <span
              className="min-w-[15px] h-[14px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none"
              style={{ backgroundColor: '#6b7280' }}
              title="Каналы и группы"
            >📢{unreadSplit.channels > 99 ? '99+' : unreadSplit.channels}</span>
          </span>
        ) : (
          // Один общий бейдж
          <span
            className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none"
            style={{ animation: isNew ? 'bounce 0.6s ease 3' : 'none' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )
      )}

      {/* Кнопка «закрыть» (при hover) */}
      {hovered && (
        <span
          onClick={e => { e.stopPropagation(); onClose() }}
          className="absolute top-1 right-1 w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] leading-none cursor-pointer transition-all"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
          title="Закрыть вкладку"
        >✕</span>
      )}
    </button>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────

export default function App() {
  const [messengers, setMessengers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [accountInfo, setAccountInfo] = useState({})
  const [unreadCounts, setUnreadCounts] = useState({})
  const [unreadSplit, setUnreadSplit] = useState({})       // { [id]: { personal, channels } }
  const [messagePreview, setMessagePreview] = useState({}) // { [id]: 'текст превью' }
  const [showAddModal, setShowAddModal] = useState(false)
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

  const webviewRefs = useRef({})
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
  const aiWidthRef = useRef(300)
  const aiPanelRef = useRef(null)
  const zoomLevelsRef = useRef({})
  const zoomInputRef = useRef(null)
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
        setMessengers(list)
        setActiveId(list[0]?.id || null)
        // Сбрасываем accountInfo для мессенджеров без accountScript (например, Telegram)
        const noScript = list.filter(m => !m.accountScript &&
          !DEFAULT_MESSENGERS.find(d => d.id === m.id)?.accountScript
        ).map(m => m.id)
        if (noScript.length > 0) {
          setAccountInfo(prev => {
            const n = { ...prev }
            noScript.forEach(id => delete n[id])
            return n
          })
        }
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

  // ── Бейдж-события от ChatMonitor ─────────────────────────────────────────
  useEffect(() => {
    return window.api.on('messenger:badge', ({ id, count }) => {
      setUnreadCounts(prev => {
        const prev_count = prev[id] || 0
        if (count > prev_count && settingsRef.current.soundEnabled !== false) {
          playNotificationSound()
        }
        return { ...prev, [id]: count }
      })
    })
  }, [])

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
        if (aid) { removeMessenger(aid); e.preventDefault() }
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

  const changeZoom = (pct) => {
    if (!activeId) return
    const clamped = Math.max(25, Math.min(200, Math.round(pct / 5) * 5))
    setZoomLevels(prev => {
      const next = { ...prev, [activeId]: clamped }
      // Сохраняем зум в настройки с дебаунсом 800мс
      clearTimeout(zoomSaveTimer.current)
      zoomSaveTimer.current = setTimeout(() => {
        const updated = { ...settingsRef.current, zoomLevels: next }
        settingsRef.current = updated
        window.api.invoke('settings:save', updated).catch(() => {})
      }, 800)
      return next
    })
    applyZoom(activeId, clamped)
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

  // ── Переключение вкладки ──────────────────────────────────────────────────
  const handleTabClick = (id) => {
    setActiveId(id)
    setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
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
    delete webviewRefs.current[id]
    clearTimeout(retryTimers.current[id])
    delete retryTimers.current[id]
    setAccountInfo(prev => { const n = { ...prev }; delete n[id]; return n })
    setUnreadCounts(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [])

  // ── Добавление мессенджера ────────────────────────────────────────────────
  const addMessenger = useCallback((m) => {
    setMessengers(prev => [...prev, m])
    setActiveId(m.id)
    setShowAddModal(false)
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

  // ── Извлечение аккаунта из WebView ───────────────────────────────────────
  const tryExtractAccount = (messengerId, attempt = 0) => {
    if (attempt > 12) return
    const wv = webviewRefs.current[messengerId]
    const messenger = messengersRef.current.find(m => m.id === messengerId)
      || DEFAULT_MESSENGERS.find(m => m.id === messengerId)
    if (!wv || !messenger?.accountScript) return

    wv.executeJavaScript(messenger.accountScript)
      .then(result => {
        if (result && result.length > 0 && result.length < 80) {
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

  // ── Инициализация WebView ─────────────────────────────────────────────────
  const setWebviewRef = (el, messengerId) => {
    if (el && !el._chatcenterInit) {
      el._chatcenterInit = true
      webviewRefs.current[messengerId] = el

      el.addEventListener('dom-ready', () => {
        clearTimeout(retryTimers.current[messengerId])
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, 0), 3500
        )
        // Применяем зум если он не стандартный
        setTimeout(() => {
          const zoom = zoomLevelsRef.current[messengerId] || 100
          if (zoom !== 100) {
            try { webviewRefs.current[messengerId]?.setZoomFactor(zoom / 100) } catch {}
          }
        }, 600)
      })

      el.addEventListener('ipc-message', (e) => {
        if (e.channel === 'unread-count') {
          // Только обновляем счётчик — звук и уведомление только при new-message (с текстом)
          const count = Number(e.args[0]) || 0
          setUnreadCounts(prev => ({ ...prev, [messengerId]: count }))
        } else if (e.channel === 'unread-split') {
          // Раздельный счётчик: личные vs каналы
          const split = e.args[0]
          if (split) setUnreadSplit(prev => ({ ...prev, [messengerId]: split }))
        } else if (e.channel === 'new-message') {
          const text = e.args[0]
          if (!text) return

          // Звук и уведомление с текстом сообщения
          if (settingsRef.current.soundEnabled !== false) playNotificationSound()
          if (settingsRef.current.notificationsEnabled !== false) {
            const m = messengersRef.current.find(x => x.id === messengerId)
            window.api.invoke('app:notify', {
              title: m?.name || 'ЦентрЧатов',
              body: text.length > 100 ? text.slice(0, 97) + '…' : text,
            }).catch(() => {})
          }

          // Превью сообщения в бейдже вкладки (5 секунд)
          const previewText = text.slice(0, 32) + (text.length > 32 ? '…' : '')
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
              window.api.invoke('app:notify', {
                title: '🤖 Авто-ответ скопирован',
                body: `Правило: "${rule.keywords[0]}" — ответ в буфере обмена`
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
        }
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  const theme = settings.theme || 'dark'
  const currentZoom = zoomLevels[activeId] || 100

  // ── Обновляем бейдж иконки трея при изменении непрочитанных ─────────────
  useEffect(() => {
    window.api.invoke('tray:set-badge', totalUnread).catch(() => {})
  }, [totalUnread])

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--cc-bg)' }}>

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
              unreadCount={unreadCounts[m.id] || 0}
              unreadSplit={unreadSplit[m.id]}
              messagePreview={messagePreview[m.id]}
              isNew={newMessageIds.has(m.id)}
              isDragOver={dragOverId === m.id}
              onClick={() => handleTabClick(m.id)}
              onClose={() => removeMessenger(m.id)}
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

          {totalUnread > 0 && (
            <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">
              {totalUnread}
            </span>
          )}
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
                style={{ display: activeId === m.id ? 'block' : 'none' }}
              >
                <webview
                  ref={el => setWebviewRef(el, m.id)}
                  src={m.url}
                  partition={m.partition}
                  preload={monitorPreloadUrl || undefined}
                  style={{ width: '100%', height: '100%' }}
                  allowpopups="true"
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
            <span title="Непрочитанных сообщений во всех вкладках">📥 <span style={{ color: '#f87171', fontWeight: 600 }}>{totalUnread}</span> непрочитано</span>
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
    </div>
  )
}
