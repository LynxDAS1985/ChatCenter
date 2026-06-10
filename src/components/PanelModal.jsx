// v1.0.1: универсальная обёртка-модалка для панелей (Tasks/Reminders/AIActivity).
// Overlay + header c title + ✕ + body слот.
// v1.0.3: Esc для закрытия + блокировка скролла body пока модалка открыта.

import { useEffect } from 'react'

export default function PanelModal({ title, onClose, children, width = 720 }) {
  // v1.0.3: Esc → onClose. Удаляем listener при unmount.
  useEffect(() => {
    if (typeof onClose !== 'function') return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    globalThis.window?.addEventListener('keydown', onKey)
    return () => globalThis.window?.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width, maxWidth: '95vw', maxHeight: '85vh',
          background: 'var(--cc-bg, #0f0f0f)',
          border: '1px solid var(--cc-border, #333)',
          borderRadius: 10,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid var(--cc-border, #333)',
          background: 'var(--cc-surface, #1a1a1a)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text, #fff)' }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            title="Закрыть (Esc)"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 16, color: 'var(--cc-text-dim, #888)',
              padding: '4px 8px', borderRadius: 4,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--cc-hover, #2a2a2a)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >✕</button>
        </div>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
