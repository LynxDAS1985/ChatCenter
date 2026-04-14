// v0.87.0: Экран авторизации Telegram (phone → code → 2FA)
import { useState } from 'react'

export default function LoginModal({ onClose, startLogin, submitCode, submitPassword, cancelLogin, loginFlow }) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const step = loginFlow?.step || 'phone'
  const serverError = loginFlow?.error || ''
  const error = localError || serverError

  const handlePhone = async () => {
    setBusy(true); setLocalError('')
    try {
      const r = await startLogin(phone.trim())
      if (!r?.ok) setLocalError(r?.error || 'Ошибка отправки кода')
    } catch (e) { setLocalError(e.message) }
    finally { setBusy(false) }
  }

  const handleCode = async () => {
    setBusy(true); setLocalError('')
    try {
      const r = await submitCode(code.trim())
      if (!r?.ok) setLocalError(r?.error || 'Неверный код')
      else if (r?.success) onClose?.()
    } catch (e) { setLocalError(e.message) }
    finally { setBusy(false) }
  }

  const handlePassword = async () => {
    setBusy(true); setLocalError('')
    try {
      const r = await submitPassword(password)
      if (!r?.ok) setLocalError(r?.error || 'Неверный пароль')
      else if (r?.success) onClose?.()
    } catch (e) { setLocalError(e.message) }
    finally { setBusy(false) }
  }

  const handleCancel = async () => {
    await cancelLogin()
    onClose?.()
  }

  return (
    <div className="native-login">
      <div className="native-login__card">
        {step === 'phone' && (
          <>
            <div className="native-login__title">Подключить Telegram</div>
            <div className="native-login__subtitle">
              Код придёт в Telegram на указанный номер
            </div>
            <input
              type="tel"
              placeholder="+79001234567"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={busy}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && !busy && phone.trim() && handlePhone()}
            />
            {error && <div className="native-login__error">{error}</div>}
            <button className="native-btn" onClick={handlePhone} disabled={busy || !phone.trim()}>
              {busy ? 'Отправка…' : 'Получить код'}
            </button>
            <button className="native-btn native-btn--ghost" onClick={handleCancel} disabled={busy}>
              Отмена
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <div className="native-login__title">Введите код</div>
            <div className="native-login__subtitle">
              Код отправлен в Telegram на номер {loginFlow?.phone || phone}
            </div>
            <input
              type="text"
              placeholder="12345"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              disabled={busy}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && !busy && code.trim() && handleCode()}
              style={{ fontSize: '24px', textAlign: 'center', letterSpacing: '0.4em' }}
            />
            {error && <div className="native-login__error">{error}</div>}
            <button className="native-btn" onClick={handleCode} disabled={busy || !code.trim()}>
              {busy ? 'Проверка…' : 'Подтвердить'}
            </button>
            <button className="native-btn native-btn--ghost" onClick={handleCancel} disabled={busy}>
              Отмена
            </button>
          </>
        )}

        {step === 'password' && (
          <>
            <div className="native-login__title">Двухфакторная защита</div>
            <div className="native-login__subtitle">
              Введите облачный пароль Telegram
            </div>
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={busy}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && !busy && password && handlePassword()}
            />
            {error && <div className="native-login__error">{error}</div>}
            <button className="native-btn" onClick={handlePassword} disabled={busy || !password}>
              {busy ? 'Проверка…' : 'Войти'}
            </button>
            <button className="native-btn native-btn--ghost" onClick={handleCancel} disabled={busy}>
              Отмена
            </button>
          </>
        )}
      </div>
    </div>
  )
}
