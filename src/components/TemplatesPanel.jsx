// v0.9 — Шаблоны ответов: CRUD + поиск + категории
import { useState } from 'react'

export default function TemplatesPanel({ settings, onSettingsChange, onClose }) {
  const templates = settings.templates || []
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [editing, setEditing] = useState(null) // { id, name, text, category } | null
  const [copiedId, setCopiedId] = useState(null)

  // Уникальные категории из всех шаблонов
  const categories = [...new Set(templates.map(t => t.category).filter(Boolean))].sort()

  // Фильтрация: по категории + по поиску
  const filtered = templates
    .filter(t => activeCategory === 'all' || t.category === activeCategory)
    .filter(t => !search ||
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.text?.toLowerCase().includes(search.toLowerCase()))

  const save = (updated) => {
    onSettingsChange({ ...settings, templates: updated })
    window.api.invoke('settings:save', { ...settings, templates: updated }).catch(() => {})
  }

  const addTemplate = () => {
    setEditing({ id: Date.now().toString(), name: '', text: '', category: activeCategory !== 'all' ? activeCategory : '' })
  }

  const saveEditing = () => {
    if (!editing.text.trim()) return
    const exists = templates.find(t => t.id === editing.id)
    if (exists) {
      save(templates.map(t => t.id === editing.id ? editing : t))
    } else {
      save([...templates, editing])
    }
    setEditing(null)
  }

  const deleteTemplate = (id) => save(templates.filter(t => t.id !== id))

  const copyTemplate = async (t) => {
    try { await navigator.clipboard.writeText(t.text) } catch {}
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col w-[540px] max-h-[82vh] rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}
      >
        {/* Заголовок */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--cc-border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <span className="text-base font-semibold" style={{ color: 'var(--cc-text)' }}>Шаблоны ответов</span>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dimmer)' }}
            >{templates.length}</span>
          </div>
          <button
            onClick={onClose}
            className="text-lg w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            style={{ color: 'var(--cc-text-dimmer)' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >✕</button>
        </div>

        {/* Поиск + кнопка добавить */}
        <div
          className="flex gap-2 px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--cc-border)' }}
        >
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по шаблонам..."
            className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none"
            style={{ backgroundColor: 'var(--cc-surface-alt)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
          />
          <button
            onClick={addTemplate}
            className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >+ Добавить</button>
        </div>

        {/* Фильтр по категориям */}
        {categories.length > 0 && (
          <div
            className="flex items-center gap-1.5 px-4 py-2 flex-wrap shrink-0"
            style={{ borderBottom: '1px solid var(--cc-border)', backgroundColor: 'var(--cc-surface-alt)' }}
          >
            <button
              onClick={() => setActiveCategory('all')}
              className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-all"
              style={{
                backgroundColor: activeCategory === 'all' ? '#2AABEE22' : 'var(--cc-hover)',
                color: activeCategory === 'all' ? '#2AABEE' : 'var(--cc-text-dimmer)',
                border: `1px solid ${activeCategory === 'all' ? '#2AABEE44' : 'transparent'}`,
              }}
            >Все ({templates.length})</button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-all"
                style={{
                  backgroundColor: activeCategory === cat ? '#2AABEE22' : 'var(--cc-hover)',
                  color: activeCategory === cat ? '#2AABEE' : 'var(--cc-text-dimmer)',
                  border: `1px solid ${activeCategory === cat ? '#2AABEE44' : 'transparent'}`,
                }}
              >{cat} ({templates.filter(t => t.category === cat).length})</button>
            ))}
          </div>
        )}

        {/* Форма редактирования */}
        {editing && (
          <div
            className="px-4 py-3 space-y-2 shrink-0"
            style={{ backgroundColor: 'var(--cc-surface-alt)', borderBottom: '1px solid var(--cc-border)' }}
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                placeholder="Название (необязательно)"
                className="text-xs px-2.5 py-1.5 rounded-lg outline-none"
                style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              />
              <input
                type="text"
                value={editing.category || ''}
                onChange={e => setEditing({ ...editing, category: e.target.value })}
                placeholder="Категория (необязательно)"
                list="template-categories-list"
                className="text-xs px-2.5 py-1.5 rounded-lg outline-none"
                style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              />
              <datalist id="template-categories-list">
                {categories.map(cat => <option key={cat} value={cat} />)}
              </datalist>
            </div>
            <textarea
              value={editing.text}
              onChange={e => setEditing({ ...editing, text: e.target.value })}
              placeholder="Текст ответа..."
              rows={3}
              autoFocus
              className="w-full text-xs px-2.5 py-1.5 rounded-lg outline-none resize-none"
              style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(null)}
                className="px-3 py-1 rounded-lg text-xs cursor-pointer"
                style={{ color: 'var(--cc-text-dimmer)' }}
              >Отмена</button>
              <button
                onClick={saveEditing}
                disabled={!editing.text.trim()}
                className="px-3 py-1 rounded-lg text-xs cursor-pointer disabled:opacity-40"
                style={{ backgroundColor: '#2AABEE22', color: '#2AABEE', border: '1px solid #2AABEE44' }}
              >Сохранить</button>
            </div>
          </div>
        )}

        {/* Список шаблонов */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-4xl mb-3">📝</div>
              <p className="text-sm" style={{ color: 'var(--cc-text-dim)' }}>
                {search ? 'Ничего не найдено' : 'Нет шаблонов'}
              </p>
              {!search && (
                <p className="text-xs mt-1" style={{ color: 'var(--cc-text-dimmer)' }}>
                  Добавьте готовые ответы для быстрого использования
                </p>
              )}
            </div>
          )}

          {filtered.map(t => (
            <div
              key={t.id}
              className="group rounded-xl p-3 cursor-pointer"
              style={{
                backgroundColor: copiedId === t.id ? 'rgba(34,197,94,0.08)' : 'var(--cc-surface-alt)',
                border: `1px solid ${copiedId === t.id ? '#22c55e44' : 'var(--cc-border)'}`,
              }}
              onClick={() => copyTemplate(t)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {t.name && (
                      <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--cc-text-dimmer)' }}>{t.name}</span>
                    )}
                    {t.category && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ backgroundColor: '#2AABEE11', color: '#2AABEE88', border: '1px solid #2AABEE22' }}
                      >{t.category}</span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--cc-text)' }}>{t.text}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setEditing(t) }}
                    className="text-[11px] w-6 h-6 rounded flex items-center justify-center cursor-pointer"
                    style={{ color: 'var(--cc-text-dimmer)' }}
                    onMouseEnter={ev => ev.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
                    onMouseLeave={ev => ev.currentTarget.style.backgroundColor = 'transparent'}
                    title="Редактировать"
                  >✏️</button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteTemplate(t.id) }}
                    className="text-[11px] w-6 h-6 rounded flex items-center justify-center cursor-pointer"
                    style={{ color: '#f87171' }}
                    onMouseEnter={ev => ev.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                    onMouseLeave={ev => ev.currentTarget.style.backgroundColor = 'transparent'}
                    title="Удалить"
                  >🗑️</button>
                </div>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px]" style={{ color: 'var(--cc-text-dimmer)' }}>{t.text.length} симв.</span>
                <span className="text-[10px]" style={{ color: copiedId === t.id ? '#22c55e' : 'var(--cc-text-dimmer)' }}>
                  {copiedId === t.id ? '✓ скопировано' : '↓ нажми чтобы скопировать'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
