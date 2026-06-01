// v0.95.30: модалка выбора цветовой темы для bubble сообщений.
//
// Открывается из header правой панели (кнопка 🎨, заменяет mode-switcher,
// который переехал в dropdown слева). 5 цветов на выбор + превью bubble
// прямо в модалке. При клике на цвет — мгновенно applyTheme (CSS var) +
// saveTheme (localStorage). Закрывается по Escape / click backdrop / ✕.
//
// Эталоны: Telegram Settings → Color theme, Discord User Settings → Appearance.

import { useEffect } from 'react'
import { THEMES, applyTheme, saveTheme } from '../utils/themeColor.js'

export default function ThemePickerModal({ activeThemeId, onSelect, onClose }) {
  // Escape закрывает модалку (как все наши модалки)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSelect = (theme) => {
    applyTheme(theme)
    saveTheme(theme.id)
    onSelect?.(theme.id)
  }

  return (
    <div
      className="theme-picker-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="theme-picker-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--amoled-surface)',
          border: '1px solid var(--amoled-border)',
          borderRadius: 14,
          padding: 24,
          minWidth: 360,
          maxWidth: 460,
          color: 'var(--amoled-text)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🎨 Цвет сообщений</h3>
          <button
            onClick={onClose}
            title="Закрыть"
            style={{
              background: 'transparent', color: 'var(--amoled-text-dim)',
              padding: '4px 8px', borderRadius: 6, fontSize: 18,
            }}
          >✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {THEMES.map(theme => (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme)}
              className="theme-picker-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px',
                background: theme.id === activeThemeId ? 'var(--amoled-surface-hover)' : 'transparent',
                border: theme.id === activeThemeId
                  ? `1px solid ${theme.accent}`
                  : '1px solid var(--amoled-border)',
                borderRadius: 10,
                color: 'var(--amoled-text)',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              {/* Превью bubble — кружок с цветом темы */}
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: theme.accent,
                boxShadow: `0 0 12px ${theme.shadow}`,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{theme.label}</div>
                <div style={{ fontSize: 11, color: 'var(--amoled-text-dim)', marginTop: 2 }}>
                  {theme.description}
                </div>
              </div>
              {theme.id === activeThemeId && (
                <span style={{ color: theme.accent, fontSize: 18 }} title="Выбрано">✓</span>
              )}
            </button>
          ))}
        </div>
        <div style={{
          marginTop: 16, padding: '10px 12px',
          background: 'var(--amoled-surface-hover)',
          borderRadius: 8,
          fontSize: 11, color: 'var(--amoled-text-dim)',
          lineHeight: 1.5,
        }}>
          💡 Цвет применяется мгновенно ко всем вашим сообщениям. Настройка
          сохраняется только в этом приложении (на этом компьютере).
        </div>
      </div>
    </div>
  )
}
