// v0.30.1 — Только настроенные мессенджеры, убрана секция иконок
import { useState, useEffect } from 'react'
import { PRESET_COLORS, POPULAR_MESSENGERS, DEFAULT_MESSENGERS } from '../constants.js'

// accountScript для дефолтных мессенджеров, добавленных через Quick Add
const DEFAULT_SCRIPTS = Object.fromEntries(
  DEFAULT_MESSENGERS.map(m => [m.url, m.accountScript])
)

const BASE_SCRIPT = `(() => {
  const t = document.title?.trim();
  return (t && t.length < 60 && t !== 'Loading...' && t !== 'Загрузка...') ? t : null;
})()`

export default function AddMessengerModal({ onAdd, onClose, editing, onSave }) {
  const [name, setName] = useState(editing?.name || '')
  const [url, setUrl] = useState(editing?.url || '')
  const [color, setColor] = useState(editing?.color || '#2AABEE')
  const [emoji, setEmoji] = useState(editing?.emoji || '💬')
  const [error, setError] = useState('')
  const isEdit = !!editing

  // Закрыть по Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Выбор популярного пресета
  const applyPreset = (preset) => {
    setName(preset.name)
    setUrl(preset.url)
    setColor(preset.color)
    setEmoji(preset.emoji)
    setError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) { setError('Введите название мессенджера'); return }
    if (!url.trim()) { setError('Введите URL мессенджера'); return }

    let finalUrl = url.trim()
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl
    }

    try { new URL(finalUrl) } catch {
      setError('Некорректный URL. Пример: https://web.telegram.org/')
      return
    }

    if (isEdit && onSave) {
      onSave({
        ...editing,
        name: name.trim(),
        url: finalUrl,
        color,
        emoji,
        accountScript: DEFAULT_SCRIPTS[finalUrl] || editing.accountScript || BASE_SCRIPT,
      })
    } else {
      const ts = Date.now()
      onAdd({
        id: `custom_${ts}`,
        name: name.trim(),
        url: finalUrl,
        color,
        partition: `persist:custom_${ts}`,
        emoji,
        isDefault: false,
        accountScript: DEFAULT_SCRIPTS[finalUrl] || BASE_SCRIPT,
      })
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'var(--cc-overlay)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 w-[480px] shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--cc-surface)', border: '1px solid var(--cc-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--cc-text)' }}>{isEdit ? 'Изменить вкладку' : 'Добавить мессенджер'}</h2>
          <button
            onClick={onClose}
            className="text-xl transition-colors cursor-pointer"
            style={{ color: 'var(--cc-text-dimmer)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--cc-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--cc-text-dimmer)'}
          >✕</button>
        </div>

        {/* Быстрый выбор — только при добавлении */}
        {!isEdit && <div className="mb-5">
          <div
            className="text-[11px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--cc-text-dimmer)' }}
          >
            Популярные
          </div>
          <div className="grid grid-cols-4 gap-2">
            {POPULAR_MESSENGERS.map(preset => (
              <button
                key={preset.url}
                type="button"
                onClick={() => applyPreset(preset)}
                className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-center transition-all cursor-pointer"
                style={{
                  backgroundColor: (url === preset.url && name === preset.name) ? `${preset.color}18` : 'var(--cc-hover)',
                  border: `1px solid ${(url === preset.url && name === preset.name) ? `${preset.color}55` : 'transparent'}`,
                }}
                onMouseEnter={e => { if (url !== preset.url) e.currentTarget.style.backgroundColor = 'var(--cc-border)' }}
                onMouseLeave={e => { if (url !== preset.url) e.currentTarget.style.backgroundColor = 'var(--cc-hover)' }}
                title={preset.category}
              >
                <span className="text-xl leading-none">{preset.emoji}</span>
                <span className="text-[11px] font-medium leading-tight" style={{ color: 'var(--cc-text-dim)' }}>
                  {preset.name}
                </span>
              </button>
            ))}
          </div>
        </div>}

        {/* Разделитель — только при добавлении */}
        {!isEdit && <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--cc-border)' }} />
          <span className="text-xs" style={{ color: 'var(--cc-text-dimmer)' }}>или введите вручную</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--cc-border)' }} />
        </div>}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Название */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--cc-text-dim)' }}>
              Название
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Telegram, Авито, ВК..."
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.25)'}
              onBlur={e => e.target.style.borderColor = 'var(--cc-border)'}
            />
          </div>

          {/* URL */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--cc-text-dim)' }}>
              URL мессенджера
            </label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://web.telegram.org/k/"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
              style={{ backgroundColor: 'var(--cc-hover)', border: '1px solid var(--cc-border)', color: 'var(--cc-text)' }}
              onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.25)'}
              onBlur={e => e.target.style.borderColor = 'var(--cc-border)'}
            />
          </div>

          {/* Цвет */}
          <div>
            <label className="text-xs font-semibold mb-2 block uppercase tracking-wider" style={{ color: 'var(--cc-text-dim)' }}>
              Цвет вкладки
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-all duration-150 cursor-pointer"
                  style={{
                    backgroundColor: c,
                    transform: color === c ? 'scale(1.3)' : 'scale(1)',
                    outline: color === c ? `2px solid ${c}` : '2px solid transparent',
                    outlineOffset: '2px'
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-7 h-7 rounded-lg cursor-pointer border"
                style={{ backgroundColor: 'var(--cc-hover)', borderColor: 'var(--cc-border)' }}
                title="Свой цвет"
              />
              <span
                className="text-xs px-2 py-1 rounded-md font-mono"
                style={{ backgroundColor: `${color}25`, color }}
              >{color}</span>
            </div>
          </div>

          {/* Превью */}
          <div>
            <label className="text-xs font-semibold mb-2 block uppercase tracking-wider" style={{ color: 'var(--cc-text-dim)' }}>
              Превью вкладки
            </label>
            <div className="rounded-lg p-3 flex items-center" style={{ backgroundColor: 'var(--cc-surface-alt)' }}>
              <div
                className="flex items-center gap-2 h-[36px] px-3 rounded-t-md"
                style={{ backgroundColor: `${color}1A`, borderBottom: `2px solid ${color}` }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-medium" style={{ color }}>{name || 'Название'}</span>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
              {error}
            </p>
          )}

          {/* Кнопки */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--cc-hover)', color: 'var(--cc-text-dim)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--cc-border)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--cc-hover)'}
            >Отмена</button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-all cursor-pointer"
              style={{ backgroundColor: color }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >{isEdit ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
