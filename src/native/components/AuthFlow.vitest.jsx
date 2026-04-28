// v0.87.10: Тесты сценариев авторизации Telegram через mock IPC.
// Покрывают: phone→code→success, phone→code→2FA→success, FLOOD_WAIT, неверный код.
// v0.87.99: после внедрения CountryPicker placeholder стал динамическим — ищем input по type="tel".
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import LoginModal from './LoginModal.jsx'

// Фиксируем русскую локаль чтобы CountryPicker дефолтил в Россию (+7).
beforeAll(() => {
  Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true })
})

function setup(loginFlow = null, opts = {}) {
  const startLogin = vi.fn(() => Promise.resolve({ ok: true }))
  const submitCode = vi.fn(() => Promise.resolve({ ok: true }))
  const submitPassword = vi.fn(() => Promise.resolve({ ok: true }))
  const cancelLogin = vi.fn(() => Promise.resolve({ ok: true }))
  const onClose = vi.fn()
  render(<LoginModal
    onClose={onClose}
    startLogin={startLogin}
    submitCode={submitCode}
    submitPassword={submitPassword}
    cancelLogin={cancelLogin}
    loginFlow={loginFlow}
    {...opts}
  />)
  return { startLogin, submitCode, submitPassword, cancelLogin, onClose }
}

describe('AuthFlow scenarios', () => {
  it('Сценарий: phone → код приходит → ввод кода', async () => {
    const { startLogin } = setup(null)
    // v0.87.99: ввод только национальной части, страна по дефолту Россия (+7).
    const input = document.querySelector('input[type="tel"]')
    fireEvent.change(input, { target: { value: '9001234567' } })
    fireEvent.click(screen.getByText('Получить код'))
    await waitFor(() => expect(startLogin).toHaveBeenCalledWith('+79001234567'))
  })

  it('Сценарий: 2FA — переключение на экран пароля при step=password', () => {
    setup({ step: 'password', phone: '+79001234567' })
    expect(screen.getByText('Двухфакторная защита')).toBeTruthy()
    expect(screen.getByPlaceholderText('Пароль')).toBeTruthy()
  })

  it('Сценарий: FLOOD_WAIT — countdown работает, кнопка заблокирована', () => {
    const future = Date.now() + 60000  // 60 сек
    setup({ step: 'phone', error: 'Слишком много попыток. Подождите 1 минуту', waitUntil: future })
    expect(screen.getByText(/Слишком много попыток/)).toBeTruthy()
    // Кнопка должна показывать обратный отсчёт (текст начинается с "Подождите")
    const btn = screen.getAllByRole('button').find(b => /Подождите/.test(b.textContent))
    expect(btn).toBeTruthy()
    expect(btn.disabled).toBe(true)
  })

  it('Сценарий: неверный код — ошибка показана, поле доступно для нового ввода', () => {
    setup({ step: 'code', phone: '+79001234567', error: 'Неверный код. Проверьте что ввели правильно' })
    expect(screen.getByText('Введите код')).toBeTruthy()
    expect(screen.getByText(/Неверный код/)).toBeTruthy()
    // v0.87.102: CodeInput имеет 5 ячеек, каждая с placeholder "–"
    const cells = document.querySelectorAll('.code-input__cell')
    expect(cells.length).toBe(5)
    expect(cells[0].disabled).toBe(false)
  })

  it('Сценарий: success — onClose вызывается через 300мс', async () => {
    vi.useFakeTimers()
    const { onClose } = setup({ step: 'success', phone: '+79001234567' })
    act(() => { vi.advanceTimersByTime(400) })
    expect(onClose).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('Сценарий: server step=password перебивает optimisticStep=code', async () => {
    // Сначала ввели номер — UI optimistic переключился на code
    const { rerender } = render(
      <LoginModal
        onClose={vi.fn()} startLogin={vi.fn(() => Promise.resolve({ok:true}))}
        submitCode={vi.fn()} submitPassword={vi.fn()} cancelLogin={vi.fn()}
        loginFlow={null}
      />
    )
    // Имитируем что server emit step=password
    rerender(
      <LoginModal
        onClose={vi.fn()} startLogin={vi.fn()} submitCode={vi.fn()}
        submitPassword={vi.fn()} cancelLogin={vi.fn()}
        loginFlow={{ step: 'password' }}
      />
    )
    expect(screen.getByText('Двухфакторная защита')).toBeTruthy()
  })
})
