// v0.95.30: dropdown «Чаты / Клиенты / Доска» в стиле Telegram Desktop.
//
// Раньше: 3 кнопки горизонтальным tab-bar в header правой панели (над сообщениями).
// Теперь: dropdown ВВЕРХУ списка чатов слева (как Slack workspace switcher и Telegram folder).
//
// Поведение:
// - Закрытая: ▾ + текущий режим (Чаты / Клиенты / Доска)
// - Открытая: меню с 3 пунктами, выделенный — активный
// - Закрывается: клик мимо (document mousedown), Escape, выбор пункта
//
// Эталоны: Telegram Desktop folder dropdown, Slack workspace, Discord server switch.

import { useEffect, useRef, useState } from 'react'

export default function ChatTypesDropdown({ modes, activeId, onSelect }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // Клик мимо закрывает (как Telegram Desktop)
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!modes || modes.length === 0) return null
  const active = modes.find(m => m.id === activeId) || modes[0]

  return (
    <div ref={rootRef} className="chat-types-dropdown" style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="chat-types-dropdown__toggle"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '8px 12px',
          background: open ? 'var(--amoled-surface-hover)' : 'var(--amoled-surface)',
          border: '1px solid var(--amoled-border)',
          borderRadius: 8,
          color: 'var(--amoled-text)',
          fontSize: 13, fontWeight: 500,
          transition: 'all 0.15s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{active.icon || '💬'}</span>
          <span>{active.label}</span>
        </span>
        <span style={{
          fontSize: 10, color: 'var(--amoled-text-dim)',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.15s',
        }}>▼</span>
      </button>
      {open && (
        <div
          className="chat-types-dropdown__menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--amoled-surface)',
            border: '1px solid var(--amoled-border)',
            borderRadius: 8,
            padding: 4,
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => { onSelect?.(m.id); setOpen(false) }}
              className="chat-types-dropdown__item"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 10px',
                background: m.id === activeId ? 'var(--amoled-accent)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                color: m.id === activeId ? '#fff' : 'var(--amoled-text)',
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14 }}>{m.icon || '💬'}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
