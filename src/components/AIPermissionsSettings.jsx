// v0.98.0 (Phase 2 M2.7): UI настройки AI Permissions.
//
// Юзер может настроить permission tier (auto/confirm) для tools которые
// isUserCustomizable. Hardcoded confirm/deny не настраиваются.

import { useState } from 'react'

const CUSTOMIZABLE_TOOLS = [
  { id: 'goto_message',     label: 'Переход к сообщению',        default: 'auto' },
  { id: 'get_chat_history', label: 'Получить историю чата',      default: 'auto' },
  { id: 'search_messages',  label: 'Поиск сообщений',            default: 'auto' },
  { id: 'summarize_chat',   label: 'Сводка чата',                default: 'auto' },
  { id: 'list_tasks',       label: 'Список задач',               default: 'auto' },
  { id: 'mark_as_read',     label: 'Отметить прочитанным',       default: 'confirm' },
  { id: 'mark_as_unread',   label: 'Отметить непрочитанным',     default: 'confirm' },
  { id: 'create_task',      label: 'Создать задачу',             default: 'confirm' },
  { id: 'complete_task',    label: 'Закрыть задачу',             default: 'confirm' },
  { id: 'schedule_reminder', label: 'Запланировать напоминание', default: 'confirm' },
  { id: 'cancel_reminder',  label: 'Отменить напоминание',       default: 'confirm' },
  { id: 'set_status',       label: 'Сменить статус',             default: 'confirm' },
]

const HARDCODED_TOOLS = [
  { id: 'reply_to_message', label: 'Отправить ответ',            tier: 'confirm', reason: 'Обязательное подтверждение (защита от автоматической отправки)' },
  { id: 'send_message',     label: 'Отправить сообщение',        tier: 'confirm', reason: 'Обязательное подтверждение' },
  { id: 'delete_message',   label: 'Удалить сообщение',          tier: 'deny',    reason: 'Запрещено для AI (необратимо)' },
  { id: 'leave_chat',       label: 'Покинуть чат',               tier: 'deny',    reason: 'Запрещено для AI' },
  { id: 'block_user',       label: 'Заблокировать юзера',        tier: 'deny',    reason: 'Запрещено для AI' },
  { id: 'clear_chat_history', label: 'Очистить историю чата',    tier: 'deny',    reason: 'Запрещено для AI' },
  { id: 'change_settings',  label: 'Изменить настройки',         tier: 'deny',    reason: 'Запрещено для AI' },
]

const PRESETS = {
  full_auto: 'Полный auto (все customizable → auto)',
  balanced: 'Сбалансированно (write actions требуют confirm)',
  read_only: 'Только чтение (write actions → deny)',
}

export default function AIPermissionsSettings({ settings, onChange }) {
  const overrides = settings?.aiPermissions?.overrides || {}
  const [selectedPreset, setSelectedPreset] = useState('balanced')

  const setOverride = (toolId, tier) => {
    const next = { ...overrides }
    if (tier === 'default') {
      delete next[toolId]
    } else {
      next[toolId] = tier
    }
    onChange?.({
      ...settings,
      aiPermissions: { ...settings?.aiPermissions, overrides: next },
    })
  }

  const applyPreset = (preset) => {
    setSelectedPreset(preset)
    const next = {}
    if (preset === 'full_auto') {
      for (const t of CUSTOMIZABLE_TOOLS) next[t.id] = 'auto'
    } else if (preset === 'read_only') {
      for (const t of CUSTOMIZABLE_TOOLS) {
        if (t.default === 'confirm') next[t.id] = 'deny'
      }
    } else {
      // balanced — defaults (пусто = default)
    }
    onChange?.({
      ...settings,
      aiPermissions: { ...settings?.aiPermissions, overrides: next },
    })
  }

  return (
    <div style={{ padding: 20, color: 'var(--cc-text, #fff)' }}>
      <h2 style={{ margin: '0 0 12px 0', fontSize: 20 }}>AI Permissions</h2>
      <p style={{ fontSize: 13, color: 'var(--cc-text-dim, #888)', marginBottom: 16 }}>
        Настройка того что AI может делать автоматически, что — только с подтверждением.
        Некоторые действия запрещены навсегда (нельзя изменить).
      </p>

      <div style={{ marginBottom: 16 }}>
        <strong style={{ fontSize: 14, marginRight: 10 }}>Готовый шаблон:</strong>
        {Object.entries(PRESETS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => applyPreset(key)}
            style={{
              padding: '6px 10px', marginRight: 6, fontSize: 12,
              background: selectedPreset === key ? 'var(--cc-accent, #2AABEE)' : 'transparent',
              color: 'inherit',
              border: '1px solid var(--cc-border, #333)', borderRadius: 6, cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <h3 style={{ marginTop: 20, marginBottom: 8, fontSize: 15 }}>Настраиваемые действия</h3>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th()}>Действие</th>
            <th style={th()}>По умолчанию</th>
            <th style={th()}>Ваш выбор</th>
          </tr>
        </thead>
        <tbody>
          {CUSTOMIZABLE_TOOLS.map(t => (
            <tr key={t.id} style={{ borderTop: '1px solid var(--cc-border, #333)' }}>
              <td style={td()}>{t.label}<br/><span style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)' }}>{t.id}</span></td>
              <td style={td()}>{tierIcon(t.default)}</td>
              <td style={td()}>
                <select
                  value={overrides[t.id] || 'default'}
                  onChange={e => setOverride(t.id, e.target.value)}
                  style={{
                    padding: 6,
                    background: 'var(--cc-input, #0a0a0a)', color: 'inherit',
                    border: '1px solid var(--cc-border, #333)', borderRadius: 4,
                  }}
                >
                  <option value="default">По умолчанию</option>
                  <option value="auto">🟢 auto</option>
                  <option value="confirm">🟡 confirm</option>
                  <option value="deny">🔴 deny</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24, marginBottom: 8, fontSize: 15 }}>Фиксированные (нельзя изменить)</h3>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th()}>Действие</th>
            <th style={th()}>Уровень</th>
            <th style={th()}>Причина</th>
          </tr>
        </thead>
        <tbody>
          {HARDCODED_TOOLS.map(t => (
            <tr key={t.id} style={{ borderTop: '1px solid var(--cc-border, #333)' }}>
              <td style={td()}>{t.label}</td>
              <td style={td()}>{tierIcon(t.tier)}</td>
              <td style={td()}>{t.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function tierIcon(tier) {
  if (tier === 'auto') return '🟢 auto'
  if (tier === 'confirm') return '🟡 confirm'
  if (tier === 'deny') return '🔴 deny'
  return tier
}

function th() {
  return {
    padding: 8, textAlign: 'left',
    fontWeight: 600, color: 'var(--cc-text-dim, #888)',
    borderBottom: '1px solid var(--cc-border, #333)',
  }
}

function td() {
  return { padding: 8, verticalAlign: 'top' }
}
