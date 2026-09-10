// v1.2.148: вынесено из NativeApp.jsx (был на 93% лимита строк) — переключатель
// содержимого главной области native-режима: экран входа / нет аккаунтов / чаты /
// заглушка «режим в разработке». Поведение НЕ изменено, только перенос JSX.
import LoginModal from './LoginModal.jsx'
import InboxMode from '../modes/InboxMode.jsx'
import ErrorBoundary from '../../components/ErrorBoundary.jsx'
// v1.2.447: полоса «нет связи» для «Общего чата» (рисуется ПОВЕРХ, см. её файл).
import NativeConnectionStrip from './NativeConnectionStrip.jsx'

export default function NativeMainContent({
  showLoginScreen, store, hasAccounts, hoveredAccountId, modes, onOpenLogin, onCloseLogin,
}) {
  return (
    <div className="native-main">
      {/* v1.2.447: пока связи нет — понятная полоса вместо молча замершего списка чатов. */}
      {!showLoginScreen && hasAccounts && <NativeConnectionStrip onCheck={store.checkConnection} />}
      {showLoginScreen ? (
        <LoginModal
          // v1.2.147: onCloseLogin сбрасывает «признак входа» (см. NativeApp) —
          // иначе залипший success держит пустой экран входа поверх чатов.
          onClose={onCloseLogin}
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
          <button className="native-btn" onClick={onOpenLogin}>
            + Подключить Telegram
          </button>
        </div>
      ) : store.mode === 'inbox' ? (
        // v1.2.143 (диаг+страховка): «аварийная табличка» вокруг списка чатов —
        // при падении отрисовки вместо чёрного экрана красная рамка + запись в лог.
        <ErrorBoundary name="NativeInbox">
          <InboxMode store={store} hoveredAccountId={hoveredAccountId} modes={modes} />
        </ErrorBoundary>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            height: 48, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            padding: '0 16px',
            borderBottom: '1px solid var(--amoled-border)',
            background: 'var(--amoled-surface)', flexShrink: 0, gap: 4,
          }}>
            {modes.map(m => (
              <button
                key={m.id}
                className={`native-mode-switcher__btn ${store.mode === m.id ? 'native-mode-switcher__btn--active' : ''}`}
                onClick={() => store.setMode(m.id)}
              >{m.label}</button>
            ))}
          </div>
          <div className="native-empty">
            <div className="native-empty__icon">🚧</div>
            <div className="native-empty__title">Режим «{modes.find(m => m.id === store.mode)?.label}»</div>
            <div className="native-empty__text">
              UI в разработке.<br />
              Пока доступен только режим «Чаты».
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
