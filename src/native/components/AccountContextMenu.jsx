// v0.87.88: меню по правому клику на аватарку аккаунта.
// 2 шага в одном popup'е (без отдельной модалки):
//   ШАГ 1: инфо об аккаунте + кнопка «🚪 Выйти из аккаунта»
//   ШАГ 2: подтверждение «Точно выйти?» с [Отмена] [Выйти]
// После «Выйти» → IPC tg:remove-account → session/cache/avatars очищены.

import { useState, useEffect, useRef } from 'react'

function formatPhone(phone) {
  if (!phone) return ''
  // v0.87.89: показываем номер полностью (по запросу пользователя — это его свой аккаунт).
  // +79001234567 → +7 (900) 123-45-67
  const digits = (phone + '').replace(/\D/g, '')
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  // Другие страны — просто с + впереди
  if (digits.length >= 10) {
    return '+' + digits
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
        // v0.87.89: контрастнее AMOLED-фону — слегка светлее `surface`, чтобы не сливалось с чёрным
        background: 'linear-gradient(180deg, #1a1f2e 0%, #141823 100%)',
        // v0.87.89: яркая рамка accent-цветом + полупрозрачный outer glow
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        boxShadow: [
          '0 0 0 1px rgba(42,171,238,0.25)',         // тонкое accent-кольцо
          '0 16px 48px rgba(0,0,0,0.65)',            // глубокая основная тень
          '0 4px 12px rgba(42,171,238,0.15)',        // мягкое accent-свечение
          'inset 0 1px 0 rgba(255,255,255,0.06)',    // тонкий highlight сверху
        ].join(', '),
        zIndex: 1000,
        overflow: 'hidden',
        // v0.87.89: bouncy spring-анимация (overshoot 1.56) — открывается «упруго»
        animation: 'native-menu-popin 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        transformOrigin: 'top left',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Шапка: аватарка слева + инфо справа (v0.87.91 — flex layout). */}
      <div style={{
        padding: '14px 14px 12px',
        borderBottom: '1px solid var(--amoled-border)',
        background: 'linear-gradient(180deg, rgba(42,171,238,0.04) 0%, transparent 100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Аватарка 56×56 — фото или инициалы */}
        <div style={{
          width: 56, height: 56, flexShrink: 0,
          borderRadius: '50%',
          background: account.avatar
            ? `url("${account.avatar}") center/cover no-repeat`
            : `linear-gradient(135deg, var(--amoled-accent) 0%, #1d6fa5 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 20, fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.06)',
          letterSpacing: 0.5,
        }}>
          {!account.avatar && (account.name || '?').slice(0, 2).toUpperCase()}
        </div>
        {/* Текст справа — left-aligned внутри своего блока */}
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: '#fff',
            letterSpacing: 0.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {account.name || 'Без имени'}
          </div>
          {account.phone && (
            <div style={{
              fontSize: 12, color: 'var(--amoled-text-dim)', marginTop: 3,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatPhone(account.phone)}
            </div>
          )}
          {account.username && (
            <div style={{
              fontSize: 12, color: 'var(--amoled-accent)', marginTop: 2,
              fontWeight: 500,
            }}>
              @{account.username}
            </div>
          )}
          {account.connectedAt && (
            <div style={{
              fontSize: 10, color: 'var(--amoled-text-dimmer)', marginTop: 5, opacity: 0.7,
            }}>
              Подключён {formatConnectedDate(account.connectedAt)}
            </div>
          )}
        </div>
      </div>

      {/* Низ: меняется в зависимости от шага. v0.87.91 — slide transition + Sheen на кнопке. */}
      <div style={{ padding: 10, position: 'relative', overflow: 'hidden', minHeight: 56 }}>
        {step === 'menu' && (
          <button
            onClick={() => setStep('confirm')}
            className="native-account-menu__btn native-account-menu__btn--danger native-btn-sheen"
            style={{
              width: '100%',
              padding: '11px 12px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#fff', // v0.87.91: белый по умолчанию
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: 6,
              textAlign: 'center',
              fontWeight: 600,
              letterSpacing: 0.2,
              position: 'relative',
              overflow: 'hidden',
              animation: 'native-menu-slide-in 250ms cubic-bezier(0.34, 1.4, 0.64, 1)',
            }}
          >
            🚪 Выйти из аккаунта
          </button>
        )}

        {step === 'confirm' && (
          <div style={{ animation: 'native-menu-slide-in 250ms cubic-bezier(0.34, 1.4, 0.64, 1)' }}>
            <div style={{
              fontSize: 12,
              color: 'var(--amoled-text-dim)',
              padding: '4px 8px 12px',
              lineHeight: 1.5,
              textAlign: 'center',
            }}>
              ⚠️ Точно выйти?<br />
              <span style={{ fontSize: 11, color: 'var(--amoled-text-dimmer)' }}>
                Сессия будет удалена. При следующем входе нужно вводить код заново.
              </span>
            </div>
            {error && (
              <div style={{
                fontSize: 11,
                color: 'var(--amoled-danger)',
                padding: '0 4px 8px',
                textAlign: 'center',
              }}>
                Ошибка: {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '9px 10px', fontSize: 12,
                  background: 'var(--amoled-surface-hover)',
                  border: '1px solid var(--amoled-border)',
                  color: 'var(--amoled-text)', borderRadius: 6, cursor: 'pointer',
                  transition: 'all 150ms',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--amoled-border)'
                  e.currentTarget.style.borderColor = 'var(--amoled-text-dim)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--amoled-surface-hover)'
                  e.currentTarget.style.borderColor = 'var(--amoled-border)'
                }}
              >❌ Отмена</button>
              <button
                onClick={handleConfirm}
                className="native-btn-sheen"
                style={{
                  flex: 1, padding: '9px 10px', fontSize: 12,
                  background: 'rgba(239,68,68,0.85)',
                  border: '1px solid rgba(239,68,68,1)',
                  color: '#fff', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                  position: 'relative', overflow: 'hidden',
                  transition: 'all 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239,68,68,1)'
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(239,68,68,0.45)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.85)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >✅ Выйти</button>
            </div>
          </div>
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
