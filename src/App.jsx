// v0.4 — фирменные цвета вкладок + извлечение информации об аккаунте
import { useState, useEffect, useRef } from 'react'

const DEFAULT_MESSENGERS = [
  {
    id: 'telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/k/',
    color: '#2AABEE',
    partition: 'persist:telegram',
    // Пробуем несколько известных селекторов Telegram Web K
    accountScript: `(() => {
      const sels = [
        '.sidebar-left-section .peer-title',
        '.user-title',
        '.profile-title',
        '.chat-info .peer-title',
        '.info .peer-title'
      ];
      for (const s of sels) {
        const t = document.querySelector(s)?.textContent?.trim();
        if (t && t.length > 0) return t;
      }
      return null;
    })()`
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    color: '#25D366',
    partition: 'persist:whatsapp',
    accountScript: `(() => {
      const sels = [
        '[data-testid="profile-details-header-name"]',
        '[data-testid="user-preferred-name"]',
        '.copyable-text[data-pre-plain-text] span',
        'header ._3ko75 ._1JDNF'
      ];
      for (const s of sels) {
        const t = document.querySelector(s)?.textContent?.trim();
        if (t && t.length > 0) return t;
      }
      return null;
    })()`
  },
  {
    id: 'vk',
    name: 'ВКонтакте',
    url: 'https://vk.com/im',
    color: '#4C75A3',
    partition: 'persist:vk',
    accountScript: `(() => {
      const sels = [
        '.TopNavBtn__title',
        '.header__top--uname',
        '.vkuiSimpleCell__content .vkuiTypography--weight-1',
        '.Profile__name'
      ];
      for (const s of sels) {
        const t = document.querySelector(s)?.textContent?.trim();
        if (t && t.length > 0) return t;
      }
      return null;
    })()`
  }
]

export default function App() {
  const [messengers] = useState(DEFAULT_MESSENGERS)
  const [activeId, setActiveId] = useState('telegram')
  const [ipcStatus, setIpcStatus] = useState('проверка...')
  const [accountInfo, setAccountInfo] = useState({})   // { telegram: 'John', whatsapp: 'Alice', ... }
  const webviewRefs = useRef({})
  const retryTimers = useRef({})

  useEffect(() => {
    if (window.api) {
      window.api.invoke('app:ping')
        .then(result => setIpcStatus(result.ok ? '✅ IPC' : '❌ IPC'))
        .catch(() => setIpcStatus('❌ IPC'))
    } else {
      setIpcStatus('❌ api')
    }
  }, [])

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      Object.values(retryTimers.current).forEach(t => clearTimeout(t))
    }
  }, [])

  // Попытка извлечь имя/аккаунт из WebView (с повторами)
  const tryExtractAccount = (messengerId, attempt = 0) => {
    if (attempt > 10) return  // макс. ~30 сек попыток

    const wv = webviewRefs.current[messengerId]
    const messenger = DEFAULT_MESSENGERS.find(m => m.id === messengerId)
    if (!wv || !messenger) return

    wv.executeJavaScript(messenger.accountScript)
      .then(result => {
        if (result && result.length > 0 && result.length < 100) {
          setAccountInfo(prev => ({ ...prev, [messengerId]: result }))
        } else {
          // Повтор через 4 секунды
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

  // Вешаем обработчик dom-ready на webview через ref (не через JSX props)
  const setWebviewRef = (el, messengerId) => {
    if (el && !el._chatcenterInit) {
      el._chatcenterInit = true
      webviewRefs.current[messengerId] = el

      el.addEventListener('dom-ready', () => {
        // Ждём 4 сек. после загрузки DOM — мессенджеры рендерятся асинхронно
        clearTimeout(retryTimers.current[messengerId])
        retryTimers.current[messengerId] = setTimeout(
          () => tryExtractAccount(messengerId, 0), 4000
        )
      })
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#1a1a2e]">

      {/* ── Заголовок + вкладки (одна строка, drag-зона) ── */}
      <div
        className="flex items-center h-[48px] bg-[#16213e] shrink-0 select-none border-b border-white/10"
        style={{ WebkitAppRegion: 'drag' }}
      >
        {/* Логотип */}
        <div className="px-3 text-sm font-semibold text-white/60 whitespace-nowrap shrink-0">
          ЦентрЧатов
        </div>

        {/* Вкладки мессенджеров */}
        <div
          className="flex items-center gap-0.5 flex-1 overflow-x-auto h-full px-1"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          {messengers.map(m => {
            const isActive = activeId === m.id
            const info = accountInfo[m.id]

            return (
              <button
                key={m.id}
                onClick={() => setActiveId(m.id)}
                title={info ? `${m.name} — ${info}` : m.name}
                className="flex items-center gap-2 h-[40px] px-3 cursor-pointer shrink-0 transition-all duration-150"
                style={{
                  backgroundColor: isActive ? `${m.color}1A` : 'transparent',
                  borderBottom: isActive ? `2px solid ${m.color}` : '2px solid transparent',
                  borderRadius: '6px 6px 0 0',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {/* Цветной индикатор-точка */}
                <span
                  className="w-2 h-2 rounded-full shrink-0 transition-all duration-150"
                  style={{ backgroundColor: isActive ? m.color : `${m.color}55` }}
                />

                {/* Блок: название + аккаунт */}
                <span className="flex flex-col items-start leading-tight">
                  <span
                    className="text-sm font-medium whitespace-nowrap transition-colors duration-150"
                    style={{ color: isActive ? m.color : 'rgba(255,255,255,0.45)' }}
                  >
                    {m.name}
                  </span>
                  {info && (
                    <span
                      className="text-[10px] whitespace-nowrap max-w-[110px] overflow-hidden text-ellipsis leading-tight"
                      style={{ color: isActive ? `${m.color}AA` : 'rgba(255,255,255,0.25)' }}
                    >
                      {info}
                    </span>
                  )}
                </span>
              </button>
            )
          })}

          {/* Кнопка + добавить */}
          <button
            title="Добавить мессенджер"
            className="flex items-center justify-center h-[30px] w-[30px] rounded-lg ml-1
              text-white/25 hover:text-white/60 hover:bg-white/10
              transition-all duration-150 cursor-pointer shrink-0 text-xl leading-none"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            +
          </button>
        </div>

        {/* Статус IPC */}
        <div className="px-3 text-xs text-white/25 shrink-0 whitespace-nowrap">
          {ipcStatus}
        </div>
      </div>

      {/* ── Основной layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Область WebView ── */}
        <div className="flex-1 relative overflow-hidden bg-white">
          {messengers.map(m => (
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
          ))}
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
            <div className="text-xs text-white/30 text-center">v0.4.0</div>
          </div>
        </div>
      </div>
    </div>
  )
}
