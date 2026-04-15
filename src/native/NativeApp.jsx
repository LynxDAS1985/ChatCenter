// v0.87.0: Главный компонент нативного режима «ЦентрЧатов» (Telegram через GramJS)
// Содержит: header с переключателем режимов, sidebar аккаунтов, основную область.
// Режимы: Inbox (чаты) / Contacts (клиенты) / Kanban (доска).
// Стили — AMOLED, изолированы через .native-mode корневой класс.
import { useState } from 'react'
import './styles.css'
import useNativeStore from './store/nativeStore.js'
import LoginModal from './components/LoginModal.jsx'
import InboxMode from './modes/InboxMode.jsx'

const MODES = [
  { id: 'inbox', label: 'Чаты' },
  { id: 'contacts', label: 'Клиенты' },
  { id: 'kanban', label: 'Доска' },
]

export default function NativeApp() {
  const store = useNativeStore()
  const [showLogin, setShowLogin] = useState(false)

  const hasAccounts = store.accounts.length > 0
  const showLoginScreen = showLogin || !!store.loginFlow

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
              title={`${acc.name} ${acc.phone || ''}`}
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
    </div>
  )
}
