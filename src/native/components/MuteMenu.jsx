// v0.87.109: контекстное меню заглушения уведомлений чата.
// v0.87.110: двухуровневое меню — main → times (как в Telegram desktop).
// Шаг 1 (main): «Выключить звук ›» или «🔔 Включить» + «Выключить звук ›».
// Шаг 2 (times): «‹ Назад» + выбор времени.
import { useEffect, useRef, useState } from 'react'

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
  const [step, setStep] = useState('main')

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const closeKey = (e) => { if (e.key === 'Escape') { if (step === 'times') setStep('main'); else onClose() } }
    // v0.89.38: pointerdown (W3C) вместо mousedown — поддержка mouse/touch/pen.
    // v0.89.39: AbortController — один cleanup вместо 2 removeEventListener вызовов.
    const ac = new AbortController()
    document.addEventListener('pointerdown', close, { signal: ac.signal })
    document.addEventListener('keydown', closeKey, { signal: ac.signal })
    return () => ac.abort()
  }, [onClose, step])

  const menuW = 210
  const left = Math.min(x, window.innerWidth - menuW - 8)
  const top = Math.min(y, window.innerHeight - 320)

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
    <div ref={ref} style={{
      position: 'fixed', left, top, zIndex: 9999,
      background: 'var(--amoled-surface)',
      border: '1px solid var(--amoled-border)',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      minWidth: menuW, overflow: 'hidden', userSelect: 'none',
    }}>
      {/* Шапка */}
      <div style={{
        padding: '8px 14px 6px', fontSize: 11,
        color: 'var(--amoled-text-dim)',
        borderBottom: '1px solid var(--amoled-border)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {step === 'times' ? (
          <span
            style={{ cursor: 'pointer', color: 'var(--amoled-accent)' }}
            onClick={() => setStep('main')}
          >‹ Назад</span>
        ) : (
          <>🔕 {chat.title}</>
        )}
      </div>

      {step === 'main' ? (
        <>
          {chat.isMuted && (
            <Item onClick={handleUnmute} color="var(--amoled-success)">
              🔔 Включить уведомления
            </Item>
          )}
          <Item onClick={() => setStep('times')} arrow>
            {chat.isMuted ? 'Изменить время' : '🔕 Выключить уведомления'}
          </Item>
        </>
      ) : (
        MUTE_OPTIONS.map(opt => (
          <Item key={opt.seconds} onClick={() => handleMute(opt.seconds)}>
            {opt.label}
          </Item>
        ))
      )}
    </div>
  )
}

function Item({ children, onClick, color, arrow }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '9px 14px',
        background: 'transparent',
        color: color || 'var(--amoled-text)',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        textAlign: 'left', fontSize: 13, cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span>{children}</span>
      {arrow && <span style={{ opacity: 0.5, fontSize: 11 }}>›</span>}
    </button>
  )
}
