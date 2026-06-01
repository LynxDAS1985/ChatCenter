// v0.95.25: модалка «Что нового» — показывается при первом запуске после обновления.
//
// Логика (в App.jsx):
//   - При mount читаем settings.lastSeenVersion
//   - Если !== app version → showModal=true
//   - При закрытии → settings.lastSeenVersion = app version + save
//
// Стандарт UX как у Slack / VS Code / Discord — простая модалка с changelog.

import { useEffect } from 'react'
import { getChangelogSince } from '../utils/changelogData.js'

export default function WhatsNewModal({ prevVersion, currentVersion, onClose }) {
  const entries = getChangelogSince(prevVersion, currentVersion)

  // Закрытие по Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (entries.length === 0) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--amoled-surface, #1a1a2e)',
          border: '1px solid var(--amoled-border, rgba(255,255,255,0.1))',
          borderRadius: 16,
          maxWidth: 560, width: '100%',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, rgba(42,171,238,0.18) 0%, rgba(42,171,238,0.05) 100%)',
          borderBottom: '1px solid var(--amoled-border, rgba(255,255,255,0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amoled-text, #fff)' }}>
              ✨ Что нового
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, color: 'var(--amoled-text, #fff)' }}>
              Версия {currentVersion}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Закрыть (Esc)"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid var(--amoled-border, rgba(255,255,255,0.15))',
              background: 'transparent',
              color: 'var(--amoled-text, #fff)',
              fontSize: 18, cursor: 'pointer',
            }}
          >×</button>
        </div>

        {/* Содержимое — список changelog */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '16px 24px',
          color: 'var(--amoled-text, #fff)',
        }}>
          {entries.map((entry, i) => (
            <div key={entry.version} style={{
              marginBottom: i < entries.length - 1 ? 24 : 0,
              paddingBottom: i < entries.length - 1 ? 20 : 0,
              borderBottom: i < entries.length - 1 ? '1px solid var(--amoled-border, rgba(255,255,255,0.08))' : 'none',
            }}>
              <div style={{
                fontSize: 14, fontWeight: 600,
                color: 'var(--amoled-accent, #2AABEE)',
                marginBottom: 6,
              }}>
                v{entry.version} · {entry.date}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
                {entry.title}
              </div>
              <ul style={{
                listStyle: 'none', padding: 0, margin: 0,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {entry.features.map((feat, idx) => (
                  <li key={idx} style={{
                    fontSize: 14, lineHeight: 1.5,
                    paddingLeft: 12,
                    borderLeft: '2px solid rgba(42,171,238,0.4)',
                    opacity: 0.92,
                  }}>{feat}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--amoled-border, rgba(255,255,255,0.1))',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px', borderRadius: 8,
              border: 'none', background: 'var(--amoled-accent, #2AABEE)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >Понятно</button>
        </div>
      </div>
    </div>
  )
}
