// v0.87.109: контекстное меню заглушения уведомлений чата.
// Времена как в Telegram: На час / На 4 часа / На 8 часов / На 1 день / На 3 дня / Навсегда.
// Если чат уже заглушён — первым пунктом «Включить уведомления».
import { useEffect, useRef } from 'react'

const MUTE_OPTIONS = [
  { label: 'На час',     seconds: 3600 },
  { label: 'На 4 часа',  seconds: 14400 },
  { label: 'На 8 часов', seconds: 28800 },
  { label: 'На 1 день',  seconds: 86400 },
  { label: 'На 3 дня',   seconds: 259200 },
  { label: 'Навсегда',   seconds: 2147483647 },
]

export default function MuteMenu({ chat, x, y, onClose, onSetMute }) {
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const closeKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeKey)
    }
  }, [onClose])

  // Сдвигаем меню если выходит за правый/нижний край экрана
  const menuW = 200
  const menuH = (MUTE_OPTIONS.length + 2) * 38 + 36
  const left = Math.min(x, window.innerWidth - menuW - 8)
  const top = Math.min(y, window.innerHeight - menuH - 8)

  const handleMute = async (seconds) => {
    const until = seconds === 2147483647 ? 2147483647 : Math.floor(Date.now() / 1000) + seconds
    await onSetMute(chat.id, until)
    onClose()
  }

  const handleUnmute = async () => {
    await onSetMute(chat.id, 0)
    onClose()
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        background: 'var(--amoled-surface)',
        border: '1px solid var(--amoled-border)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        minWidth: menuW,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div style={{
        padding: '8px 14px 6px',
        fontSize: 11,
        color: 'var(--amoled-text-dim)',
        borderBottom: '1px solid var(--amoled-border)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        🔕 {chat.title}
      </div>

      {chat.isMuted && (
        <Item onClick={handleUnmute} color="var(--amoled-success)">
          🔔 Включить уведомления
        </Item>
      )}

      {MUTE_OPTIONS.map(opt => (
        <Item key={opt.seconds} onClick={() => handleMute(opt.seconds)}>
          {opt.label}
        </Item>
      ))}
    </div>
  )
}

function Item({ children, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '9px 14px',
        background: 'transparent',
        color: color || 'var(--amoled-text)',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        textAlign: 'left',
        fontSize: 13,
        cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >{children}</button>
  )
}
