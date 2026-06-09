// v1.0.0 (Phase 4.2): UI для управления напоминаниями.

import { useState, useEffect, useCallback } from 'react'
import { listReminders, cancelReminder } from '../stores/reminderStore.js'

const STATUS_LABELS = {
  pending: '⏰ Ждёт',
  fired: '✅ Сработало',
  cancelled: '❌ Отменено',
}

export default function RemindersPanel({ onGoToSource }) {
  const [reminders, setReminders] = useState([])
  const [filter, setFilter] = useState('pending')

  const reload = useCallback(async () => {
    const f = filter === 'all' ? {} : { status: filter }
    const r = await listReminders(f)
    if (r.ok) setReminders(r.reminders || [])
  }, [filter])

  useEffect(() => { reload() }, [reload])

  const handleCancel = async (id) => {
    if (!confirm('Отменить напоминание?')) return
    await cancelReminder(id)
    reload()
  }

  return (
    <div style={{ padding: 16, color: 'var(--cc-text, #fff)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>⏰ Напоминания</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {['pending', 'fired', 'cancelled', 'all'].map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px', fontSize: 12,
                background: filter === f ? 'var(--cc-accent, #2AABEE)' : 'transparent',
                color: 'inherit',
                border: '1px solid var(--cc-border, #333)', borderRadius: 6, cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'Все' : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {reminders.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--cc-text-dim, #888)', padding: 20, textAlign: 'center' }}>
          Нет напоминаний
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reminders.map(r => (
          <div
            key={r.id}
            style={{
              padding: 12,
              background: 'var(--cc-panel, #1a1a1a)',
              border: '1px solid var(--cc-border, #333)',
              borderRadius: 6,
              opacity: r.status !== 'pending' ? 0.6 : 1,
            }}
            onClick={() => r.source && onGoToSource?.(r.source)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  📅 {new Date(r.remindAt).toLocaleString('ru-RU')}
                </div>
                {r.note && (
                  <div style={{ fontSize: 12, color: 'var(--cc-text-dim, #aaa)', marginBottom: 4 }}>
                    {r.note}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', display: 'flex', gap: 8 }}>
                  <span>{STATUS_LABELS[r.status]}</span>
                  {r.createdBy === 'ai' && <span>🤖 от AI</span>}
                  {r.source?.chatTitle && <span>💬 {r.source.chatTitle}</span>}
                </div>
              </div>
              {r.status === 'pending' && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleCancel(r.id) }}
                  title="Отменить"
                  style={{
                    padding: '4px 8px', fontSize: 11,
                    background: 'transparent', color: '#ef4444',
                    border: '1px solid #ef444455', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  ✗
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
