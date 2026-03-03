// v0.6 — Тема, fix кнопок (WCO), DnD вкладок, горячие клавиши, ChatMonitor, ИИ-помощник
import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_MESSENGERS } from './constants.js'
import AddMessengerModal from './components/AddMessengerModal.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import AISidebar from './components/AISidebar.jsx'

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
  messenger: m, isActive, accountInfo, unreadCount,
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
      {/* Цветная точка */}
      <span
        className="w-2 h-2 rounded-full shrink-0 transition-all duration-150"
        style={{ backgroundColor: isActive ? m.color : `${m.color}55` }}
      />

      {/* Название + аккаунт */}
      <span className="flex flex-col items-start leading-tight">
        <span
          className="text-sm font-medium whitespace-nowrap transition-colors duration-150"
          style={{ color: isActive ? m.color : 'var(--cc-text-dim)' }}
        >
          {m.name}
        </span>
        {accountInfo && (
          <span
            className="text-[10px] whitespace-nowrap max-w-[110px] overflow-hidden text-ellipsis leading-tight"
            style={{ color: isActive ? `${m.color}AA` : 'var(--cc-text-dimmer)' }}
          >
            {accountInfo}
          </span>
        )}
      </span>

      {/* Бейдж непрочитанных */}
      {unreadCount > 0 && !hovered && (
        <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
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
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAI, setShowAI] = useState(true)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [settings, setSettings] = useState({ soundEnabled: true, minimizeToTray: true, theme: 'dark' })
  const [dragOverId, setDragOverId] = useState(null)
  const [monitorPreloadUrl, setMonitorPreloadUrl] = useState(null)
  const [appReady, setAppReady] = useState(false)
  const [lastMessage, setLastMessage] = useState(null) // для AISidebar

  const webviewRefs = useRef({})
  const retryTimers = useRef({})
  const saveTimer = useRef(null)
  const searchInputRef = useRef(null)
  const dragStartId = useRef(null)
  const settingsRef = useRef(settings)
  const activeIdRef = useRef(activeId)
  const messengersRef = useRef(messengers)

  // Синхронизация рефов
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { messengersRef.current = messengers }, [messengers])

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
      }).catch(() => {
        setMessengers(DEFAULT_MESSENGERS)
        setActiveId(DEFAULT_MESSENGERS[0].id)
      }),
      window.api.invoke('settings:get').then(s => setSettings(s)).catch(() => {}),
      window.api.invoke('app:get-paths').then(({ monitorPreload }) => {
        if (monitorPreload) {
          // Конвертируем путь ОС в file:// URL
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

  // ── Бейдж-события от ChatMonitor (через ipc-message в setWebviewRef) ────
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

  // ── Очистка ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(retryTimers.current).forEach(t => clearTimeout(t))
      clearTimeout(saveTimer.current)
    }
  }, [])

  // ── Переключение вкладки ──────────────────────────────────────────────────
  const handleTabClick = (id) => {
    setActiveId(id)
    setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
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
      })

      // Сообщения от ChatMonitor (monitor.preload.js через sendToHost)
      el.addEventListener('ipc-message', (e) => {
        if (e.channel === 'unread-count') {
          const count = Number(e.args[0]) || 0
          setUnreadCounts(prev => {
            if (count > (prev[messengerId] || 0) && settingsRef.current.soundEnabled !== false) {
              playNotificationSound()
            }
            return { ...prev, [messengerId]: count }
          })
        }
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  const theme = settings.theme || 'dark'

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
          {/* Поиск */}
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

          {/* ИИ */}
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

          {/* Тема */}
          <button
            onClick={() => handleSettingsChange({ ...settings, theme: theme === 'dark' ? 'light' : 'dark' })}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >{theme === 'dark' ? '☀️' : '🌙'}</button>

          {/* Настройки */}
          <button
            onClick={() => setShowSettings(true)}
            title="Настройки (Ctrl+,)"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px] transition-all duration-150 cursor-pointer"
            style={{ color: 'var(--cc-icon)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--cc-hover)'; e.currentTarget.style.color = 'var(--cc-icon-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--cc-icon)' }}
          >⚙️</button>

          {/* Общий счётчик непрочитанных */}
          {totalUnread > 0 && (
            <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shrink-0">
              {totalUnread}
            </span>
          )}
        </div>

        {/* ──  Спейсер для нативных кнопок Windows (WCO) ── */}
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
        <div className="flex-1 relative overflow-hidden" style={{ backgroundColor: 'var(--cc-bg)' }}>
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
        </div>

        {/* ── ИИ-боковая панель ── */}
        <AISidebar
          settings={settings}
          onSettingsChange={handleSettingsChange}
          lastMessage={lastMessage}
          visible={showAI}
          onToggle={() => setShowAI(!showAI)}
        />
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
    </div>
  )
}
