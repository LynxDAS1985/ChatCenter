// v0.87.0: Экран авторизации Telegram (phone → code → 2FA)
import { useState, useEffect } from 'react'

export default function LoginModal({ onClose, startLogin, submitCode, submitPassword, cancelLogin, loginFlow }) {
  // v0.87.6: ВСЕ useState строго сверху в одном порядке (React правило)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [stickyError, setStickyError] = useState('')
  const [optimisticStep, setOptimisticStep] = useState(null)
  const [countdown, setCountdown] = useState(0)

  // v0.87.10: server step имеет приоритет когда он "продвинутее" optimistic
  // (server: phone → code → password → success). Optimistic нужен только для phone→code.
  const SERVER_PRIORITY = ['phone', 'code', 'password', 'success']
  const serverStep = loginFlow?.step
  const step = (serverStep && SERVER_PRIORITY.indexOf(serverStep) >= SERVER_PRIORITY.indexOf(optimisticStep || 'phone'))
    ? serverStep
    : (optimisticStep || serverStep || 'phone')
  const serverError = loginFlow?.error || ''
  // Sticky error: ошибка НЕ исчезает автоматически, только когда пользователь меняет ввод или кликает действие
  useEffect(() => {
    const merged = localError || serverError
    if (merged) {
      setStickyError(merged)
      setOptimisticStep(null)  // v0.87.8: снимаем waitingForCode при ошибке
    }
  }, [localError, serverError])

  // v0.87.10: успех → закрываем модалку
  useEffect(() => {
    if (loginFlow?.step === 'success') {
      setTimeout(() => onClose?.(), 300)
    }
  }, [loginFlow?.step])

  // v0.87.8: live countdown при FLOOD_WAIT — показываем сколько секунд осталось
  useEffect(() => {
    if (!loginFlow?.waitUntil) { setCountdown(0); return }
    const tick = () => {
      const left = Math.max(0, Math.round((loginFlow.waitUntil - Date.now()) / 1000))
      setCountdown(left)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [loginFlow?.waitUntil])

  const formatCountdown = (sec) => {
    if (sec < 60) return `${sec} сек`
    const m = Math.floor(sec / 60), s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }
  const error = stickyError
  const waitingForCode = optimisticStep === 'code' && loginFlow?.step !== 'code' && loginFlow?.step !== 'password'

  const handlePhone = async () => {
    setBusy(true); setLocalError(''); setStickyError('')
    // v0.87.5: мгновенно переключаем UI на экран кода (не ждём GramJS 5-15 сек)
    setOptimisticStep('code')
    try {
      const r = await startLogin(phone.trim())
      if (!r?.ok) {
        setOptimisticStep(null)
        setLocalError(r?.error || 'Ошибка отправки кода')
      }
    } catch (e) {
      setOptimisticStep(null)
      setLocalError(e.message)
    }
    finally { setBusy(false) }
  }

  const handleCode = async () => {
    setBusy(true); setLocalError(''); setStickyError('')
    try {
      const r = await submitCode(code.trim())
      if (!r?.ok) setLocalError(r?.error || 'Неверный код')
      else if (r?.success) onClose?.()
    } catch (e) { setLocalError(e.message) }
    finally { setBusy(false) }
  }

  const handlePassword = async () => {
    setBusy(true); setLocalError(''); setStickyError('')
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
            {error && (
              <div className="native-login__error">
                <div>
                  {error}
                  {countdown > 0 && (
                    <div style={{ marginTop: 8, fontWeight: 600, fontSize: 15 }}>
                      ⏱ Осталось: {formatCountdown(countdown)}
                    </div>
                  )}
                </div>
              </div>
            )}
            <button className="native-btn" onClick={handlePhone} disabled={busy || !phone.trim() || countdown > 0}>
              {busy ? 'Отправка…' : countdown > 0 ? `Подождите ${formatCountdown(countdown)}` : 'Получить код'}
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
              {waitingForCode
                ? <><span className="native-spinner" />Отправляем код в Telegram...</>
                : `Код отправлен в Telegram на номер ${loginFlow?.phone || phone}`}
            </div>
            <input
              type="text"
              placeholder={waitingForCode ? 'Ждите...' : '12345'}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={6}
              disabled={busy || waitingForCode}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && !busy && !waitingForCode && code.trim() && handleCode()}
              style={{ fontSize: '24px', textAlign: 'center', letterSpacing: '0.4em', opacity: waitingForCode ? 0.5 : 1 }}
            />
            {error && <div className="native-login__error">{error}</div>}
            {!waitingForCode && !error && (
              <div className="native-hint">
                💡 Если у вас включена двухфакторная защита (облачный пароль) — после кода появится экран ввода пароля.
              </div>
            )}
            <button className="native-btn" onClick={handleCode} disabled={busy || waitingForCode || !code.trim()}>
              {busy ? <><span className="native-spinner" />Проверка…</> : waitingForCode ? 'Ожидание...' : 'Подтвердить'}
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
