// v1.0.0 (Phase 4.1): UI для управления задачами.
// v1.0.7: bulk select — чекбоксы + панель «Готово / Удалить» когда выбрано.
//
// Показывает список задач с фильтрами. Создаёт / завершает / удаляет задачи.
// Клик по задаче с source → переход к сообщению (через ai:agent:ui-dispatch).

import { useState, useEffect, useCallback } from 'react'
import { listTasks, completeTask, deleteTask, bulkCompleteTasks, bulkDeleteTasks } from '../stores/taskStore.js'

const STATUS_LABELS = {
  pending: '⚪ Активна',
  in_progress: '🔵 В работе',
  done: '✅ Завершена',
}

const PRIORITY_COLORS = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#ef4444',
}

export default function TasksPanel({ onGoToSource }) {
  const [tasks, setTasks] = useState([])
  const [filter, setFilter] = useState('all')  // all | pending | done
  const [loading, setLoading] = useState(false)
  // v1.0.7: bulk select
  const [selectedIds, setSelectedIds] = useState(new Set())

  const reload = useCallback(async () => {
    setLoading(true)
    const f = filter === 'all' ? {} : { status: filter }
    const r = await listTasks(f)
    if (r.ok) setTasks(r.tasks || [])
    setLoading(false)
    setSelectedIds(new Set())  // сброс выбора при reload
  }, [filter])

  useEffect(() => { reload() }, [reload])

  const handleComplete = async (id) => {
    await completeTask(id)
    reload()
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить задачу?')) return
    await deleteTask(id)
    reload()
  }

  const handleClick = (task) => {
    if (task.source && onGoToSource) onGoToSource(task.source)
  }

  // v1.0.7: bulk operations
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkComplete = async () => {
    if (selectedIds.size === 0) return
    const r = await bulkCompleteTasks(Array.from(selectedIds))
    if (r?.ok) reload()
    else alert('Не удалось: ' + (r?.error || 'unknown'))
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Удалить ${selectedIds.size} задач?`)) return
    const r = await bulkDeleteTasks(Array.from(selectedIds))
    if (r?.ok) reload()
    else alert('Не удалось: ' + (r?.error || 'unknown'))
  }

  return (
    <div style={{ padding: 16, color: 'var(--cc-text, #fff)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>📋 Задачи</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'pending', 'done'].map(f => (
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
              {f === 'all' ? 'Все' : f === 'pending' ? 'Активные' : 'Завершённые'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--cc-text-dim, #888)' }}>Загрузка...</div>}
      {!loading && tasks.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--cc-text-dim, #888)', padding: 20, textAlign: 'center' }}>
          Задач нет
        </div>
      )}

      {/* v1.0.7: bulk toolbar — появляется когда что-то выбрано */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, marginBottom: 8, padding: '8px 12px',
          background: 'var(--cc-accent, #2AABEE)22',
          border: '1px solid var(--cc-accent, #2AABEE)55',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 13 }}>Выбрано: <b>{selectedIds.size}</b></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={handleBulkComplete} style={{
              padding: '6px 12px', fontSize: 12,
              background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}>✓ Готово ({selectedIds.size})</button>
            <button type="button" onClick={handleBulkDelete} style={{
              padding: '6px 12px', fontSize: 12,
              background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}>🗑 Удалить ({selectedIds.size})</button>
            <button type="button" onClick={() => setSelectedIds(new Set())} style={{
              padding: '6px 12px', fontSize: 12,
              background: 'transparent', color: 'inherit',
              border: '1px solid var(--cc-border, #333)', borderRadius: 4, cursor: 'pointer',
            }}>Снять выбор</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map(task => (
          <div
            key={task.id}
            style={{
              padding: 12,
              background: 'var(--cc-panel, #1a1a1a)',
              border: '1px solid var(--cc-border, #333)',
              borderLeft: `3px solid ${PRIORITY_COLORS[task.priority] || '#888'}`,
              borderRadius: 6,
              cursor: task.source ? 'pointer' : 'default',
              opacity: task.status === 'done' ? 0.6 : 1,
            }}
            onClick={() => handleClick(task)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {/* v1.0.7: чекбокс для bulk select */}
              <input
                type="checkbox"
                checked={selectedIds.has(task.id)}
                onChange={() => toggleSelect(task.id)}
                onClick={e => e.stopPropagation()}
                style={{ marginRight: 8, marginTop: 2, cursor: 'pointer' }}
                title="Выбрать для массовой операции"
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {task.title}
                </div>
                {task.details && (
                  <div style={{ fontSize: 12, color: 'var(--cc-text-dim, #888)', marginBottom: 6 }}>
                    {task.details}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', display: 'flex', gap: 12 }}>
                  <span>{STATUS_LABELS[task.status] || task.status}</span>
                  {task.dueAt && <span>📅 {new Date(task.dueAt).toLocaleString('ru-RU')}</span>}
                  {task.createdBy === 'ai' && <span>🤖 от AI</span>}
                  {task.source?.chatTitle && <span>💬 {task.source.chatTitle}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                {task.status !== 'done' && (
                  <button
                    type="button"
                    onClick={() => handleComplete(task.id)}
                    title="Завершить"
                    style={{
                      padding: '4px 8px', fontSize: 11,
                      background: 'transparent', color: '#22c55e',
                      border: '1px solid #22c55e55', borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    ✓
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  title="Удалить"
                  style={{
                    padding: '4px 8px', fontSize: 11,
                    background: 'transparent', color: '#ef4444',
                    border: '1px solid #ef444455', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  🗑
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
