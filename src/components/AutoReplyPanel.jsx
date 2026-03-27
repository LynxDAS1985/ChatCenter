// v0.8 — Авто-ответчик по ключевым словам: при совпадении — ответ копируется в буфер обмена
import { useState } from 'react'

export default function AutoReplyPanel({ settings, onSettingsChange, onClose }) {
  const rules = settings.autoReplyRules || []
  const [editing, setEditing] = useState(null) // { id, keywords, reply, active } | null
  const [newKeyword, setNewKeyword] = useState('')

  const save = (updated) => {
    onSettingsChange({ ...settings, autoReplyRules: updated })
    window.api?.invoke('settings:save', { ...settings, autoReplyRules: updated }).catch(() => {})
  }

  const addRule = () => {
    setEditing({ id: Date.now().toString(), keywords: [], reply: '', active: true })
    setNewKeyword('')
  }

  const saveEditing = () => {
    if (!editing.reply.trim() || editing.keywords.length === 0) return
    const exists = rules.find(r => r.id === editing.id)
    if (exists) {
      save(rules.map(r => r.id === editing.id ? editing : r))
    } else {
      save([...rules, editing])
    }
    setEditing(null)
    setNewKeyword('')
  }

  const deleteRule = (id) => save(rules.filter(r => r.id !== id))

  const toggleRule = (id) => save(rules.map(r => r.id === id ? { ...r, active: !r.active } : r))

  const addKeyword = () => {
    const kw = newKeyword.trim()
    if (!kw || editing.keywords.includes(kw)) return
    setEditing({ ...editing, keywords: [...editing.keywords, kw] })
    setNewKeyword('')
  }

  const removeKeyword = (kw) => {
    setEditing({ ...editing, keywords: editing.keywords.filter(k => k !== kw) })
  }

  const activeCount = rules.filter(r => r.active).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col w-[520px] max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}
      >
        {/* Заголовок */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--cc-border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <span className="text-base font-semibold" style={{ color: 'var(--cc-text)' }}>Авто-ответчик</span>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dimmer)' }}
            >{activeCount}/{rules.length} активных</span>
          </div>
          <button
            onClick={onClose}
            className="text-lg w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            style={{ color: 'var(--cc-text-dimmer)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >✕</button>
        </div>

        {/* Описание + кнопка добавить */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--cc-border)', backgroundColor: 'var(--cc-surface-alt)' }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'var(--cc-text-dimmer)' }}>
            При совпадении ключевого слова ответ копируется в буфер обмена
          </p>
          <button
            onClick={addRule}
            className="ml-3 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
            style={{ backgroundColor: '#a855f722', color: '#a855f7', border: '1px solid #a855f744' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >+ Правило</button>
        </div>

        {/* Форма нового/редактируемого правила */}
        {editing && (
          <div
            className="px-4 py-3 space-y-2.5 shrink-0"
            style={{ backgroundColor: 'var(--cc-surface-alt)', borderBottom: '1px solid var(--cc-border)' }}
          >
            {/* Ключевые слова */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--cc-text-dimmer)' }}>
                Ключевые слова (хотя бы одно)
              </div>
              {editing.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {editing.keywords.map(kw => (
                    <span
                      key={kw}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full cursor-pointer"
                      style={{ backgroundColor: '#a855f722', color: '#a855f7', border: '1px solid #a855f744' }}
                      onClick={() => removeKeyword(kw)}
                      title="Нажми чтобы удалить"
                    >{kw} <span style={{ opacity: 0.6 }}>✕</span></span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
                  placeholder="Введи слово + Enter"
                  autoFocus
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg outline-none"
                  style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
                />
                <button
                  onClick={addKeyword}
                  className="px-3 py-1 rounded-lg text-xs cursor-pointer"
                  style={{ backgroundColor: '#a855f722', color: '#a855f7', border: '1px solid #a855f744' }}
                >+</button>
              </div>
            </div>

            {/* Текст ответа */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--cc-text-dimmer)' }}>
                Текст ответа (скопируется в буфер обмена)
              </div>
              <textarea
                value={editing.reply}
                onChange={e => setEditing({ ...editing, reply: e.target.value })}
                placeholder="Текст который скопируется в буфер обмена..."
                rows={2}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg outline-none resize-none"
                style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setEditing(null); setNewKeyword('') }}
                className="px-3 py-1 rounded-lg text-xs cursor-pointer"
                style={{ color: 'var(--cc-text-dimmer)' }}
              >Отмена</button>
              <button
                onClick={saveEditing}
                disabled={!editing.reply.trim() || editing.keywords.length === 0}
                className="px-3 py-1 rounded-lg text-xs cursor-pointer disabled:opacity-40"
                style={{ backgroundColor: '#a855f722', color: '#a855f7', border: '1px solid #a855f744' }}
              >Сохранить</button>
            </div>
          </div>
        )}

        {/* Список правил */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {rules.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-3">⚡</div>
              <p className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>Нет правил</p>
              <p className="text-xs mt-1" style={{ color: 'var(--cc-text-dimmer)' }}>
                Добавьте правило для автоматического ответа по ключевым словам
              </p>
            </div>
          )}

          {rules.map(r => (
            <div
              key={r.id}
              className="rounded-xl p-3"
              style={{
                backgroundColor: r.active ? 'var(--cc-surface-alt)' : 'var(--cc-hover)',
                border: `1px solid ${r.active ? '#a855f733' : 'var(--cc-border)'}`,
                opacity: r.active ? 1 : 0.6,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Ключевые слова */}
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {r.keywords.map(kw => (
                      <span
                        key={kw}
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: '#a855f722', color: '#a855f7', border: '1px solid #a855f733' }}
                      >{kw}</span>
                    ))}
                  </div>
                  {/* Текст ответа */}
                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--cc-text)' }}>{r.reply}</p>
                </div>

                {/* Кнопки управления */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleRule(r.id)}
                    className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer font-medium"
                    style={{
                      backgroundColor: r.active ? '#22c55e22' : 'var(--cc-hover)',
                      color: r.active ? '#22c55e' : 'var(--cc-text-dimmer)',
                      border: `1px solid ${r.active ? '#22c55e44' : 'transparent'}`,
                    }}
                    title={r.active ? 'Выключить' : 'Включить'}
                  >{r.active ? 'вкл' : 'выкл'}</button>
                  <button
                    onClick={() => { setEditing(r); setNewKeyword('') }}
                    className="text-[11px] w-6 h-6 rounded flex items-center justify-center cursor-pointer"
                    style={{ color: 'var(--cc-text-dimmer)' }}
                    onMouseEnter={ev => ev.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
                    onMouseLeave={ev => ev.currentTarget.style.backgroundColor = 'transparent'}
                    title="Редактировать"
                  >✏️</button>
                  <button
                    onClick={() => deleteRule(r.id)}
                    className="text-[11px] w-6 h-6 rounded flex items-center justify-center cursor-pointer"
                    style={{ color: '#f87171' }}
                    onMouseEnter={ev => ev.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                    onMouseLeave={ev => ev.currentTarget.style.backgroundColor = 'transparent'}
                    title="Удалить"
                  >🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
