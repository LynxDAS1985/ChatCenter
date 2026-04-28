// v0.87.0: Главный компонент нативного режима «ЦентрЧатов» (Telegram через GramJS)
// Содержит: header с переключателем режимов, sidebar аккаунтов, основную область.
// Режимы: Inbox (чаты) / Contacts (клиенты) / Kanban (доска).
// Стили — AMOLED, изолированы через .native-mode корневой класс.
import { useState, useEffect } from 'react'
import './styles.css'
import useNativeStore from './store/nativeStore.js'
import LoginModal from './components/LoginModal.jsx'
import InboxMode from './modes/InboxMode.jsx'
import AccountContextMenu from './components/AccountContextMenu.jsx'

const MODES = [
  { id: 'inbox', label: 'Чаты' },
  { id: 'contacts', label: 'Клиенты' },
  { id: 'kanban', label: 'Доска' },
]

export default function NativeApp() {
  const store = useNativeStore()
  const [showLogin, setShowLogin] = useState(false)
  // v0.87.88: ПКМ-меню аккаунта { account, x, y } или null
  const [accountMenu, setAccountMenu] = useState(null)
  // v0.87.95: toast после успешного выхода — { message, ts }
  const [logoutToast, setLogoutToast] = useState(null)

  const hasAccounts = store.accounts.length > 0
  const showLoginScreen = showLogin || !!store.loginFlow

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
      <div className="native-header">
        <div className="native-header__brand">ЦентрЧатов</div>
        <div className="native-mode-switcher">
          {MODES.map(m => (
            <button
              key={m.id}
              className={`native-mode-switcher__btn ${store.mode === m.id ? 'native-mode-switcher__btn--active' : ''}`}
              onClick={() => store.setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="native-content">
        <div className="native-sidebar">
          {store.accounts.map(acc => (
            <div
              key={acc.id}
              className={`native-account ${store.activeAccountId === acc.id ? 'native-account--active' : ''}`}
              onClick={() => store.setActiveAccount(acc.id)}
              onContextMenu={(e) => handleAccountContextMenu(e, acc)}
              title={`${acc.name} ${acc.phone || ''} — ПКМ для меню`}
            >
              {(acc.name || '?').slice(0, 2).toUpperCase()}
              <div className={`native-account__dot native-account__dot--${
                acc.status === 'connected' ? 'ok' :
                acc.status === 'error' ? 'err' : 'off'
              }`} />
            </div>
          ))}
          <div
            className="native-account native-account__add"
            onClick={() => setShowLogin(true)}
            title="Добавить аккаунт"
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
            <InboxMode store={store} />
          ) : (
            <div className="native-empty">
              <div className="native-empty__icon">🚧</div>
              <div className="native-empty__title">Режим «{MODES.find(m => m.id === store.mode)?.label}»</div>
              <div className="native-empty__text">
                UI в разработке.<br />
                Пока доступен только режим «Чаты».
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
