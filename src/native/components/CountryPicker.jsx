// v0.87.99: выбор страны с флагом и кодом для LoginModal.
// Картинка:
//   ┌──────────────┬──────────────────┐
//   │ 🇷🇺 +7     ▼ │  9001234567      │
//   └──────────────┴──────────────────┘
//   После клика на левую часть — dropdown со списком и поиском.
//
// v0.87.100:
// 1) Авто-позиционирование dropdown: если снизу мало места — открывается вверх.
// 2) Флаги: на Windows нет emoji флагов в Segoe UI Emoji (показывает RU/US),
//    показываем стилизованный квадрат с ISO-кодом — выглядит читаемо и не зависит от шрифта.
import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react'
import { COUNTRIES } from '../data/countries.js'

// Бейдж страны вместо эмодзи-флага. На Windows Segoe UI Emoji не имеет regional
// indicator pairs, поэтому эмодзи-флаг отображается как пара букв "RU". Стандартизируем:
// показываем красивый квадратик с ISO-кодом всегда — выглядит одинаково на любой ОС.
function CountryBadge({ code }) {
  return (
    <span className="country-badge" aria-hidden="true">{code}</span>
  )
}

export default function CountryPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [openUp, setOpenUp] = useState(false)
  const wrapRef = useRef(null)
  const searchRef = useRef(null)

  // Закрываем при клике вне компонента
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Фокус на поиск + расчёт позиционирования при открытии
  useLayoutEffect(() => {
    if (!open) return
    // Расчёт направления: если снизу < 340px (высота dropdown ≈ 320px) — открываем вверх
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      setOpenUp(spaceBelow < 340 && spaceAbove > spaceBelow)
    }
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return COUNTRIES
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.dial.includes(q.replace(/^\+/, '')) ||
      c.code.toLowerCase().includes(q)
    )
  }, [search])

  const handleSelect = (country) => {
    onChange(country)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={wrapRef} className="country-picker">
      <button
        type="button"
        className="country-picker__trigger"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        <CountryBadge code={value?.code || '??'} />
        <span className="country-picker__dial">+{value?.dial || ''}</span>
        <span className="country-picker__arrow">▾</span>
      </button>

      {open && (
        <div className={'country-picker__dropdown' + (openUp ? ' country-picker__dropdown--up' : '')}>
          <input
            ref={searchRef}
            className="country-picker__search"
            type="text"
            placeholder="Поиск страны…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setOpen(false); setSearch('') }
              if (e.key === 'Enter' && filtered.length > 0) handleSelect(filtered[0])
            }}
          />
          <div className="country-picker__list">
            {filtered.length === 0 && (
              <div className="country-picker__empty">Не найдено. Попробуй другое слово.</div>
            )}
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                className={'country-picker__item' + (value?.code === c.code ? ' country-picker__item--active' : '')}
                onClick={() => handleSelect(c)}
              >
                <CountryBadge code={c.code} />
                <span className="country-picker__name">{c.name}</span>
                <span className="country-picker__dial-small">+{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
