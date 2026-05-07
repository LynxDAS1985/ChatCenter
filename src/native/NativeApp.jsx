// v0.87.0: Главный компонент нативного режима «ЦентрЧатов» (Telegram через GramJS)
// Содержит: header с переключателем режимов, sidebar аккаунтов, основную область.
// Режимы: Inbox (чаты) / Contacts (клиенты) / Kanban (доска).
// Стили — AMOLED, изолированы через .native-mode корневой класс.
// v0.87.106 (multi-account UI): круглые аватарки с фото, иконка мессенджера ✈️ в углу,
// зелёная точка-индикатор онлайн, бейдж непрочитанных. БЕЗ яркой подсветки активного.
// + hover на аккаунте → подсветка его чатов в списке (Улучшение 1).
import { useState, useEffect, useMemo } from 'react'
import './styles.css'
import useNativeStore from './store/nativeStore.js'
import LoginModal from './components/LoginModal.jsx'
import InboxMode from './modes/InboxMode.jsx'
import AccountContextMenu from './components/AccountContextMenu.jsx'

try { window.__ccStartupMark?.('module:NativeApp', 'module evaluated after native static imports') } catch {}

const MODES = [
  { id: 'inbox', label: 'Чаты' },
  { id: 'contacts', label: 'Клиенты' },
  { id: 'kanban', label: 'Доска' },
]

// v0.87.106: фирменные цвета мессенджеров (ADR-016).
// Используются для углового маркера на аватарке + полосы слева у чатов.
const MESSENGER_COLORS = {
  telegram: '#2AABEE',
  whatsapp: '#25D366',
  vk: '#0077FF',
  max: '#7B3FE4',
  viber: '#7360F2',
}

// v0.87.106: emoji-маркер мессенджера для углового бейджа на аватарке
const MESSENGER_EMOJI = {
  telegram: '✈️',
  whatsapp: '💬',
  vk: '🔵',
  max: '💎',
  viber: '🟣',
}

// v0.87.106: круглый аватар аккаунта в sidebar.
// 48px фото (или инициалы), угловая иконка мессенджера, зелёная точка онлайн,
// красный бейдж непрочитанных. Tooltip при hover.
function AccountAvatar({ account, unreadCount, onClick, onContextMenu, onMouseEnter, onMouseLeave }) {
  const initials = (account.name || '?').split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '').join('') || '?'
  const messenger = account.messenger || 'telegram'
  const color = MESSENGER_COLORS[messenger] || MESSENGER_COLORS.telegram
  const emoji = MESSENGER_EMOJI[messenger] || '💬'
  const tooltip = `${emoji} ${messenger.charAt(0).toUpperCase() + messenger.slice(1)} · ${account.name}` +
    (account.phone ? `\n${account.phone}` : '') +
    (unreadCount > 0 ? `\n${unreadCount} непрочитанных` : '')

  return (
    <div
      className="account-avatar-wrap"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={tooltip}
      style={{
        position: 'relative',
        width: 56,
        marginBottom: 12,
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      <div
        className="account-avatar-circle"
        style={{
          position: 'relative',
          width: 48,
          height: 48,
          margin: '0 auto',
          borderRadius: '50%',
          background: account.avatar ? `url("${account.avatar}") center/cover no-repeat` : color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 16,
          fontWeight: 600,
          transition: 'transform 0.15s',
        }}
      >
        {!account.avatar && initials}
        {/* Угловая иконка мессенджера в правом верхнем углу */}
        <span style={{
          position: 'absolute',
          top: -2,
          right: -2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'var(--amoled-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          border: `1px solid ${color}`,
        }}>{emoji}</span>
        {/* Зелёная точка-индикатор онлайн (правый нижний угол) */}
        {account.status === 'connected' && (
          <span style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--amoled-success)',
            border: '2px solid var(--amoled-bg)',
          }} />
        )}
        {/* Красный бейдж непрочитанных (поверх, левый верхний угол) */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            left: -4,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 9,
            background: 'var(--amoled-danger)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--amoled-bg)',
          }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </div>
      <div style={{
        marginTop: 4,
        fontSize: 11,
        color: 'var(--amoled-text-dim)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        padding: '0 2px',
      }}>{account.name}</div>
    </div>
  )
}

export default function NativeApp() {
  try {
    if (!window.__ccNativeAppFirstRenderLogged) {
      window.__ccNativeAppFirstRenderLogged = true
      window.__ccStartupMark?.('component:NativeApp', 'first render start')
    }
  } catch {}
  const store = useNativeStore()
  const [showLogin, setShowLogin] = useState(false)
  // v0.87.88: ПКМ-меню аккаунта { account, x, y } или null
  const [accountMenu, setAccountMenu] = useState(null)
  // v0.87.95: toast после успешного выхода — { message, ts }
  const [logoutToast, setLogoutToast] = useState(null)
  // v0.87.106 Улучшение 1: hover на аккаунте → подсвечиваем его чаты в списке
  const [hoveredAccountId, setHoveredAccountId] = useState(null)

  // v0.87.106: подсчёт непрочитанных по аккаунтам (для бейджей)
  const unreadByAccount = useMemo(() => {
    const map = {}
    for (const c of store.chats) {
      if (!c.accountId) continue
      map[c.accountId] = (map[c.accountId] || 0) + (c.unreadCount || 0)
    }
    return map
  }, [store.chats])

  const hasAccounts = store.accounts.length > 0
  const showLoginScreen = showLogin || !!store.loginFlow

  useEffect(() => {
    try {
      window.__ccStartupMark?.(
        'component:NativeApp',
        `mounted accounts=${store.accounts.length} chats=${store.chats.length} active=${store.activeAccountId || 'none'} loginFlow=${!!store.loginFlow}`
      )
      window.__ccStartupSummary?.('NativeApp-mounted')
    } catch {}
  }, [])

  const handleAccountContextMenu = (e, account) => {
    e.preventDefault()
    setAccountMenu({ account, x: e.clientX, y: e.clientY })
  }

  // v0.87.95: после удаления аккаунта показываем toast «Освобождено N МБ»
  // store.lastWipe устанавливается в handler tg:account-update {removed:true}
  useEffect(() => {
    if (!store.lastWipe) return
    const mb = (store.lastWipe.totalBytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')
    setLogoutToast({
      message: `✅ Аккаунт удалён. Освобождено ${mb} МБ`,
      ts: Date.now(),
    })
    const t = setTimeout(() => setLogoutToast(null), 4000)
    return () => clearTimeout(t)
  }, [store.lastWipe?.totalBytes])

  return (
    <div className="native-mode">
      <div className="native-content">
        <div className="native-sidebar" style={{ width: 76 }}>
          {/* v0.87.106: круглые аватарки + ✈️ + точка онлайн + бейдж непрочит. БЕЗ яркой подсветки активного. */}
          {store.accounts.map(acc => (
            <AccountAvatar
              key={acc.id}
              account={acc}
              unreadCount={unreadByAccount[acc.id] || 0}
              onClick={() => store.setActiveAccount(acc.id)}
              onContextMenu={(e) => handleAccountContextMenu(e, acc)}
              onMouseEnter={() => setHoveredAccountId(acc.id)}
              onMouseLeave={() => setHoveredAccountId(null)}
            />
          ))}
          <div
            className="native-account native-account__add"
            onClick={() => setShowLogin(true)}
            title="Добавить аккаунт"
            style={{ width: 48, height: 48, margin: '0 auto' }}
          >+</div>
        </div>

        <div className="native-main">
          {showLoginScreen ? (
            <LoginModal
              onClose={() => setShowLogin(false)}
              startLogin={store.startLogin}
              submitCode={store.submitCode}
              submitPassword={store.submitPassword}
              cancelLogin={store.cancelLogin}
              loginFlow={store.loginFlow}
            />
          ) : !hasAccounts ? (
            <div className="native-empty">
              <div className="native-empty__icon">💬</div>
              <div className="native-empty__title">Нет подключённых аккаунтов</div>
              <div className="native-empty__text">
                Подключите Telegram чтобы начать работу.<br />
                Ваши сообщения будут приходить в единый интерфейс с AI-помощником.
              </div>
              <button className="native-btn" onClick={() => setShowLogin(true)}>
                + Подключить Telegram
              </button>
            </div>
          ) : store.mode === 'inbox' ? (
            <InboxMode store={store} hoveredAccountId={hoveredAccountId} modes={MODES} />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{
                height: 48, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                padding: '0 16px',
                borderBottom: '1px solid var(--amoled-border)',
                background: 'var(--amoled-surface)', flexShrink: 0, gap: 4,
              }}>
                {MODES.map(m => (
                  <button
                    key={m.id}
                    className={`native-mode-switcher__btn ${store.mode === m.id ? 'native-mode-switcher__btn--active' : ''}`}
                    onClick={() => store.setMode(m.id)}
                  >{m.label}</button>
                ))}
              </div>
              <div className="native-empty">
                <div className="native-empty__icon">🚧</div>
                <div className="native-empty__title">Режим «{MODES.find(m => m.id === store.mode)?.label}»</div>
                <div className="native-empty__text">
                  UI в разработке.<br />
                  Пока доступен только режим «Чаты».
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* v0.87.88: меню аккаунта по ПКМ */}
      {accountMenu && (
        <AccountContextMenu
          account={accountMenu.account}
          x={accountMenu.x}
          y={accountMenu.y}
          onClose={() => setAccountMenu(null)}
          onLogout={store.removeAccount}
          getCleanupStats={store.getCleanupStats}
        />
      )}

      {/* v0.87.95: toast «Освобождено N МБ» после успешного выхода */}
      {logoutToast && (
        <div className="native-toast native-toast--success" style={{
          animation: 'native-menu-popin 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          {logoutToast.message}
        </div>
      )}
    </div>
  )
}
