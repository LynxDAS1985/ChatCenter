// v1.2.183: тест значка мессенджера — логотип-картинка у Telegram, эмодзи у остальных.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import MessengerIcon from './MessengerIcon.jsx'

afterEach(cleanup)

describe('MessengerIcon (v1.2.183)', () => {
  it('telegram → рисует логотип-картинку <img> с data-URI', () => {
    const { container } = render(<MessengerIcon messenger="telegram" size={14} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
  })

  it('whatsapp → без картинки, показывает эмодзи 💬', () => {
    const { container } = render(<MessengerIcon messenger="whatsapp" size={14} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('💬')
  })

  it('неизвестный мессенджер → эмодзи-fallback 💬, без картинки', () => {
    const { container } = render(<MessengerIcon messenger="zzz" size={14} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('💬')
  })
})
