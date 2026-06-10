// v1.0.0 (Phase 4.5): UI Dashboard для просмотра AI Activity (audit log).
//
// Показывает все действия AI с фильтрами + кнопка undo для revertable.

import { useState, useEffect, useCallback } from 'react'
import { listAuditEvents, getRecentRevertableActions } from '../stores/auditStore.js'

const ACTION_LABELS = {
  goto_message: '→ Переход к сообщению',
  get_chat_history: '📜 Чтение истории',
  search_messages: '🔍 Поиск сообщений',
  reply_to_message: '↪ Ответ на сообщение',
  mark_as_read: '✓ Отметка прочитанным',
  create_task: '📋 Создание задачи',
  schedule_reminder: '⏰ Напоминание',
  list_tasks: '📋 Список задач',
  summarize_chat: '📝 Сводка чата',
}

const RESULT_ICONS = {
  ok: '✅',
  error: '❌',
  denied: '🚫',
  denied_by_user: '🚫',
  permission_denied: '🚫',
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function AIActivityDashboard() {
  const [records, setRecords] = useState([])
  const [filter, setFilter] = useState({ actor: 'all', actionId: 'all' })
  const [loading, setLoading] = useState(false)
  const [revertable, setRevertable] = useState([])

  const reload = useCallback(async () => {
    setLoading(true)
    const apiFilter = {}
    if (filter.actor !== 'all') apiFilter.actor = filter.actor
    if (filter.actionId !== 'all') apiFilter.actionId = filter.actionId
    const r = await listAuditEvents(apiFilter, 100)
    if (r.ok) setRecords(r.records || [])
    const rr = await getRecentRevertableActions(10)
    if (rr.ok) setRevertable(rr.records || [])
    setLoading(false)
  }, [filter])

  useEffect(() => { reload() }, [reload])

  // v1.1.2: разделение ai (ручной) vs ai_auto (auto-reply правило)
  const stats = {
    total: records.length,
    aiActions: records.filter(r => r.actor === 'ai').length,
    aiAutoActions: records.filter(r => r.actor === 'ai_auto').length,
    userActions: records.filter(r => r.actor === 'user').length,
    errors: records.filter(r => r.executionResult === 'error').length,
  }

  return (
    <div style={{ padding: 16, color: 'var(--cc-text, #fff)', maxHeight: '80vh', overflow: 'auto' }}>
      <h2 style={{ margin: '0 0 12px 0', fontSize: 20 }}>🤖 AI Activity</h2>

      {/* Статистика */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <StatCard label="Всего" value={stats.total} />
        <StatCard label="AI (ручной)" value={stats.aiActions} color="#a855f7" />
        <StatCard label="AI авто" value={stats.aiAutoActions} color="#f97316" />
        <StatCard label="Юзер" value={stats.userActions} color="#22c55e" />
        <StatCard label="Ошибок" value={stats.errors} color="#ef4444" />
        <StatCard label="Можно откатить" value={revertable.length} color="#eab308" />
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          value={filter.actor}
          onChange={e => setFilter(f => ({ ...f, actor: e.target.value }))}
          style={selectStyle()}
        >
          <option value="all">Все актёры</option>
          <option value="ai">AI (ручной)</option>
          <option value="ai_auto">AI авто</option>
          <option value="user">Только юзер</option>
        </select>
        <select
          value={filter.actionId}
          onChange={e => setFilter(f => ({ ...f, actionId: e.target.value }))}
          style={selectStyle()}
        >
          <option value="all">Все действия</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="button" onClick={reload} style={btnStyle()}>🔄 Обновить</button>
      </div>

      {/* Список записей */}
      {loading && <div style={{ fontSize: 13, color: 'var(--cc-text-dim, #888)' }}>Загрузка...</div>}
      {!loading && records.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--cc-text-dim, #888)', padding: 20, textAlign: 'center' }}>
          Записей нет
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {records.map(r => (
          <div
            key={r.id}
            style={{
              padding: 10,
              background: 'var(--cc-panel, #1a1a1a)',
              border: '1px solid var(--cc-border, #333)',
              borderLeft: `3px solid ${actorColor(r.actor)}`,
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{RESULT_ICONS[r.executionResult] || '•'}</span>
                <span style={{ fontWeight: 600 }}>{ACTION_LABELS[r.actionId] || r.actionId}</span>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: actorColor(r.actor) + '33',
                  color: actorColor(r.actor),
                }}>
                  {actorLabel(r.actor)}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)' }}>
                {formatTime(r.timestamp)}
              </span>
            </div>
            {r.source?.chatTitle && (
              <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #aaa)', marginTop: 4 }}>
                💬 {r.source.chatTitle}
                {r.source.senderName && <span> · от {r.source.senderName}</span>}
              </div>
            )}
            {r.errorMessage && (
              <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 4 }}>
                ⚠️ {r.errorMessage}
              </div>
            )}
            {r.durationMs != null && (
              <div style={{ fontSize: 10, color: 'var(--cc-text-dim, #666)', marginTop: 4 }}>
                {r.durationMs}мс
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// v1.1.2: цвет полоски + лейбл badge по actor.
function actorColor(actor) {
  if (actor === 'ai_auto') return '#f97316'  // оранжевый — AI авто
  if (actor === 'ai') return '#a855f7'        // фиолетовый — AI ручной
  return '#22c55e'                            // зелёный — user (default)
}
function actorLabel(actor) {
  if (actor === 'ai_auto') return '⚡ AI авто'
  if (actor === 'ai') return '🤖 AI'
  return '👤 юзер'
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      padding: 10,
      background: 'var(--cc-panel, #1a1a1a)',
      border: '1px solid var(--cc-border, #333)',
      borderRadius: 6,
      minWidth: 80,
    }}>
      <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'inherit' }}>{value}</div>
    </div>
  )
}

function selectStyle() {
  return {
    padding: 6,
    background: 'var(--cc-input, #0a0a0a)', color: 'inherit',
    border: '1px solid var(--cc-border, #333)', borderRadius: 4,
    fontSize: 12,
  }
}

function btnStyle() {
  return {
    padding: '6px 12px', fontSize: 12,
    background: 'transparent', color: 'inherit',
    border: '1px solid var(--cc-border, #333)', borderRadius: 4, cursor: 'pointer',
  }
}
