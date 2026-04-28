// v0.87.7: Runtime тест LoginModal через React Testing Library + happy-dom.
// Ловит ошибки типа "Cannot access X before initialization", невалидный JSX, падения хуков.
// v0.87.99: после внедрения CountryPicker — ввод только национальной части номера.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LoginModal from './LoginModal.jsx'

// Фиксируем русскую локаль чтобы CountryPicker дефолтил в Россию (+7).
beforeAll(() => {
  Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true })
})

const noop = vi.fn(() => Promise.resolve({ ok: true }))

describe('LoginModal', () => {
  it('рендерится на шаге phone без ошибок', () => {
    render(<LoginModal
      onClose={noop}
      startLogin={noop}
      submitCode={noop}
      submitPassword={noop}
      cancelLogin={noop}
      loginFlow={null}
    />)
    expect(screen.getByText('Подключить Telegram')).toBeTruthy()
    // input для номера — type="tel"
    const input = document.querySelector('input[type="tel"]')
    expect(input).toBeTruthy()
  })

  it('показывает экран кода при loginFlow.step=code', () => {
    render(<LoginModal
      onClose={noop}
      startLogin={noop}
      submitCode={noop}
      submitPassword={noop}
      cancelLogin={noop}
      loginFlow={{ step: 'code', phone: '+79001234567' }}
    />)
    expect(screen.getByText('Введите код')).toBeTruthy()
  })

  it('показывает экран 2FA при loginFlow.step=password', () => {
    render(<LoginModal
      onClose={noop}
      startLogin={noop}
      submitCode={noop}
      submitPassword={noop}
      cancelLogin={noop}
      loginFlow={{ step: 'password' }}
    />)
    expect(screen.getByText('Двухфакторная защита')).toBeTruthy()
  })

  it('показывает ошибку sticky когда она пришла в loginFlow', () => {
    render(<LoginModal
      onClose={noop}
      startLogin={noop}
      submitCode={noop}
      submitPassword={noop}
      cancelLogin={noop}
      loginFlow={{ step: 'code', error: 'Неверный код' }}
    />)
    expect(screen.getByText(/Неверный код/)).toBeTruthy()
  })

  it('клик "Получить код" собирает полный номер из кода страны и национальной части', async () => {
    const startLogin = vi.fn(() => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 10)))
    render(<LoginModal
      onClose={noop}
      startLogin={startLogin}
      submitCode={noop}
      submitPassword={noop}
      cancelLogin={noop}
      loginFlow={null}
    />)
    // Дефолт страны — Россия (+7 для русской локали или fallback).
    // Вводим 10 цифр национальной части → итог +79001234567.
    const input = document.querySelector('input[type="tel"]')
    fireEvent.change(input, { target: { value: '9001234567' } })
    fireEvent.click(screen.getByText('Получить код'))
    expect(startLogin).toHaveBeenCalledWith('+79001234567')
  })

  it('кнопка "Получить код" disabled пока введено мало цифр', () => {
    render(<LoginModal
      onClose={noop}
      startLogin={noop}
      submitCode={noop}
      submitPassword={noop}
      cancelLogin={noop}
      loginFlow={null}
    />)
    const btn = screen.getByText('Получить код').closest('button')
    expect(btn?.disabled).toBe(true)
    const input = document.querySelector('input[type="tel"]')
    fireEvent.change(input, { target: { value: '900' } })  // мало цифр
    expect(btn?.disabled).toBe(true)
    fireEvent.change(input, { target: { value: '9001234567' } })  // 10 цифр для +7
    expect(btn?.disabled).toBe(false)
  })
})
