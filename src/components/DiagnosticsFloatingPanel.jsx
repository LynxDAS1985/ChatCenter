import { useState } from 'react'

const css = {
  panel: {
    position: 'fixed',
    right: 16,
    bottom: 16,
    width: 360,
    maxWidth: 'calc(100vw - 32px)',
    zIndex: 1000000,
    border: '1px solid var(--cc-border)',
    borderLeft: '4px solid #38bdf8',
    borderRadius: 10,
    background: 'rgba(17,24,39,0.96)',
    color: 'var(--cc-text)',
    boxShadow: '0 18px 48px rgba(0,0,0,0.42)',
    overflow: 'hidden',
  },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderBottom: '1px solid var(--cc-border)' },
  body: { padding: 10, display: 'grid', gap: 8 },
  row: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  button: { border: '1px solid var(--cc-border)', borderRadius: 8, background: 'rgba(255,255,255,0.07)', color: 'var(--cc-text)', padding: '6px 8px', fontSize: 12, cursor: 'pointer' },
  primary: { border: '1px solid rgba(56,189,248,0.6)', borderRadius: 8, background: 'rgba(56,189,248,0.16)', color: '#7dd3fc', padding: '6px 8px', fontSize: 12, cursor: 'pointer' },
  danger: { border: '1px solid rgba(248,113,113,0.45)', borderRadius: 8, background: 'rgba(248,113,113,0.1)', color: '#fca5a5', padding: '6px 8px', fontSize: 12, cursor: 'pointer' },
  muted: { color: 'var(--cc-text-dimmer)', fontSize: 12 },
  event: { borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6, fontSize: 12, lineHeight: 1.35 },
}

function Button({ kind, onClick, children, title }) {
  const [hover, setHover] = useState(false)
  const base = kind === 'primary' ? css.primary : kind === 'danger' ? css.danger : css.button
  return <button
    type="button"
    title={title}
    onClick={onClick}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
    style={{ ...base, filter: hover ? 'brightness(1.14)' : 'none', transform: hover ? 'translateY(-1px)' : 'none', transition: '120ms ease' }}
  >{children}</button>
}

function markerColor(event) {
  if (event.marker === 'red' || event.severity === 'critical') return '#f87171'
  if (event.marker === 'yellow' || event.severity === 'warning') return '#fbbf24'
  return '#7dd3fc'
}

export default function DiagnosticsFloatingPanel({ session, onStart, onPause, onResume, onStop, onExpand, onSave, onCopy, onClear, onCloseAll }) {
  if (!session?.active && !session?.events?.length) return null
  const status = session.active ? (session.paused ? 'пауза' : 'запись') : 'остановлена'
  const latest = (session.events || []).slice(-5).reverse()

  return (
    <div style={css.panel}>
      <div style={css.header}>
        <b style={{ fontSize: 14 }}>Диагностика</b>
        <span style={{ ...css.muted, marginRight: 'auto' }}>{status} · {session.summary?.events || 0}</span>
        <Button onClick={onExpand}>Развернуть</Button>
        <Button kind="danger" onClick={onCloseAll} title="Остановить и скрыть диагностику полностью">Закрыть</Button>
      </div>
      <div style={css.body}>
        <div style={css.row}>
          {!session.active && <Button kind="primary" onClick={onStart}>Запустить</Button>}
          {session.active && !session.paused && <Button onClick={onPause}>Пауза</Button>}
          {session.active && session.paused && <Button kind="primary" onClick={onResume}>Продолжить</Button>}
          {session.active && <Button kind="danger" onClick={onStop}>Стоп</Button>}
          <Button onClick={onSave}>Сохранить</Button>
          <Button onClick={onCopy}>Скопировать</Button>
          <Button onClick={onClear}>Очистить</Button>
        </div>
        <div style={css.row}>
          <span style={css.muted}>Глубокая WebView включена всегда · {session.lastSavedPath ? 'отчёт сохранён' : 'автосохранение при стопе'}</span>
        </div>
        {session.lastError && <div style={{ color: '#f87171', fontSize: 12 }}>{session.lastError}</div>}
        <div>
          {latest.length ? latest.map(event => (
            <div key={event.id || `${event.ts}-${event.title}`} style={css.event}>
              <div style={{ color: markerColor(event), fontWeight: 700 }}>{event.title || event.kind}</div>
              <div style={css.muted}>{event.text || event.detail || 'без текста'}</div>
            </div>
          )) : <div style={css.muted}>Жду первые события: __CC_NOTIF__, fallback, ribbon, звук, avatar.</div>}
        </div>
      </div>
    </div>
  )
}
