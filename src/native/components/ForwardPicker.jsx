// v0.87.17: модальное окно выбора чата для forward — поиск + аватарки
import { useState, useMemo } from 'react'

export default function ForwardPicker({ chats, onSelect, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return chats.slice(0, 50)
    return chats.filter(c => (c.title || '').toLowerCase().includes(q)).slice(0, 50)
  }, [chats, search])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--amoled-surface)',
        border: '1px solid var(--amoled-border)',
        borderRadius: 12, width: 420, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--amoled-border)', fontWeight: 600 }}>
          ➥ Переслать в чат
        </div>
        <div style={{ padding: 10, borderBottom: '1px solid var(--amoled-border)' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Поиск чата..." style={{ width: '100%', fontSize: 13 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--amoled-text-dim)', textAlign: 'center' }}>
              Ничего не найдено
            </div>
          ) : filtered.map(c => {
            const bgColors = ['#e17076', '#eda86c', '#a695e7', '#7bc862', '#65aadd', '#ee7aae', '#6ec9cb']
            const bgHash = (c.title || '?').split('').reduce((h, ch) => h + ch.charCodeAt(0), 0)
            const bgColor = bgColors[bgHash % bgColors.length]
            const initials = (c.title || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
            return (
              <div key={c.id} onClick={() => onSelect(c)} style={{
                padding: '10px 14px', cursor: 'pointer',
                display: 'flex', gap: 10, alignItems: 'center',
                borderBottom: '1px solid var(--amoled-border)',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(42,171,238,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: c.avatar ? `url("${c.avatar}") center/cover no-repeat` : bgColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 14, fontWeight: 600, flexShrink: 0
                }}>{!c.avatar && (initials || '?')}</div>
                <div style={{ fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--amoled-border)', textAlign: 'right' }}>
          <button className="native-btn native-btn--ghost" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  )
}
