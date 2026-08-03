// v1.2.175: переключатель режимов «Чаты / Клиенты / Доска» — ОДНА иконка внизу рейла
// аккаунтов. Клик → меню ВВЕРХ с 3 режимами (Вариант 3 по согласованному макету).
// Переехал из верхнего дропдауна над списком чатов (тот убран → список поднялся вверх).
// Активный режим — store.mode, переключение — store.setMode (через onSelect).
import { useState, useRef, useEffect } from 'react'

export default function RailModeSwitcher({ modes, activeId, onSelect, scale = 1 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = modes.find(m => m.id === activeId) || modes[0]
  const size = Math.round(48 * scale)

  // Закрытие по клику вне и по Escape (как у других поповеров native-режима).
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', margin: `0 auto ${Math.round(8 * scale)}px` }}>
      <div
        onClick={() => setOpen(o => !o)}
        title={`Режим: ${active.label} — нажмите, чтобы сменить`}
        style={{
          width: size, height: size, borderRadius: Math.round(12 * scale), cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.round(22 * scale),
          background: open ? 'var(--amoled-accent)' : 'var(--amoled-surface)',
          border: '1px solid var(--amoled-border)',
          transition: 'background 0.12s',
        }}
      >{active.icon || '💬'}</div>

      {open && (
        <div style={{
          // v1.2.176: меню открывается СБОКУ (вправо), а не вверх по центру — иначе у левого
          // края окна его обрезал `.native-content { overflow:hidden }` (уходило за экран).
          position: 'absolute', bottom: 0, left: '100%', marginLeft: 8, minWidth: 152, zIndex: 20,
          // v1.2.177: «приподнятый» фон меню (как AccountContextMenu) — светлее, чем список
          // (--amoled-surface #0a0a0a), иначе меню сливалось с фоном чатов.
          background: '#20242e', border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 10, padding: 4, boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
        }}>
          {modes.map(m => {
            const on = m.id === activeId
            return (
              <div
                key={m.id}
                onClick={() => { onSelect(m.id); setOpen(false) }}
                style={{
                  // v1.2.178 (Вариант 4): текст ВСЕГДА белый (читаемо). Не красим текст в синий.
                  // v1.2.179: подложка ТОЛЬКО под курсором (наведение) — у активного постоянного
                  // фона НЕТ; выбранный отмечен только галочкой ✓ справа.
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '9px 11px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: 'transparent',
                  color: '#eef1f6', fontWeight: on ? 700 : 500,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{m.icon || '💬'}</span>
                  <span style={{ fontSize: 14 }}>{m.label}</span>
                </span>
                {on && <span style={{ color: '#3db8f5', fontSize: 14, fontWeight: 700 }}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
