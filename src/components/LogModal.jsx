// v0.84.2: Модальное окно лога — фильтры по уровням, копирование, авто-обновление
import { useState, useEffect, useRef } from 'react'

const LEVEL_COLORS = {
  ERROR: '#ff4444',
  WARN: '#f59e0b',
  INFO: '#22c55e',
  DEBUG: '#6b7280',
  'R:ERROR': '#ff4444',
  'R:INFO': '#2AABEE',
  'R:WARN': '#f59e0b',
}

function parseLogLine(line) {
  const m = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/)
  if (!m) return null
  return { ts: m[1], level: m[2], text: m[3] }
}

export default function LogModal({ content, onClose, onRefresh }) {
  const [filter, setFilter] = useState('all')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef(null)

  const lines = (content || '').split('\n').map(parseLogLine).filter(Boolean)

  const filtered = filter === 'all' ? lines
    : filter === 'error' ? lines.filter(l => l.level.includes('ERROR'))
    : filter === 'warn' ? lines.filter(l => l.level.includes('WARN'))
    : filter === 'info' ? lines.filter(l => l.level === 'INFO' || l.level === 'R:INFO')
    : filter === 'debug' ? lines.filter(l => l.level === 'DEBUG')
    : lines

  useEffect(() => {
    if (!autoRefresh) return
    const iv = setInterval(() => { if (onRefresh) onRefresh() }, 3000)
    return () => clearInterval(iv)
  }, [autoRefresh, onRefresh])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [filtered.length])

  const handleCopy = () => {
    const text = filtered.map(l => `[${l.ts}] [${l.level}] ${l.text}`).join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '90%', maxWidth: 900, height: '80%',
        backgroundColor: 'var(--cc-bg, #1a1b2e)',
        border: '1px solid var(--cc-border, #2a2b3e)',
        borderRadius: 10, display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid var(--cc-border, #2a2b3e)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cc-text, #e0e0e0)', flex: 1 }}>
            📋 Логи ChatCenter
          </span>
          <button
            onClick={() => { setAutoRefresh(!autoRefresh); if (!autoRefresh && onRefresh) onRefresh() }}
            style={{
              padding: '4px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              backgroundColor: autoRefresh ? '#22c55e22' : 'var(--cc-hover, #2a2b3e)',
              color: autoRefresh ? '#22c55e' : 'var(--cc-text-dim, #888)',
              border: `1px solid ${autoRefresh ? '#22c55e55' : 'var(--cc-border, #333)'}`,
            }}
          >
            {autoRefresh ? '● Auto' : '○ Auto'}
          </button>
          <button
            onClick={handleCopy}
            style={{
              padding: '4px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              backgroundColor: copied ? '#22c55e22' : 'var(--cc-hover, #2a2b3e)',
              color: copied ? '#22c55e' : 'var(--cc-text-dim, #888)',
              border: `1px solid ${copied ? '#22c55e55' : 'var(--cc-border, #333)'}`,
            }}
          >
            {copied ? '✓ Скопировано' : '📋 Копировать'}
          </button>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--cc-hover, #2a2b3e)', color: '#ff4444', fontSize: 16,
          }}>✕</button>
        </div>

        {/* Filters */}
        <div style={{ padding: '8px 16px', display: 'flex', gap: 8, borderBottom: '1px solid var(--cc-border, #2a2b3e)' }}>
          {[
            { id: 'all', label: 'Все', color: '#888' },
            { id: 'error', label: '● Ошибки', color: '#ff4444' },
            { id: 'warn', label: '● Предупр.', color: '#f59e0b' },
            { id: 'info', label: '● Инфо', color: '#22c55e' },
            { id: 'debug', label: '● Debug', color: '#6b7280' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '3px 10px', fontSize: 11, borderRadius: 12, cursor: 'pointer',
              backgroundColor: filter === f.id ? f.color + '22' : 'transparent',
              color: filter === f.id ? f.color : 'var(--cc-text-dimmer, #666)',
              border: `1px solid ${filter === f.id ? f.color + '55' : 'var(--cc-border, #333)'}`,
            }}>{f.label}</button>
          ))}
        </div>

        {/* Log content */}
        <div ref={scrollRef} style={{
          flex: 1, overflow: 'auto', padding: '8px 16px',
          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
        }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--cc-text-dimmer, #555)' }}>Лог пуст</div>
          ) : filtered.map((line, i) => (
            <div key={i} style={{ color: LEVEL_COLORS[line.level] || '#888', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <span style={{ opacity: 0.5 }}>[{line.ts}]</span>{' '}
              <span style={{ fontWeight: 600 }}>[{line.level}]</span>{' '}
              {line.text}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 16px', borderTop: '1px solid var(--cc-border, #2a2b3e)',
          fontSize: 11, color: 'var(--cc-text-dimmer, #555)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{filtered.length} / {lines.length} записей</span>
          <span>{new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  )
}
