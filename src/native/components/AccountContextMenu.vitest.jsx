// v0.87.88: тесты AccountContextMenu — меню по ПКМ на аватарку аккаунта.
// Проверяет 2 шага (menu → confirm), вызов onLogout, защиту от случайного клика.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import AccountContextMenu from './AccountContextMenu.jsx'

const baseAccount = {
  id: 'tg_self',
  name: 'Алексей Дугин',
  phone: '+79001234567',
  username: 'aleks_user',
  status: 'connected',
  connectedAt: 1712000000000,
}

beforeEach(() => {
  // Заглушка window.api для тестов
  globalThis.window.api = { invoke: vi.fn(() => Promise.resolve({ ok: true })) }
})

describe('AccountContextMenu — Шаг 1 (меню)', () => {
  it('показывает имя аккаунта', () => {
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    expect(container.textContent).toContain('Алексей Дугин')
    cleanup()
  })

  it('показывает username с @', () => {
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    expect(container.textContent).toContain('@aleks_user')
    cleanup()
  })

  it('форматирует номер телефона (полный, не маскирован — v0.87.89)', () => {
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    // Должен быть формат +7 (XXX) XXX-XX-XX полностью
    expect(container.textContent).toMatch(/\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}/)
    // Конкретно для +79001234567 → +7 (900) 123-45-67
    expect(container.textContent).toContain('+7 (900) 123-45-67')
    cleanup()
  })

  it('показывает дату подключения на русском', () => {
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    expect(container.textContent).toContain('Подключён')
    expect(container.textContent).toMatch(/\d{4}/) // год
    cleanup()
  })

  it('показывает кнопку «Выйти из аккаунта»', () => {
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    expect(container.textContent).toContain('Выйти из аккаунта')
    cleanup()
  })

  it('шапка — flex layout с аватаркой слева (v0.87.91)', () => {
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    const header = container.querySelector('.native-account-menu > div')
    expect(header.style.display).toBe('flex')
    expect(header.style.alignItems).toBe('center')
    cleanup()
  })

  it('показывает инициалы в аватарке если нет URL (v0.87.91)', () => {
    const { container } = render(
      <AccountContextMenu account={{ ...baseAccount, avatar: null }} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    // Avatar div — первый child шапки. Должен содержать инициалы AL (Алексей Дугин → АД).
    const avatar = container.querySelector('.native-account-menu > div > div')
    expect(avatar.textContent).toMatch(/[А-ЯA-Z]{1,2}/)
    cleanup()
  })

  it('показывает фото в аватарке если есть URL (v0.87.93: cc-media://)', () => {
    const { container } = render(
      <AccountContextMenu account={{ ...baseAccount, avatar: 'cc-media://avatars/me_12345.jpg' }} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    const avatar = container.querySelector('.native-account-menu > div > div')
    // background style должен содержать URL фото
    expect(avatar.style.background).toContain('me_12345.jpg')
    // Инициалов нет — есть фото
    expect(avatar.textContent).toBe('')
    cleanup()
  })

  it('БЕЗ phone — не показывает строку телефона', () => {
    const noPhone = { ...baseAccount, phone: null }
    const { container } = render(
      <AccountContextMenu account={noPhone} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    // Не должно быть номера с цифрами
    expect(container.textContent).not.toMatch(/\+7 \(\d{3}\)/)
    cleanup()
  })

  it('БЕЗ username — не показывает строку username', () => {
    const noUser = { ...baseAccount, username: null }
    const { container } = render(
      <AccountContextMenu account={noUser} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    expect(container.textContent).not.toContain('@')
    cleanup()
  })
})

describe('AccountContextMenu — Шаг 2 (подтверждение)', () => {
  it('клик «Выйти» переключает на confirm-шаг', () => {
    const { container, getByText } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    const exitBtn = getByText(/Выйти из аккаунта/)
    fireEvent.click(exitBtn)
    expect(container.textContent).toContain('Точно выйти')
    expect(container.textContent).toContain('Сессия будет удалена')
    cleanup()
  })

  it('confirm-шаг показывает кнопки [Отмена] и [Выйти]', () => {
    const { container, getByText } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    fireEvent.click(getByText(/Выйти из аккаунта/))
    expect(container.textContent).toContain('Отмена')
    // На confirm-шаге кнопка «Выйти» (без «из аккаунта»)
    const buttons = container.querySelectorAll('button')
    const buttonTexts = Array.from(buttons).map(b => b.textContent)
    expect(buttonTexts.some(t => t.includes('Выйти') && !t.includes('из аккаунта'))).toBe(true)
    cleanup()
  })

  it('клик «Отмена» вызывает onClose', () => {
    const onClose = vi.fn()
    const { getByText } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={onClose} onLogout={() => {}} />
    )
    fireEvent.click(getByText(/Выйти из аккаунта/))
    fireEvent.click(getByText(/Отмена/))
    expect(onClose).toHaveBeenCalled()
    cleanup()
  })

  it('клик «Выйти» на confirm вызывает onLogout с accountId', async () => {
    const onLogout = vi.fn(() => Promise.resolve({ ok: true }))
    const onClose = vi.fn()
    const { container, getByText } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={onClose} onLogout={onLogout} />
    )
    // Шаг 1 → Шаг 2
    fireEvent.click(getByText(/Выйти из аккаунта/))
    // Шаг 2 — найти кнопку «Выйти» (не «из аккаунта»)
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.includes('Выйти') && !b.textContent.includes('из аккаунта')
    )
    fireEvent.click(confirmBtn)
    // Ждём промис
    await new Promise(r => setTimeout(r, 10))
    expect(onLogout).toHaveBeenCalledWith('tg_self')
    cleanup()
  })

  it('после успешного onLogout вызывается onClose', async () => {
    const onLogout = vi.fn(() => Promise.resolve({ ok: true }))
    const onClose = vi.fn()
    const { container, getByText } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={onClose} onLogout={onLogout} />
    )
    fireEvent.click(getByText(/Выйти из аккаунта/))
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.includes('Выйти') && !b.textContent.includes('из аккаунта')
    )
    fireEvent.click(confirmBtn)
    await new Promise(r => setTimeout(r, 10))
    expect(onClose).toHaveBeenCalled()
    cleanup()
  })

  it('при ошибке onLogout — показывает ошибку и НЕ закрывает меню', async () => {
    const onLogout = vi.fn(() => Promise.resolve({ ok: false, error: 'Сеть недоступна' }))
    const onClose = vi.fn()
    const { container, getByText } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={onClose} onLogout={onLogout} />
    )
    fireEvent.click(getByText(/Выйти из аккаунта/))
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent.includes('Выйти') && !b.textContent.includes('из аккаунта')
    )
    fireEvent.click(confirmBtn)
    await new Promise(r => setTimeout(r, 10))
    expect(container.textContent).toContain('Сеть недоступна')
    expect(onClose).not.toHaveBeenCalled()
    cleanup()
  })
})

describe('AccountContextMenu — Позиционирование', () => {
  it('не вылезает за правый край экрана', () => {
    // window.innerWidth по умолчанию в happy-dom = 1024
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={9999} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    const menu = container.firstChild
    const left = parseInt(menu.style.left, 10)
    expect(left).toBeLessThan(window.innerWidth - 280)
    cleanup()
  })

  it('не вылезает за нижний край экрана', () => {
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={100} y={9999} onClose={() => {}} onLogout={() => {}} />
    )
    const menu = container.firstChild
    const top = parseInt(menu.style.top, 10)
    expect(top).toBeLessThan(window.innerHeight)
    cleanup()
  })
})

describe('AccountContextMenu — Безопасность', () => {
  it('контекстное меню браузера на меню заблокировано (preventDefault)', () => {
    const { container } = render(
      <AccountContextMenu account={baseAccount} x={100} y={100} onClose={() => {}} onLogout={() => {}} />
    )
    const menu = container.firstChild
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    const prevented = !menu.dispatchEvent(event)
    expect(prevented).toBe(true) // preventDefault сработал
    cleanup()
  })
})
