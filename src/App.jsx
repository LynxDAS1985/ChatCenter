// v0.5 — бейдж, закрытие вкладок, добавление мессенджеров, поиск, настройки, трей
import { useState, useEffect, useRef, useCallback } from 'react'
import { DEFAULT_MESSENGERS } from './constants.js'
import AddMessengerModal from './components/AddMessengerModal.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'

// ─── Воспроизведение уведомительного звука (Web Audio API) ───────────────────

function playNotificationSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 830
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch {}
}

// ─── Компонент вкладки мессенджера ────────────────────────────────────────────

function MessengerTab({ messenger: m, isActive, accountInfo, unreadCount, onClick, onClose }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={accountInfo ? `${m.name} — ${accountInfo}` : m.name}
      className="relative flex items-center gap-2 h-[40px] px-3 cursor-pointer shrink-0 transition-all duration-150"
      style={{
        backgroundColor: isActive ? `${m.color}1A` : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderBottom: isActive ? `2px solid ${m.color}` : '2px solid transparent',
        borderRadius: '6px 6px 0 0',
      }}
    >
      {/* Цветной индикатор */}
      <span
        className="w-2 h-2 rounded-full shrink-0 transition-all duration-150"
        style={{ backgroundColor: isActive ? m.color : `${m.color}55` }}
      />

      {/* Название + аккаунт */}
      <span className="flex flex-col items-start leading-tight">
        <span
          className="text-sm font-medium whitespace-nowrap transition-colors duration-150"
          style={{ color: isActive ? m.color : 'rgba(255,255,255,0.45)' }}
        >
          {m.name}
        </span>
        {accountInfo && (
          <span
            className="text-[10px] whitespace-nowrap max-w-[110px] overflow-hidden text-ellipsis leading-tight"
            style={{ color: isActive ? `${m.color}AA` : 'rgba(255,255,255,0.25)' }}
          >
            {accountInfo}
          </span>
        )}
      </span>

      {/* Бейдж непрочитанных (если нет hover) */}
      {unreadCount > 0 && !hovered && (
        <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {/* Кнопка закрыть (hover) */}
      {hovered && (
        <span
          onClick={e => { e.stopPropagation(); onClose() }}
          className="absolute top-1 right-1 w-[16px] h-[16px] rounded-full bg-white/10 hover:bg-red-500/70 flex items-center justify-center text-white/60 hover:text-white text-[10px] leading-none cursor-pointer transition-all"
          title="Закрыть вкладку"
        >
          ✕
        </span>
      )}
    </button>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function App() {
  const [messengers, setMessengers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [accountInfo, setAccountInfo] = useState({})      // { id: 'имя аккаунта' }
  const [unreadCounts, setUnreadCounts] = useState({})    // { id: число }
  const [ipcStatus, setIpcStatus] = useState('...')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [settings, setSettings] = useState({ soundEnabled: true, minimizeToTray: true })

  const webviewRefs = useRef({})
  const retryTimers = useRef({})
  const saveTimer = useRef(null)
  const searchInputRef = useRef(null)

  // ── IPC ping ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.api) {
      window.api.invoke('app:ping')
        .then(r => setIpcStatus(r.ok ? '✅' : '❌'))
        .catch(() => setIpcStatus('❌'))
    } else {
      setIpcStatus('❌')
    }
  }, [])

  // ── Загрузка мессенджеров и настроек при старте ──────────────────────────────
  useEffect(() => {
    window.api.invoke('messengers:load').then(list => {
      setMessengers(list)
      setActiveId(list[0]?.id || null)
    }).catch(() => {
      setMessengers(DEFAULT_MESSENGERS)
      setActiveId(DEFAULT_MESSENGERS[0].id)
    })

    window.api.invoke('settings:get').then(s => setSettings(s)).catch(() => {})
  }, [])

  // ── Автосохранение мессенджеров ──────────────────────────────────────────────
  useEffect(() => {
    if (messengers.length === 0) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.api.invoke('messengers:save', messengers).catch(() => {})
    }, 600)
  }, [messengers])

  // ── Слушаем бейдж-события от ChatMonitor (Фаза 3) ───────────────────────────
  useEffect(() => {
    return window.api.on('messenger:badge', ({ id, count }) => {
      setUnreadCounts(prev => ({ ...prev, [id]: count }))
      if (count > 0 && settings.soundEnabled) {
        playNotificationSound()
      }
    })
  }, [settings.soundEnabled])

  // ── Очистка таймеров ─────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(retryTimers.current).forEach(t => clearTimeout(t))
      clearTimeout(saveTimer.current)
    }
  }, [])

  // ── Переключение на вкладку — сбрасываем бейдж ───────────────────────────────
  const handleTabClick = (id) => {
    setActiveId(id)
    setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
    // Если поиск активен — применяем его к новой вкладке
    if (searchVisible && searchText) {
      setTimeout(() => {
        const wv = webviewRefs.current[id]
        if (wv) wv.findInPage(searchText)
      }, 200)
    }
  }

  // ── Закрытие вкладки ─────────────────────────────────────────────────────────
  const removeMessenger = useCallback((id) => {
    setMessengers(prev => {
      const next = prev.filter(m => m.id !== id)
      if (activeId === id) {
        setActiveId(next[0]?.id || null)
      }
      return next
    })
    delete webviewRefs.current[id]
    clearTimeout(retryTimers.current[id])
    delete retryTimers.current[id]
    setAccountInfo(prev => { const n = { ...prev }; delete n[id]; return n })
    setUnreadCounts(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [activeId])

  // ── Добавление нового мессенджера ─────────────────────────────────────────────
  const addMessenger = useCallback((m) => {
    setMessengers(prev => [...prev, m])
    setActiveId(m.id)
    setShowAddModal(false)
  }, [])

  // ── Поиск ────────────────────────────────────────────────────────────────────
  const handleSearch = (text) => {
    setSearchText(text)
    const wv = webviewRefs.current[activeId]
    if (!wv) return
    if (text) {
      wv.findInPage(text, { findNext: false })
    } else {
      wv.stopFindInPage('clearSelection')
    }
  }

  const toggleSearch = () => {
    if (searchVisible) {
      setSearchVisible(false)
      setSearchText('')
      const wv = webviewRefs.current[activeId]
      if (wv) wv.stopFindInPage('clearSelection')
    } else {
      setSearchVisible(true)
      setTimeout(() => searchInputRef.current?.focus(), 80)
    }
  }

  // ── Настройки ────────────────────────────────────────────────────────────────
  const handleSettingsChange = (newSettings) => {
    setSettings(newSettings)
    window.api.invoke('settings:save', newSettings).catch(() => {})
  }

  // ── Извлечение аккаунта из WebView ───────────────────────────────────────────
  const tryExtractAccount = (messengerId, attempt = 0) => {
    if (attempt > 10) return
    const wv = webviewRefs.current[messengerId]
    const messenger = messengers.find(m => m.id === messengerId) ||
      DEFAULT_MESSENGERS.find(m => m.id === messengerId)
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

  // ── Инициализация WebView ref ─────────────────────────────────────────────────
  const setWebviewRef = (el, messengerId) => {
    if (el && !el._chatcenterInit) {
      el._chatcenterInit = true
      webviewRefs.current[messengerId] = el

      el.addEventListener('dom-ready', () => {
        clearTimeout(retryTimers.current[messengerId])
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, 0), 4000
        )
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="flex flex-col h-full bg-[#1a1a2e]">

      {/* ── Шапка: drag-зона + вкладки + кнопки управления ── */}
      <div
        className="flex items-center h-[48px] bg-[#16213e] shrink-0 select-none border-b border-white/10"
        style={{ WebkitAppRegion: 'drag' }}
      >

        {/* Ручка для перетаскивания — визуальный индикатор drag-зоны */}
        <div
          className="flex items-center justify-center w-[28px] h-full shrink-0 cursor-grab"
          title="Перетащить окно"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
            {[0, 6].map(x => [2, 6, 10].map(y => (
              <circle key={`${x}-${y}`} cx={x + 2} cy={y} r={1.2} fill="rgba(255,255,255,0.2)" />
            )))}
          </svg>
        </div>

        {/* Логотип */}
        <div className="pr-3 text-[13px] font-semibold text-white/45 whitespace-nowrap shrink-0">
          ЦентрЧатов
        </div>

        {/* Вкладки — прокручиваемая зона, no-drag */}
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
              onClick={() => handleTabClick(m.id)}
              onClose={() => removeMessenger(m.id)}
            />
          ))}

          {/* Кнопка «Добавить мессенджер» */}
          <button
            onClick={() => setShowAddModal(true)}
            title="Добавить мессенджер"
            className="flex items-center justify-center h-[30px] w-[30px] rounded-lg ml-1
              text-white/25 hover:text-white/65 hover:bg-white/10
              transition-all duration-150 cursor-pointer shrink-0 text-xl leading-none"
          >
            +
          </button>
        </div>

        {/* Правая панель кнопок — no-drag */}
        <div
          className="flex items-center gap-0.5 px-2 shrink-0"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          {/* Кнопка поиска */}
          <button
            onClick={toggleSearch}
            title="Поиск в мессенджере (Ctrl+F)"
            className={`flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px]
              transition-all duration-150 cursor-pointer
              ${searchVisible ? 'bg-white/15 text-white/80' : 'text-white/30 hover:text-white/65 hover:bg-white/10'}`}
          >
            🔍
          </button>

          {/* Кнопка настроек */}
          <button
            onClick={() => setShowSettings(true)}
            title="Настройки"
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[15px]
              text-white/30 hover:text-white/65 hover:bg-white/10
              transition-all duration-150 cursor-pointer"
          >
            ⚙️
          </button>

          {/* Статус IPC + суммарный бейдж */}
          <div className="pl-1 text-xs text-white/25 whitespace-nowrap flex items-center gap-1">
            {ipcStatus}
            {totalUnread > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {totalUnread}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Строка поиска (раскрывается по кнопке) ── */}
      {searchVisible && (
        <div className="flex items-center h-[38px] bg-[#0f172a] border-b border-white/10 px-3 gap-2 shrink-0">
          <span className="text-white/35 text-sm">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') toggleSearch()
              if (e.key === 'Enter') {
                const wv = webviewRefs.current[activeId]
                if (wv && searchText) wv.findInPage(searchText, { findNext: true, forward: !e.shiftKey })
              }
            }}
            placeholder="Поиск в мессенджере... (Enter — следующий, Shift+Enter — предыдущий)"
            className="flex-1 bg-transparent text-sm text-white/80 outline-none placeholder-white/25"
          />
          <button
            onClick={toggleSearch}
            className="text-white/30 hover:text-white/70 text-sm px-1 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Основной layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Область WebView ── */}
        <div className="flex-1 relative overflow-hidden bg-[#1a1a2e]">
          {messengers.length === 0 ? (
            // Пустое состояние — нет мессенджеров
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-white/30 px-8">
                <div className="text-6xl mb-5">💬</div>
                <p className="text-lg font-medium text-white/50 mb-2">Нет мессенджеров</p>
                <p className="text-sm mb-5">Добавьте мессенджер, чтобы начать работу</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-5 py-2 rounded-lg bg-[#2AABEE] text-white text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
                >
                  + Добавить мессенджер
                </button>
              </div>
            </div>
          ) : (
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
                  style={{ width: '100%', height: '100%' }}
                  allowpopups="true"
                />
              </div>
            ))
          )}
        </div>

        {/* ── ИИ-панель ── */}
        <div className="w-[280px] bg-[#16213e] border-l border-white/10 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white/80">ИИ-помощник</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-white/30 text-sm px-4">
              <div className="text-3xl mb-3">🤖</div>
              <p>Откройте чат в мессенджере</p>
              <p className="mt-1">Я предложу варианты ответа</p>
            </div>
          </div>
          <div className="p-3 border-t border-white/10">
            <div className="text-xs text-white/25 text-center">v0.5.0</div>
          </div>
        </div>
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
