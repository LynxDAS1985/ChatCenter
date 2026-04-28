// v0.87.102: ввод кода Telegram отдельными ячейками (как в Telegram, банках, 2FA-формах).
// Картинка:
//   ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐
//   │–│ │–│ │–│ │–│ │–│   пусто (тире вместо цифр-плейсхолдеров)
//   └─┘ └─┘ └─┘ └─┘ └─┘
// Возможности:
//   • цифра → авто-focus на следующую ячейку
//   • Backspace → стираем текущую цифру; если пусто — focus на предыдущую и стираем там
//   • стрелки ←/→ → перемещение между ячейками
//   • вставка из буфера (например "12345") — авто-распределение по ячейкам
import { useRef, useEffect } from 'react'

export default function CodeInput({ length = 5, value, onChange, disabled, onComplete }) {
  const refs = useRef([])
  // Нормализуем value к массиву длины length
  const digits = String(value || '').replace(/\D/g, '').slice(0, length).padEnd(length, '').split('')

  // Авто-focus на первой пустой ячейке при монтировании / разблокировке.
  // Зависит от disabled и value — пере-фокусирует если value изменилось извне (reset формы).
  const filledCount = String(value || '').replace(/\D/g, '').length
  useEffect(() => {
    if (disabled) return
    const idx = Math.min(filledCount, length - 1)
    refs.current[idx]?.focus()
  }, [disabled, length, filledCount])

  const setAt = (i, ch) => {
    const next = [...digits]
    next[i] = ch
    const joined = next.join('').replace(/\s/g, '')
    onChange(joined)
    if (joined.length === length && !joined.includes('') && onComplete) {
      onComplete(joined)
    }
  }

  const handleChange = (i, e) => {
    const v = e.target.value.replace(/\D/g, '')
    if (!v) return
    if (v.length === 1) {
      setAt(i, v)
      // переход к следующей ячейке
      if (i + 1 < length) refs.current[i + 1]?.focus()
    } else {
      // юзер вставил несколько цифр — распределяем
      const arr = v.slice(0, length).split('')
      const next = [...digits]
      for (let k = 0; k < arr.length && (i + k) < length; k++) next[i + k] = arr[k]
      const joined = next.join('').replace(/\s/g, '')
      onChange(joined)
      const nextIdx = Math.min(i + arr.length, length - 1)
      refs.current[nextIdx]?.focus()
      if (joined.length === length && onComplete) onComplete(joined)
    }
  }

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        setAt(i, '')
      } else if (i > 0) {
        // ячейка пустая → стираем предыдущую и переходим на неё
        e.preventDefault()
        setAt(i - 1, '')
        refs.current[i - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault()
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      e.preventDefault()
      refs.current[i + 1]?.focus()
    } else if (e.key === 'Enter' && onComplete) {
      const filled = digits.join('').replace(/\s/g, '')
      if (filled.length === length) onComplete(filled)
    }
  }

  const handlePaste = (i, e) => {
    e.preventDefault()
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, length)
    if (!text) return
    const next = [...digits]
    for (let k = 0; k < text.length && (i + k) < length; k++) next[i + k] = text[k]
    const joined = next.join('').replace(/\s/g, '')
    onChange(joined)
    const nextIdx = Math.min(i + text.length, length - 1)
    refs.current[nextIdx]?.focus()
    if (joined.length === length && onComplete) onComplete(joined)
  }

  return (
    <div className="code-input">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          className={'code-input__cell' + (digits[i] ? ' code-input__cell--filled' : '')}
          value={digits[i] || ''}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={e => handlePaste(i, e)}
          onFocus={e => e.target.select()}
          disabled={disabled}
          placeholder="–"
          aria-label={`Цифра ${i + 1} из ${length}`}
        />
      ))}
    </div>
  )
}
