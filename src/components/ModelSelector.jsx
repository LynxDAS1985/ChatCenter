// v1.2.5: Combobox для выбора модели AI провайдера.
//
// Зачем: до v1.2.5 юзер должен был вводить ID модели вручную (легко опечататься —
// «gtp-4» вместо «gpt-4»). Теперь выпадающий список известных моделей + поле для
// custom значения.
//
// API провайдеров меняют модели ~раз в 3-6 месяцев — список не претендует на
// полноту, но покрывает популярные. Custom-ввод остаётся доступным.

import { useState, useRef, useEffect } from 'react'
import { MODEL_HINTS } from '../utils/aiProviders.js'

/**
 * @param {object} props
 * @param {string} props.provider — anthropic/openai/deepseek/gigachat
 * @param {string} props.value — текущее значение
 * @param {(v: string) => void} props.onChange
 * @param {string} [props.placeholder]
 * @param {object} [props.style]
 */
export default function ModelSelector({ provider, value, onChange, placeholder, style }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const options = MODEL_HINTS[provider] || []

  // Закрытие при клике вне
  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const inputStyle = {
    width: '100%', padding: '6px 30px 6px 10px', fontSize: 13,
    backgroundColor: 'var(--cc-hover, #2a2b3e)',
    color: 'var(--cc-text, #e0e0e0)',
    border: '1px solid var(--cc-border, #333)',
    borderRadius: 6, boxSizing: 'border-box', fontFamily: 'monospace',
    ...style,
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || (options[0] || 'модель')}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Выбрать из списка"
        style={{
          position: 'absolute', right: 4, top: 4, bottom: 4,
          width: 24, padding: 0, fontSize: 10, cursor: 'pointer',
          background: 'transparent', border: 'none',
          color: 'var(--cc-text-dim, #888)',
        }}
      >▼</button>

      {open && options.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2,
          background: 'var(--cc-bg, #1a1b2e)',
          border: '1px solid var(--cc-border, #333)',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 100, maxHeight: 220, overflowY: 'auto',
        }}>
          {options.map(m => (
            <div
              key={m}
              onClick={() => { onChange(m); setOpen(false) }}
              style={{
                padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                fontFamily: 'monospace',
                color: value === m ? '#2AABEE' : 'var(--cc-text, #e0e0e0)',
                backgroundColor: value === m ? '#2AABEE11' : 'transparent',
              }}
              onMouseEnter={(e) => { if (value !== m) e.currentTarget.style.background = 'var(--cc-hover, #2a2b3e)' }}
              onMouseLeave={(e) => { if (value !== m) e.currentTarget.style.background = 'transparent' }}
            >
              {m}{value === m ? ' ✓' : ''}
            </div>
          ))}
          {value && !options.includes(value) && (
            <div style={{
              padding: '6px 10px', fontSize: 11,
              color: 'var(--cc-text-dim, #888)',
              borderTop: '1px solid var(--cc-border, #333)',
              fontStyle: 'italic',
            }}>
              Своя модель: {value}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
