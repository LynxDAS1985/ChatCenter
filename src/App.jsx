// v0.39.0 — Кастомные уведомления Messenger Ribbon
import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_MESSENGERS } from './constants.js'
import AddMessengerModal from './components/AddMessengerModal.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import AISidebar from './components/AISidebar.jsx'
import TemplatesPanel from './components/TemplatesPanel.jsx'
import AutoReplyPanel from './components/AutoReplyPanel.jsx'

// ─── Звуковое уведомление (Web Audio API) ─────────────────────────────────
// Уникальная тональность для каждого мессенджера по цвету

const MESSENGER_SOUNDS = {
  '#2AABEE': { f1: 1047, f2: 1319, type: 'sine' },       // Telegram — C6 + E6 (яркий, восходящий)
  '#25D366': { f1: 784,  f2: 1175, type: 'sine' },       // WhatsApp — G5 + D6 (тёплый, мягкий)
  '#4C75A3': { f1: 659,  f2: 880,  type: 'triangle' },   // VK — E5 + A5 (мягкий, классический)
  '#E1306C': { f1: 988,  f2: 1397, type: 'sine' },       // Instagram — B5 + F6 (энергичный)
  '#5865F2': { f1: 740,  f2: 1109, type: 'triangle' },   // Discord — F#5 + C#6 (глубокий)
  '#7360F2': { f1: 831,  f2: 1245, type: 'sine' },       // Viber — G#5 + D#6
  '#00AAFF': { f1: 880,  f2: 1320, type: 'sine' },       // Авито — A5 + E6
  '#A855F7': { f1: 932,  f2: 1175, type: 'triangle' },   // Wildberries — A#5 + D6
  '#005BFF': { f1: 698,  f2: 1047, type: 'sine' },       // Ozon — F5 + C6
  '#2688EB': { f1: 784,  f2: 1047, type: 'triangle' },   // Макс — G5 + C6 (мягкий, свежий)
}

function getSoundForColor(color) {
  if (color && MESSENGER_SOUNDS[color]) return MESSENGER_SOUNDS[color]
  // Для незнакомого цвета — генерируем частоты из хэша цвета
  let hash = 0
  for (let i = 0; i < (color || '').length; i++) hash = ((hash << 5) - hash + color.charCodeAt(i)) | 0
  const f1 = 600 + Math.abs(hash % 500)         // 600–1100 Hz
  const f2 = f1 + 200 + Math.abs((hash >> 8) % 300) // f1+200..f1+500 Hz
  return { f1, f2, type: Math.abs(hash) % 2 === 0 ? 'sine' : 'triangle' }
}

function playNotificationSound(color) {
  try {
    const { f1, f2, type } = getSoundForColor(color)
    const ctx = new AudioContext()
    const t = ctx.currentTime
    // Нота 1
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = type
    osc1.frequency.value = f1
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    gain1.gain.setValueAtTime(0.15, t)
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    osc1.start(t)
    osc1.stop(t + 0.12)
    // Нота 2 (с задержкой)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = type
    osc2.frequency.value = f2
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    gain2.gain.setValueAtTime(0, t)
    gain2.gain.setValueAtTime(0.12, t + 0.08)
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.23)
    osc2.start(t + 0.08)
    osc2.stop(t + 0.23)
  } catch {}
}

// ─── Компонент вкладки мессенджера ────────────────────────────────────────

function MessengerTab({
  messenger: m, isActive, accountInfo, unreadCount, isNew,
  unreadSplit, messagePreview, zoomLevel, monitorStatus, isPinned,
  onClick, onClose, onContextMenu, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd
}) {
  const [hovered, setHovered] = useState(false)
  const [badgePulse, setBadgePulse] = useState(false)
  const prevCountRef = useRef(0)

  // Анимация бейджа при росте счётчика непрочитанных
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current >= 0) {
      setBadgePulse(true)
      const t = setTimeout(() => setBadgePulse(false), 500)
      return () => clearTimeout(t)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])
  // Обновляем ref и вне условия (когда count уменьшается)
  useEffect(() => { prevCountRef.current = unreadCount }, [unreadCount])

  // Формируем тултип бейджа с детализацией
  const badgeTooltip = unreadSplit
    ? `Непрочитанных: ${unreadCount}\n💬 Личные: ${unreadSplit.personal}\n📢 Каналы/группы: ${unreadSplit.channels}`
    : `Непрочитанных: ${unreadCount}`

  return (
    <button
      draggable
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDrop={e => { e.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      title={accountInfo ? `${m.name} — ${accountInfo}` : m.name}
      className="relative flex items-center justify-center gap-1.5 h-[40px] px-3 cursor-pointer transition-all duration-150"
      style={{
        minWidth: 130,
        backgroundColor: isActive ? `${m.color}1A` : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderBottom: isActive ? `2px solid ${m.color}` : '2px solid transparent',
        borderRadius: '6px 6px 0 0',
        outline: isDragOver ? `2px dashed ${m.color}66` : 'none',
        outlineOffset: '-2px',
      }}
    >
      {/* Цветная точка: 🟢=активен 🟡=загрузка 🔴=ошибка + ping при новом сообщении */}
      <span className="relative inline-flex w-2 h-2 shrink-0"
        title={monitorStatus === 'active' ? 'Мониторинг активен' : monitorStatus === 'loading' ? 'Загрузка монитора...' : monitorStatus === 'error' ? 'Монитор не отвечает' : ''}
      >
        {isNew && !isActive && (
          <span
            className="animate-ping absolute inset-0 rounded-full"
            style={{ backgroundColor: m.color, opacity: 0.6 }}
          />
        )}
        <span
          className="relative w-2 h-2 rounded-full block transition-all duration-150"
          style={{
            backgroundColor: monitorStatus === 'error' ? '#ef4444'
              : monitorStatus === 'loading' ? '#eab308'
              : isActive ? m.color : `${m.color}55`
          }}
        />
      </span>

      {/* Название + зум + аккаунт */}
      <span className="flex flex-col items-center leading-tight">
        <span className="flex items-center gap-1">
          <span
            className="text-sm font-medium whitespace-nowrap transition-colors duration-150 flex items-center gap-0.5"
            style={{ color: isActive ? m.color : 'var(--cc-text-dim)' }}
          >
            {isPinned && <span className="text-[9px] opacity-50" title="Закреплена">📌</span>}
            {m.name}
          </span>
          {zoomLevel && zoomLevel !== 100 && (
            <span
              className="text-[9px] leading-none px-1 py-0.5 rounded font-bold"
              style={{ color: m.color, backgroundColor: `${m.color}20` }}
              title={`Масштаб: ${zoomLevel}%`}
            >{zoomLevel}%</span>
          )}
        </span>
        {messagePreview ? (
          <span
            className="text-[10px] whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis leading-tight"
            style={{ color: m.color }}
          >
            💬 {messagePreview}
          </span>
        ) : accountInfo ? (
          <span
            className="text-[10px] whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis leading-tight opacity-60"
            style={{ color: 'var(--cc-text-dimmer)' }}
          >
            {accountInfo}
          </span>
        ) : null}
      </span>

      {/* Бейдж непрочитанных / кнопка закрыть (hover) / замок (pinned) */}
      {hovered && !isPinned ? (
        <span
          onClick={e => { e.stopPropagation(); onClose() }}
          className="ml-auto w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] leading-none cursor-pointer transition-all shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
          title="Закрыть вкладку"
        >✕</span>
      ) : unreadCount > 0 ? (
        unreadSplit && unreadSplit.personal > 0 && unreadSplit.channels > 0 ? (
          // Два бейджа: личные (цвет мессенджера) + каналы (серый)
          <span className="ml-auto flex flex-col gap-0.5 items-end shrink-0" title={badgeTooltip}>
            <span
              className="min-w-[15px] h-[14px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none"
              style={{ backgroundColor: m.color, animation: isNew ? 'bounce 0.6s ease 3' : badgePulse ? 'badgePulse 0.4s ease' : 'none' }}
            >💬{unreadSplit.personal > 99 ? '99+' : unreadSplit.personal}</span>
            <span
              className="min-w-[15px] h-[14px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none"
              style={{ backgroundColor: '#6b7280', animation: badgePulse ? 'badgePulse 0.4s ease' : 'none' }}
            >📢{unreadSplit.channels > 99 ? '99+' : unreadSplit.channels}</span>
          </span>
        ) : (
          // Один общий бейдж
          <span
            className="ml-auto min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0"
            style={{ animation: isNew ? 'bounce 0.6s ease 3' : badgePulse ? 'badgePulse 0.4s ease' : 'none' }}
            title={badgeTooltip}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )
      ) : null}
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
  const [monitorDiag, setMonitorDiag] = useState(null)     // диагностика DOM от monitor.preload
  const [monitorStatus, setMonitorStatus] = useState({})   // { [id]: 'loading'|'active'|'error' }
  const [statusBarMsg, setStatusBarMsg] = useState(null)   // последнее сообщение для статусбара
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
  const [confirmClose, setConfirmClose] = useState(null) // { id, name, color }

  const webviewRefs = useRef({})
  const notifReadyRef = useRef({})   // { [id]: true } — warm-up: игнорируем __CC_NOTIF__ первые 10 сек
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
  const statusBarMsgTimer = useRef(null)
  const tabContextMenu = useRef({ id: null, x: 0, y: 0 })
  const [contextMenuTab, setContextMenuTab] = useState(null) // { id, x, y }
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

  // ── Бейдж-события от ChatMonitor ─────────────────────────────────────────
  useEffect(() => {
    return window.api.on('messenger:badge', ({ id, count }) => {
      setUnreadCounts(prev => {
        const prev_count = prev[id] || 0
        if (count > prev_count && settingsRef.current.soundEnabled !== false) {
          const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[id]
          if (!messengerMuted) {
            const m = messengersRef.current.find(x => x.id === id)
            playNotificationSound(m?.color)
          }
        }
        return { ...prev, [id]: count }
      })
    })
  }, [])

  // ── Клик по кастомному уведомлению (Messenger Ribbon) ────────────────────
  useEffect(() => {
    return window.api.on('notify:clicked', ({ messengerId }) => {
      if (messengerId) setActiveId(messengerId)
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

  // ── Переключение вкладки ──────────────────────────────────────────────────
  const handleTabClick = (id) => {
    setActiveId(id)
    // НЕ обнуляем unreadCounts — реальный счётчик придёт от page-title-updated / unread-count IPC
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
        console.log(`[tryExtractAccount] ${messengerId} attempt=${attempt} result=`, JSON.stringify(result), typeof result)
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

  // ── Обработка входящего сообщения (общая для ipc-message и console-message) ──
  // extra = { senderName, iconUrl } — опционально, из перехваченного Notification
  const handleNewMessage = (messengerId, text, extra) => {
    if (!text) return

    // Автопереключение на вкладку с новым сообщением (если включено)
    if (settingsRef.current.autoSwitchOnMessage && messengerId !== activeIdRef.current) {
      setActiveId(messengerId)
    }

    // Звук и уведомление — проверяем глобальный + per-messenger mute
    // НЕ подавляем при активной вкладке — messengerId это вкладка, а не конкретный чат
    const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[messengerId]
    const mInfo = messengersRef.current.find(x => x.id === messengerId)
    if (settingsRef.current.soundEnabled !== false && !messengerMuted) playNotificationSound(mInfo?.color)
    if (settingsRef.current.notificationsEnabled !== false && !messengerMuted) {
      const senderName = extra?.senderName
      const notifTitle = senderName
        ? `${mInfo?.name || 'ЦентрЧатов'} — ${senderName}`
        : (mInfo?.name || 'ЦентрЧатов')
      window.api.invoke('app:custom-notify', {
        title: extra?.senderName || '',
        body: text.length > 100 ? text.slice(0, 97) + '…' : text,
        iconUrl: extra?.iconUrl || undefined,
        color: mInfo?.color || '#2AABEE',
        emoji: mInfo?.emoji || '💬',
        messengerName: mInfo?.name || 'ЦентрЧатов',
        messengerId: messengerId,
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
      webviewRefs.current[messengerId] = el

      // Статус мониторинга: loading при инициализации
      setMonitorStatus(prev => ({ ...prev, [messengerId]: 'loading' }))

      el.addEventListener('dom-ready', () => {
        clearTimeout(retryTimers.current[messengerId])
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, 0), 3500
        )
        // Warm-up: игнорируем __CC_NOTIF__ первые 10 сек после загрузки
        // VK и другие мессенджеры при загрузке воспроизводят старые/кешированные уведомления
        notifReadyRef.current[messengerId] = false
        setTimeout(() => { notifReadyRef.current[messengerId] = true }, 10000)
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
          // Перехват Notification + Audio перенесён в monitor.preload.js (v0.29.1)
          // — ранняя <script> injection при document_start, ДО скриптов мессенджера
        } catch {}
      })

      // page-title-updated — мгновенное обновление счётчика из title WebView
      // Telegram ставит "(26) Telegram Web" — парсим число без задержки MutationObserver
      el.addEventListener('page-title-updated', (e) => {
        const match = e.title?.match(/\((\d+)\)/)
        if (match) {
          const count = parseInt(match[1], 10) || 0
          setUnreadCounts(prev => {
            if (prev[messengerId] === count) return prev
            // Звук при увеличении счётчика (только если пользователь НЕ смотрит на этот чат)
            if (count > (prev[messengerId] || 0) && !(!document.hidden && activeIdRef.current === messengerId)) {
              const s = settingsRef.current
              const muted = !!(s.mutedMessengers || {})[messengerId]
              if (s.soundEnabled !== false && !muted) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
              }
            }
            return { ...prev, [messengerId]: count }
          })
          // Обновляем статус мониторинга — title работает
          setMonitorStatus(prev => ({ ...prev, [messengerId]: 'active' }))
        }
      })

      el.addEventListener('ipc-message', (e) => {
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
          const count = Number(e.args[0]) || 0
          setUnreadCounts(prev => {
            // Звук при увеличении счётчика (только если пользователь НЕ смотрит на этот чат)
            if (count > (prev[messengerId] || 0) && !(!document.hidden && activeIdRef.current === messengerId)) {
              const s = settingsRef.current
              const muted = !!(s.mutedMessengers || {})[messengerId]
              if (s.soundEnabled !== false && !muted) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                playNotificationSound(mi?.color)
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
          // Диагностика DOM от monitor.preload — для отладки селекторов
          const diag = e.args[0]
          console.log(`[ChatCenter] 🔍 Диагностика DOM (${messengerId}):`, diag)
          setMonitorDiag(prev => ({ ...prev, [messengerId]: diag }))
        } else if (e.channel === 'new-message') {
          // Warm-up: игнорируем сообщения от MutationObserver первые 10 сек после dom-ready
          if (!notifReadyRef.current[messengerId]) return
          handleNewMessage(messengerId, e.args[0])
        }
      })

      // ── console-message: перехват Notification из main world (v0.27.0) ───
      // executeJavaScript делает console.log('__CC_NOTIF__...') → ловим здесь
      el.addEventListener('console-message', (e) => {
        const msg = e.message
        if (!msg) return
        // ── __CC_ACCOUNT__: имя профиля из accountScript ──
        if (msg.startsWith('__CC_ACCOUNT__')) {
          const name = msg.slice(14).trim()
          if (name && name.length > 1 && name.length < 80) {
            setAccountInfo(prev => ({ ...prev, [messengerId]: name }))
          }
          return
        }
        if (!msg.startsWith('__CC_NOTIF__')) return
        // Warm-up: игнорируем уведомления до готовности (10 сек после dom-ready)
        if (!notifReadyRef.current[messengerId]) return
        // Если пользователь смотрит на этот мессенджер — не обрабатывать уведомление
        // (пометка "непрочитанное" вызывает Notification, но это не новое сообщение)
        if (!document.hidden && activeIdRef.current === messengerId) return
        try {
          const data = JSON.parse(msg.slice(12)) // после '__CC_NOTIF__'
          const text = data.b || data.t || ''
          if (text) {
            // data.t = title (имя отправителя), data.i = icon URL (аватарка)
            const extra = {}
            if (data.t && data.b) extra.senderName = data.t // title = имя, body = текст
            if (data.i) {
              // Конвертируем относительный URL в абсолютный (MAX может передать /path/to/avatar)
              if (data.i.startsWith('http')) {
                extra.iconUrl = data.i
              } else if (data.i.startsWith('/')) {
                const mi = messengersRef.current.find(x => x.id === messengerId)
                if (mi?.url) { try { extra.iconUrl = new URL(data.i, mi.url).href } catch {} }
              }
            }
            handleNewMessage(messengerId, text, Object.keys(extra).length ? extra : undefined)
          }
        } catch {}
      })
    }
  }

  // ── Контекстное меню вкладки ────────────────────────────────────────────
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
    } else if (action === 'diagFull') {
      // Расширенная диагностика: localStorage, sessionStorage, IndexedDB, cookies, DOM avatars
      if (wv) {
        wv.executeJavaScript(`(async () => {
          var r = { url: location.href, title: document.title }
          r.localStorage = {}
          try { for (var i = 0; i < Math.min(localStorage.length, 50); i++) {
            var k = localStorage.key(i); r.localStorage[k] = (localStorage.getItem(k) || '').substring(0, 200)
          }} catch(e) { r.localStorageError = e.message }
          r.sessionStorage = {}
          try { for (var i = 0; i < Math.min(sessionStorage.length, 50); i++) {
            var k = sessionStorage.key(i); r.sessionStorage[k] = (sessionStorage.getItem(k) || '').substring(0, 200)
          }} catch(e) { r.sessionStorageError = e.message }
          try { r.cookies = document.cookie.split(';').slice(0, 30).map(function(c){ return c.trim().split('=')[0] }) } catch(e) {}
          r.indexedDB = []
          try {
            var dbs = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : []
            for (var d = 0; d < dbs.length; d++) {
              var info = { name: dbs[d].name, version: dbs[d].version, stores: [] }
              try {
                var db = await new Promise(function(ok) {
                  var req = indexedDB.open(dbs[d].name)
                  req.onsuccess = function(){ok(req.result)}
                  req.onerror = function(){ok(null)}
                  req.onupgradeneeded = function(){req.transaction.abort();ok(null)}
                })
                if (db) { info.stores = Array.from(db.objectStoreNames); db.close() }
              } catch(e) { info.error = e.message }
              r.indexedDB.push(info)
            }
          } catch(e) { r.indexedDBError = e.message }
          r.avatarImages = []
          try {
            var imgs = document.querySelectorAll('img')
            for (var i = 0; i < imgs.length && i < 30; i++) {
              if (imgs[i].width >= 20 && imgs[i].width <= 80 && imgs[i].height >= 20)
                r.avatarImages.push({ src: (imgs[i].src||'').substring(0,200), size: imgs[i].width+'x'+imgs[i].height, cls: (imgs[i].className||'').substring(0,60), parentCls: (imgs[i].parentElement?.className||'').substring(0,80) })
            }
          } catch(e) {}
          r.avatarElements = []
          try {
            var avs = document.querySelectorAll('[class*="avatar" i], [class*="Avatar"], [class*="photo" i], [class*="Photo"]')
            for (var i = 0; i < avs.length && i < 20; i++) {
              var bg = ''; try { bg = getComputedStyle(avs[i]).backgroundImage; if (bg==='none') bg='' } catch(e){}
              var ch = avs[i].querySelector('img')
              r.avatarElements.push({ tag: avs[i].tagName, cls: (avs[i].className||'').substring(0,80), bg: bg?bg.substring(0,200):'', childImg: ch?(ch.src||'').substring(0,200):'' })
            }
          } catch(e) {}
          r.notifHooked = !!window.__cc_notif_hooked
          return JSON.stringify(r, null, 2)
        })()`)
          .then(json => {
            console.log('[ChatCenter] 🧪 Полная диагностика (' + id + '):', json)
            navigator.clipboard.writeText(json).catch(() => {})
            window.api.invoke('app:custom-notify', { title: 'Диагностика', body: 'Полная диагностика ' + id + ' → буфер обмена', color: '#2AABEE', emoji: '🔍', messengerName: 'ЦентрЧатов', messengerId: id }).catch(() => {})
          })
          .catch(err => console.error('[ChatCenter] Ошибка диагностики:', err))
      }
    } else if (action === 'diagAccount') {
      // Пошаговый тест accountScript — выполняет ТОТ ЖЕ код и показывает результат каждого шага
      if (wv) {
        wv.executeJavaScript(`(async () => {
          var r = { steps: [] }
          var BL = /^(max|макс|мессенджер|messenger|vk|app|undefined|null|true|false|test|user|admin|guest|default|профиль|profile)$/i
          var CK = '__cc_account_name'
          function valid(n) {
            if (!n || typeof n !== 'string') return null
            n = n.trim()
            return (n.length > 1 && n.length < 60 && !BL.test(n)) ? n : null
          }
          // Step 0: cache
          var cached = localStorage.getItem(CK)
          r.steps.push({ step: '0_cache', cached: cached, valid: !!valid(cached) })
          // Step 1: direct selectors on current page
          var ni = document.querySelector('input[placeholder="Имя"]')
          r.steps.push({ step: '1_inputИмя', found: !!ni, value: ni ? ni.value : null })
          var pe = document.querySelector('.phone')
          r.steps.push({ step: '1_phone', found: !!pe, text: pe ? pe.textContent.substring(0,30) : null })
          var pc = document.querySelector('button.profile')
          r.steps.push({ step: '1_buttonProfile', found: !!pc, text: pc ? pc.textContent.trim().substring(0,60) : null })
          // Step 2: find profile button
          var btn = document.querySelector('.item.settings button')
          r.steps.push({ step: '2_profileBtn', found: !!btn, tag: btn ? btn.tagName : null, cls: btn ? (btn.className||'').substring(0,60) : null })
          if (!btn) {
            r.steps.push({ step: '2_ABORT', reason: 'profile button not found' })
            return JSON.stringify(r, null, 2)
          }
          // Step 3: click
          try { btn.click(); r.steps.push({ step: '3_click', ok: true }) } catch(e) { r.steps.push({ step: '3_click', error: e.message }) }
          // Step 4: wait 3s
          await new Promise(function(ok) { setTimeout(ok, 3000) })
          r.steps.push({ step: '4_waited', url: location.href })
          // Step 5: read after navigation
          ni = document.querySelector('input[placeholder="Имя"]')
          r.steps.push({ step: '5_inputИмя_after', found: !!ni, value: ni ? ni.value : null, valid: ni ? !!valid(ni.value) : false })
          pe = document.querySelector('.phone')
          r.steps.push({ step: '5_phone_after', found: !!pe, text: pe ? pe.textContent.substring(0,30) : null })
          pc = document.querySelector('button.profile')
          r.steps.push({ step: '5_buttonProfile_after', found: !!pc, text: pc ? pc.textContent.trim().substring(0,60) : null })
          // Step 6: what would accountScript return?
          var result = null
          if (ni && valid(ni.value)) { result = ni.value.trim() }
          else if (pc) {
            var t2 = pc.textContent.trim()
            var pm2 = t2.match(/\\+7\\d{10}/)
            if (pm2) { var nm = t2.split(pm2[0])[0].trim(); result = valid(nm) || pm2[0] }
          }
          else if (pe) { var ph2 = pe.textContent.match(/\\+7\\d{10}/); if (ph2) result = ph2[0] }
          r.steps.push({ step: '6_result', wouldReturn: result })
          // Step 7: go back
          history.back()
          return JSON.stringify(r, null, 2)
        })()`)
          .then(json => {
            console.log('[ChatCenter] 👤 Тест accountScript (' + id + '):', json)
            navigator.clipboard.writeText(json).catch(() => {})
            window.api.invoke('app:custom-notify', { title: 'Тест accountScript', body: 'Результат в буфере обмена', color: '#2AABEE', emoji: '👤', messengerName: 'ЦентрЧатов', messengerId: id }).catch(() => {})
          })
          .catch(err => {
            var errMsg = JSON.stringify({ error: err.message || String(err) })
            console.error('[ChatCenter] ОШИБКА теста accountScript:', err)
            navigator.clipboard.writeText(errMsg).catch(() => {})
            window.api.invoke('app:custom-notify', { title: 'ОШИБКА accountScript', body: err.message || String(err), color: '#EF4444', emoji: '⚠️', messengerName: 'ЦентрЧатов', messengerId: id }).catch(() => {})
          })
      }
    } else if (action === 'copyUrl') {
      const m = messengers.find(x => x.id === id)
      if (m?.url) navigator.clipboard.writeText(m.url).catch(() => {})
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

  // Бейдж трея отключён (v0.20.0) — по запросу пользователя

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
              unreadCount={unreadCounts[m.id] || 0}
              unreadSplit={unreadSplit[m.id]}
              messagePreview={messagePreview[m.id]}
              zoomLevel={zoomLevels[m.id]}
              monitorStatus={monitorStatus[m.id]}
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
                { action: 'diag', icon: '🔍', label: 'Диагностика DOM' },
                { action: 'diagFull', icon: '🧪', label: 'Полная диагностика (→ буфер)' },
                { action: 'diagAccount', icon: '👤', label: 'Диагностика accountScript (→ буфер)' },
                { action: 'copyUrl', icon: '📋', label: 'Копировать URL' },
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
                style={{ display: activeId === m.id ? 'block' : 'none' }}
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
            <span title="Непрочитанных сообщений во всех вкладках">📥 <span style={{ color: '#f87171', fontWeight: 600 }}>{totalUnread}</span> непрочитано</span>
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
    </div>
  )
}
