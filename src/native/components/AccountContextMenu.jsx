// v0.87.88: меню по правому клику на аватарку аккаунта.
// 2 шага в одном popup'е (без отдельной модалки):
//   ШАГ 1: инфо об аккаунте + кнопка «🚪 Выйти из аккаунта»
//   ШАГ 2: подтверждение «Точно выйти?» с [Отмена] [Выйти]
// После «Выйти» → IPC tg:remove-account → session/cache/avatars очищены.

import { useState, useEffect, useRef } from 'react'

function formatPhone(phone) {
  if (!phone) return ''
  // +79001234567 → +7 (***) ***-45-67
  const digits = (phone + '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 (***) ***-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  if (digits.length >= 10) {
    return `+${digits.slice(0, -7)}*** ***-${digits.slice(-4, -2)}-${digits.slice(-2)}`
  }
  return phone
}

function formatConnectedDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function AccountContextMenu({ account, x, y, onClose, onLogout }) {
  // Шаг: 'menu' — главное меню с кнопкой «Выйти»
  //      'confirm' — подтверждение «Точно выйти?»
  //      'progress' — идёт выход (заблокировано)
  const [step, setStep] = useState('menu')
  const [error, setError] = useState(null)
  const menuRef = useRef(null)

  // Закрытие по Esc и клику вне меню
  useEffect(() => {
    if (step === 'progress') return // не закрывать пока идёт выход
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('keydown', onKey)
    // clickaway срабатывает на mousedown — чтобы не конфликтовать с onClick кнопок внутри меню
    setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [step, onClose])

  // Корректировка позиции — не вылезать за край экрана
  const MENU_W = 280
  const MENU_H = step === 'menu' ? 180 : 220
  const safeX = Math.min(x, window.innerWidth - MENU_W - 8)
  const safeY = Math.min(y, window.innerHeight - MENU_H - 8)

  const handleConfirm = async () => {
    setStep('progress')
    setError(null)
    try {
      const result = await onLogout(account.id)
      if (result?.ok) {
        onClose()
      } else {
        setError(result?.error || 'Не удалось выйти')
        setStep('confirm') // вернуть к подтверждению чтобы юзер мог попробовать снова
      }
    } catch (e) {
      setError(e?.message || String(e))
      setStep('confirm')
    }
  }

  return (
    <div
      ref={menuRef}
      className="native-account-menu"
      data-step={step}
      style={{
        position: 'fixed',
        left: safeX, top: safeY, width: MENU_W,
        background: 'var(--amoled-surface)',
        border: '1px solid var(--amoled-border)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        zIndex: 1000,
        overflow: 'hidden',
        animation: 'native-menu-fadein 150ms ease-out',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Шапка: инфо об аккаунте — всегда видна */}
      <div style={{ padding: 12, borderBottom: '1px solid var(--amoled-border)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--amoled-text)' }}>
          👤 {account.name || 'Без имени'}
        </div>
        {account.phone && (
          <div style={{ fontSize: 12, color: 'var(--amoled-text-dim)', marginTop: 2 }}>
            {formatPhone(account.phone)}
          </div>
        )}
        {account.username && (
          <div style={{ fontSize: 12, color: 'var(--amoled-accent)', marginTop: 2 }}>
            @{account.username}
          </div>
        )}
        {account.connectedAt && (
          <div style={{ fontSize: 11, color: 'var(--amoled-text-dimmer)', marginTop: 4 }}>
            Подключён {formatConnectedDate(account.connectedAt)}
          </div>
        )}
      </div>

      {/* Низ: меняется в зависимости от шага */}
      <div style={{ padding: 8, transition: 'all 200ms ease-out' }}>
        {step === 'menu' && (
          <button
            onClick={() => setStep('confirm')}
            className="native-account-menu__btn native-account-menu__btn--danger"
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--amoled-danger)',
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: 4,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            🚪 Выйти из аккаунта
          </button>
        )}

        {step === 'confirm' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--amoled-text-dim)', padding: '8px 4px 12px', lineHeight: 1.4 }}>
              ⚠️ Точно выйти? Сессия будет удалена, при следующем входе нужно вводить код заново.
            </div>
            {error && (
              <div style={{ fontSize: 11, color: 'var(--amoled-danger)', padding: '0 4px 8px' }}>
                Ошибка: {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '8px 10px', fontSize: 12,
                  background: 'var(--amoled-surface-hover)',
                  border: '1px solid var(--amoled-border)',
                  color: 'var(--amoled-text)', borderRadius: 4, cursor: 'pointer',
                }}
              >❌ Отмена</button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 1, padding: '8px 10px', fontSize: 12,
                  background: 'var(--amoled-danger)', border: 'none',
                  color: '#fff', borderRadius: 4, cursor: 'pointer', fontWeight: 600,
                }}
              >✅ Выйти</button>
            </div>
          </>
        )}

        {step === 'progress' && (
          <div style={{ fontSize: 12, color: 'var(--amoled-text-dim)', padding: 12, textAlign: 'center' }}>
            <span className="native-spinner" style={{ marginRight: 6 }} />
            Выходим из аккаунта...
          </div>
        )}
      </div>
    </div>
  )
}
