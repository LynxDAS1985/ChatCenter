// v1.0.0 (Phase 4.1): UI для управления задачами.
//
// Показывает список задач с фильтрами. Создаёт / завершает / удаляет задачи.
// Клик по задаче с source → переход к сообщению (через ai:agent:ui-dispatch).

import { useState, useEffect, useCallback } from 'react'
import { listTasks, completeTask, deleteTask } from '../stores/taskStore.js'

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

  const reload = useCallback(async () => {
    setLoading(true)
    const f = filter === 'all' ? {} : { status: filter }
    const r = await listTasks(f)
    if (r.ok) setTasks(r.tasks || [])
    setLoading(false)
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
