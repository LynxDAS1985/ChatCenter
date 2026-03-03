// v0.5 — Модальное окно добавления нового мессенджера
import { useState, useEffect } from 'react'
import { PRESET_COLORS, PRESET_EMOJIS } from '../constants.js'

export default function AddMessengerModal({ onAdd, onClose }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState('#2AABEE')
  const [emoji, setEmoji] = useState('💬')
  const [error, setError] = useState('')

  // Закрыть по Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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

    const ts = Date.now()
    onAdd({
      id: `custom_${ts}`,
      name: name.trim(),
      url: finalUrl,
      color,
      partition: `persist:custom_${ts}`,
      emoji,
      isDefault: false,
      // Базовый скрипт для кастомных мессенджеров — пробуем title страницы
      accountScript: `(() => {
        const t = document.title?.trim();
        return (t && t.length < 60 && t !== 'Loading...') ? t : null;
      })()`
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/65 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[#16213e] border border-white/10 rounded-2xl p-6 w-[440px] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white text-lg font-semibold">Добавить мессенджер</h2>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 text-xl transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Название */}
          <div>
            <label className="text-white/55 text-xs font-medium mb-1.5 block uppercase tracking-wider">
              Название
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Telegram, Авито, ВК..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-white/30 transition-colors placeholder-white/25"
              autoFocus
            />
          </div>

          {/* URL */}
          <div>
            <label className="text-white/55 text-xs font-medium mb-1.5 block uppercase tracking-wider">
              URL мессенджера
            </label>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://web.telegram.org/k/"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-white/30 transition-colors placeholder-white/25"
            />
          </div>

          {/* Цвет вкладки */}
          <div>
            <label className="text-white/55 text-xs font-medium mb-2 block uppercase tracking-wider">
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
              {/* Выбор произвольного цвета */}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-7 h-7 rounded-lg cursor-pointer border border-white/10 bg-white/5"
                title="Свой цвет"
              />
              {/* Превью активного цвета */}
              <span
                className="text-xs px-2 py-1 rounded-md font-mono"
                style={{ backgroundColor: `${color}25`, color }}
              >
                {color}
              </span>
            </div>
          </div>

          {/* Иконка */}
          <div>
            <label className="text-white/55 text-xs font-medium mb-2 block uppercase tracking-wider">
              Иконка
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {PRESET_EMOJIS.map(em => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all duration-150 cursor-pointer"
                  style={{
                    backgroundColor: emoji === em ? `${color}30` : 'rgba(255,255,255,0.06)',
                    outline: emoji === em ? `1.5px solid ${color}` : '1.5px solid transparent'
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Превью вкладки */}
          <div>
            <label className="text-white/55 text-xs font-medium mb-2 block uppercase tracking-wider">
              Превью вкладки
            </label>
            <div className="bg-[#0f172a] rounded-lg p-3 flex items-center">
              <div
                className="flex items-center gap-2 h-[36px] px-3 rounded-t-md"
                style={{
                  backgroundColor: `${color}1A`,
                  borderBottom: `2px solid ${color}`,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-medium" style={{ color }}>{name || 'Название'}</span>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Кнопки */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/75 text-sm transition-all cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-all cursor-pointer hover:opacity-90"
              style={{ backgroundColor: color }}
            >
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
