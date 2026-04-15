// v0.87.7: Runtime тест LoginModal через React Testing Library + happy-dom.
// Ловит ошибки типа "Cannot access X before initialization", невалидный JSX, падения хуков.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LoginModal from './LoginModal.jsx'

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
    expect(screen.getByPlaceholderText('+79001234567')).toBeTruthy()
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

  it('клик "Получить код" вызывает startLogin с введённым номером', async () => {
    const startLogin = vi.fn(() => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 10)))
    render(<LoginModal
      onClose={noop}
      startLogin={startLogin}
      submitCode={noop}
      submitPassword={noop}
      cancelLogin={noop}
      loginFlow={null}
    />)
    const input = screen.getByPlaceholderText('+79001234567')
    fireEvent.change(input, { target: { value: '+79001234567' } })
    fireEvent.click(screen.getByText('Получить код'))
    expect(startLogin).toHaveBeenCalledWith('+79001234567')
  })
})
