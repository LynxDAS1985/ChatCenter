// v1.1.0 (Phase 4.3): UI для управления правилами auto-reply.
//
// Список правил + форма создания/редактирования. CRUD через autoReplyRulesStore.
// Минимальный UI — фокус на основных полях (name, keywords, schedule, action).

import { useState, useEffect, useCallback } from 'react'
import {
  listRules, createRule, updateRule, deleteRule, toggleRule,
} from '../stores/autoReplyRulesStore.js'
// v1.2.8: импорт/экспорт правил.
import { exportRulesToJson, parseImportJson } from '../utils/rulesImportExport.js'

const ACTION_LABELS = {
  ai_reply: '🤖 AI отвечает',
  mark_read: '✓ Отметить прочитанным',
}

const DAYS = [
  { v: 1, label: 'Пн' }, { v: 2, label: 'Вт' }, { v: 3, label: 'Ср' },
  { v: 4, label: 'Чт' }, { v: 5, label: 'Пт' }, { v: 6, label: 'Сб' }, { v: 7, label: 'Вс' },
]

export default function AIAutoReplyRules() {
  const [rules, setRules] = useState([])
  const [editing, setEditing] = useState(null)  // { id, ... } или 'new'
  // v1.1.2: master switch — глобальный kill-switch для всех правил.
  // Хранится в settings.aiAutoReplyMasterEnabled. По умолчанию true.
  const [masterEnabled, setMasterEnabled] = useState(true)
  const [masterLoaded, setMasterLoaded] = useState(false)

  const reload = useCallback(async () => {
    const r = await listRules()
    if (r?.ok) setRules(r.rules || [])
  }, [])

  // v1.1.2: загрузка master switch из settings.
  useEffect(() => {
    if (!globalThis.window?.api?.invoke) return
    globalThis.window.api.invoke('settings:get').then(s => {
      setMasterEnabled(s?.aiAutoReplyMasterEnabled !== false)
      setMasterLoaded(true)
    }).catch(() => setMasterLoaded(true))
  }, [])

  const handleMasterToggle = async () => {
    if (!globalThis.window?.api?.invoke) return
    const next = !masterEnabled
    setMasterEnabled(next)  // оптимистично
    try {
      const s = await globalThis.window.api.invoke('settings:get')
      await globalThis.window.api.invoke('settings:save', { ...(s || {}), aiAutoReplyMasterEnabled: next })
    } catch (_) {
      setMasterEnabled(!next)  // откат при ошибке
    }
  }

  useEffect(() => { reload() }, [reload])

  const handleSave = async (rule) => {
    let r
    if (rule.id && rules.some(x => x.id === rule.id)) {
      r = await updateRule(rule.id, rule)
    } else {
      r = await createRule(rule)
    }
    if (r?.ok) {
      setEditing(null)
      reload()
    } else {
      alert('Не удалось: ' + (r?.error || 'unknown'))
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить правило?')) return
    const r = await deleteRule(id)
    if (r?.ok) reload()
  }

  const handleToggle = async (id, enabled) => {
    await toggleRule(id, enabled)
    reload()
  }

  // v1.2.8: экспорт правил в JSON файл (скачивается через invisible <a download>).
  const handleExport = (rulesArr) => {
    try {
      const json = exportRulesToJson(rulesArr, '1.2.8')
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const stamp = new Date().toISOString().slice(0, 10)
      a.download = `chatcenter-rules-${stamp}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      try {
        globalThis.window?.api?.send?.('app:log', { level: 'INFO',
          message: `[auto-reply-export] exported ${rulesArr.length} rules to chatcenter-rules-${stamp}.json` })
      } catch (_) {}
    } catch (e) {
      alert('Не удалось экспортировать: ' + (e?.message || e))
    }
  }

  // v1.2.8: импорт — открывает file picker, парсит JSON, создаёт правила.
  const handleImportClick = (reloadFn) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = parseImportJson(text)
        if (!parsed.ok) {
          alert('Ошибка импорта: ' + parsed.error)
          return
        }
        let warningText = ''
        if (parsed.warnings?.length > 0) {
          warningText = '\n\nПредупреждения:\n' + parsed.warnings.join('\n')
        }
        if (!confirm(`Импортировать ${parsed.rules.length} правил?${warningText}\n\nСтарые правила остаются — новые добавятся.`)) {
          return
        }
        let added = 0
        let failed = 0
        for (const r of parsed.rules) {
          const res = await createRule(r)
          if (res?.ok) added++; else failed++
        }
        try {
          globalThis.window?.api?.send?.('app:log', { level: 'INFO',
            message: `[auto-reply-import] added ${added} of ${parsed.rules.length} rules${failed > 0 ? `, failed ${failed}` : ''}` })
        } catch (_) {}
        reloadFn()
        alert(`Импортировано: ${added} из ${parsed.rules.length}` + (failed > 0 ? ` (${failed} ошибок)` : ''))
      } catch (e) {
        alert('Не удалось прочитать файл: ' + (e?.message || e))
      }
    }
    input.click()
  }

  if (editing) {
    return <RuleForm
      initial={editing === 'new' ? null : editing}
      onSave={handleSave}
      onCancel={() => setEditing(null)}
    />
  }

  return (
    <div style={{ padding: 16, color: 'var(--cc-text, #fff)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>🤖 Правила автоответа</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* v1.2.8: импорт/экспорт правил */}
          <button
            type="button"
            onClick={() => handleExport(rules)}
            disabled={rules.length === 0}
            title="Скачать все правила в JSON файл (бэкап)"
            style={{
              padding: '8px 12px', fontSize: 12,
              background: 'var(--cc-hover, #2a2b3e)', color: 'var(--cc-text-dim, #aaa)',
              border: '1px solid var(--cc-border, #333)', borderRadius: 6,
              cursor: rules.length === 0 ? 'not-allowed' : 'pointer',
              opacity: rules.length === 0 ? 0.5 : 1,
            }}
          >📤 Экспорт</button>
          <button
            type="button"
            onClick={() => handleImportClick(reload)}
            title="Загрузить правила из JSON файла"
            style={{
              padding: '8px 12px', fontSize: 12,
              background: 'var(--cc-hover, #2a2b3e)', color: 'var(--cc-text-dim, #aaa)',
              border: '1px solid var(--cc-border, #333)', borderRadius: 6,
              cursor: 'pointer',
            }}
          >📥 Импорт</button>
          <button
            type="button"
            onClick={() => setEditing('new')}
            style={{
              padding: '8px 14px', fontSize: 13,
              background: 'var(--cc-accent, #2AABEE)', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
            }}
          >+ Новое правило</button>
        </div>
      </div>

      {/* v1.1.2: master switch — kill-switch для всех правил. */}
      {masterLoaded && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, marginBottom: 12, padding: '10px 14px',
          background: masterEnabled ? '#22c55e15' : '#ef444415',
          border: `1px solid ${masterEnabled ? '#22c55e55' : '#ef444455'}`,
          borderRadius: 8,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {masterEnabled ? '🟢 Авто-ответ ВКЛ' : '🔴 Авто-ответ ВЫКЛ'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', marginTop: 2 }}>
              {masterEnabled
                ? 'Все включённые правила могут срабатывать на входящие сообщения.'
                : 'Все правила заблокированы. Ни одно не сработает, даже если включено.'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleMasterToggle}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600,
              background: masterEnabled ? '#ef4444' : '#22c55e', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              minWidth: 130,
            }}
          >
            {masterEnabled ? '🔴 Выключить всё' : '🟢 Включить'}
          </button>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--cc-text-dim, #888)', marginBottom: 12 }}>
        AI автоматически отвечает когда подходит правило (триггеры + расписание + cooldown).
        Работает только в Native режиме (TDLib). Каждое правило независимое.
      </div>

      {rules.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--cc-text-dim, #888)', padding: 30, textAlign: 'center' }}>
          Правил нет. Создайте первое.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map(r => (
            <div
              key={r.id}
              style={{
                padding: 12,
                background: 'var(--cc-panel, #1a1a1a)',
                border: '1px solid var(--cc-border, #333)',
                borderLeft: `3px solid ${r.enabled ? '#22c55e' : '#666'}`,
                borderRadius: 6,
                opacity: r.enabled ? 1 : 0.6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', marginBottom: 4 }}>
                    {ACTION_LABELS[r.action?.type] || r.action?.type}
                    {r.triggers?.keywords?.length > 0 && ` · 🔑 ${r.triggers.keywords.slice(0, 3).join(', ')}${r.triggers.keywords.length > 3 ? '...' : ''}`}
                    {r.triggers?.schedule?.enabled && ` · 📅 ${r.triggers.schedule.from}–${r.triggers.schedule.to}`}
                    {` · ⏳ cooldown ${r.cooldownMinutes}мин`}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--cc-text-dim, #666)' }}>
                    Срабатываний: {r.matchedCount || 0}
                    {r.lastMatchedAt && ` · последнее ${new Date(r.lastMatchedAt).toLocaleString('ru-RU')}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                  <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={!!r.enabled}
                      onChange={(e) => handleToggle(r.id, e.target.checked)}
                    />
                    Вкл
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
                    style={{
                      padding: '3px 8px', fontSize: 10,
                      background: 'transparent', color: 'var(--cc-text-dim, #888)',
                      border: '1px solid var(--cc-border, #333)', borderRadius: 4, cursor: 'pointer',
                    }}
                  >✏️ Изм</button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    style={{
                      padding: '3px 8px', fontSize: 10,
                      background: 'transparent', color: '#ef4444',
                      border: '1px solid #ef444455', borderRadius: 4, cursor: 'pointer',
                    }}
                  >🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Форма правила ──────────────────────────────────────────────────────────

function RuleForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [enabled, setEnabled] = useState(initial?.enabled !== false)
  const [keywords, setKeywords] = useState((initial?.triggers?.keywords || []).join(', '))
  const [keywordsMode, setKeywordsMode] = useState(initial?.triggers?.keywordsMode || 'any')
  const [scheduleEnabled, setScheduleEnabled] = useState(!!initial?.triggers?.schedule?.enabled)
  const [scheduleDays, setScheduleDays] = useState(initial?.triggers?.schedule?.days || [1, 2, 3, 4, 5])
  const [scheduleFrom, setScheduleFrom] = useState(initial?.triggers?.schedule?.from || '09:00')
  const [scheduleTo, setScheduleTo] = useState(initial?.triggers?.schedule?.to || '18:00')
  const [actionType, setActionType] = useState(initial?.action?.type || 'ai_reply')
  const [aiPromptHint, setAiPromptHint] = useState(initial?.action?.aiPromptHint || '')
  const [cooldownMinutes, setCooldownMinutes] = useState(initial?.cooldownMinutes || 60)
  // v1.2.3: через AI Bridge (бесплатный Ollama + общий резерв) вместо tool use.
  const [useBridge, setUseBridge] = useState(!!initial?.action?.useBridge)

  const toggleDay = (d) => {
    setScheduleDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  const handleSubmit = () => {
    if (!name.trim()) { alert('Введите название'); return }
    const rule = {
      ...(initial?.id ? { id: initial.id } : {}),
      name: name.trim(),
      enabled,
      triggers: {
        chatIds: initial?.triggers?.chatIds || [],
        messengerIds: initial?.triggers?.messengerIds || [],
        senderIds: initial?.triggers?.senderIds || [],
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        keywordsMode,
        schedule: {
          enabled: scheduleEnabled,
          days: scheduleDays,
          from: scheduleFrom,
          to: scheduleTo,
        },
        excludeBots: initial?.triggers?.excludeBots !== false,
        excludeChannels: initial?.triggers?.excludeChannels !== false,
        excludeOutgoing: initial?.triggers?.excludeOutgoing !== false,
      },
      action: {
        type: actionType,
        aiPromptHint,
        // v1.2.3: useBridge → ai_reply через AI Bridge (с auto-резервом + Ollama)
        ...(actionType === 'ai_reply' && useBridge ? { useBridge: true } : {}),
      },
      cooldownMinutes: Number(cooldownMinutes) || 60,
      matchedCount: initial?.matchedCount || 0,
      lastMatchedAt: initial?.lastMatchedAt || null,
    }
    onSave(rule)
  }

  const labelStyle = { fontSize: 12, color: 'var(--cc-text-dim, #888)', display: 'block', marginBottom: 4 }
  const inputStyle = {
    width: '100%', padding: 8, fontSize: 13,
    background: 'var(--cc-input, #0a0a0a)', color: 'inherit',
    border: '1px solid var(--cc-border, #333)', borderRadius: 4,
  }

  return (
    <div style={{ padding: 16, color: 'var(--cc-text, #fff)' }}>
      <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>
        {initial ? 'Изменить правило' : 'Новое правило'}
      </h2>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Название</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={100} style={inputStyle} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Ключевые слова (через запятую, OR)</label>
        <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} style={inputStyle}
          placeholder="счёт, invoice, оплата" />
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12 }}>
          <label><input type="radio" checked={keywordsMode === 'any'} onChange={() => setKeywordsMode('any')} /> Любое (OR)</label>
          <label><input type="radio" checked={keywordsMode === 'all'} onChange={() => setKeywordsMode('all')} /> Все (AND)</label>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 6 }}>
          <input type="checkbox" checked={scheduleEnabled} onChange={e => setScheduleEnabled(e.target.checked)} />
          📅 Только в рабочее время
        </label>
        {scheduleEnabled && (
          <div style={{ paddingLeft: 20 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {DAYS.map(d => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => toggleDay(d.v)}
                  style={{
                    padding: '4px 8px', fontSize: 11,
                    background: scheduleDays.includes(d.v) ? 'var(--cc-accent, #2AABEE)' : 'transparent',
                    color: scheduleDays.includes(d.v) ? '#fff' : 'inherit',
                    border: '1px solid var(--cc-border, #333)', borderRadius: 4, cursor: 'pointer',
                  }}
                >{d.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              с <input type="text" value={scheduleFrom} onChange={e => setScheduleFrom(e.target.value)} placeholder="09:00"
                style={{ ...inputStyle, width: 80 }} />
              до <input type="text" value={scheduleTo} onChange={e => setScheduleTo(e.target.value)} placeholder="18:00"
                style={{ ...inputStyle, width: 80 }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Действие</label>
        <select value={actionType} onChange={e => setActionType(e.target.value)} style={inputStyle}>
          <option value="ai_reply">🤖 AI отвечает</option>
          <option value="mark_read">✓ Только отметить прочитанным</option>
        </select>
      </div>

      {actionType === 'ai_reply' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Подсказка для AI (что отвечать)</label>
            <textarea
              value={aiPromptHint}
              onChange={e => setAiPromptHint(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ответь профессионально что счёт в работе и будет готов сегодня к 18:00"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* v1.2.3: через AI Bridge (с auto-резервом + Ollama) */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, cursor: 'pointer' }}
              title="Использует AI Bridge: общий резерв провайдеров + локальный Ollama. Без tool use (AI только пишет ответ, не делает других действий)."
            >
              <input
                type="checkbox"
                checked={useBridge}
                onChange={e => setUseBridge(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ color: 'var(--cc-text, #fff)' }}>🔁 Через AI Bridge (с резервом + Ollama)</div>
                <div style={{ fontSize: 11, color: 'var(--cc-text-dim, #888)', marginTop: 2 }}>
                  Если основной провайдер упал — автоматический резерв.
                  Работает с бесплатным Ollama. Без умных действий (только текст-ответ).
                </div>
              </div>
            </label>
          </div>
        </>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Cooldown между срабатываниями (минуты)</label>
        <input type="number" min={1} max={1440} value={cooldownMinutes} onChange={e => setCooldownMinutes(e.target.value)}
          style={{ ...inputStyle, width: 100 }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Правило включено
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleSubmit} style={{
          padding: '8px 16px', fontSize: 13,
          background: 'var(--cc-accent, #2AABEE)', color: '#fff',
          border: 'none', borderRadius: 6, cursor: 'pointer',
        }}>Сохранить</button>
        <button type="button" onClick={onCancel} style={{
          padding: '8px 16px', fontSize: 13,
          background: 'transparent', color: 'inherit',
          border: '1px solid var(--cc-border, #333)', borderRadius: 6, cursor: 'pointer',
        }}>Отмена</button>
      </div>
    </div>
  )
}
