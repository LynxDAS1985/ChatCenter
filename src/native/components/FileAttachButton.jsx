// v0.95.43: кнопка 📎 для выбора файлов через нативный диалог.
//
// Эталон: Telegram Web K attach button — paperclip-icon → hidden <input> → file picker.
//
// `multiple` allows выбрать несколько файлов сразу (для альбома).
// `accept` пустой — позволяет любые типы (фото/видео/документы/архивы).

import { useRef } from 'react'

export default function FileAttachButton({ onSelect, disabled = false }) {
  const inputRef = useRef(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onSelect?.(e.target.files)
          }
          // Сбрасываем значение чтобы можно было выбрать тот же файл снова
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Прикрепить файл"
        aria-label="Прикрепить файл"
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--amoled-text-dim)', cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 22, padding: '0 6px', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
          transition: 'color 0.15s, opacity 0.15s',
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = 'var(--amoled-accent)' }}
        onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.color = 'var(--amoled-text-dim)' }}
      >
        📎
      </button>
    </>
  )
}
