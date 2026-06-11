// v1.2.6: тесты typewriter эффекта.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, waitFor } from '@testing-library/react'
import TypewriterText from './TypewriterText.jsx'

afterEach(() => {
  cleanup()
})

describe('TypewriterText — рендер', () => {
  it('initial: пустой displayed (если не instant)', () => {
    render(<TypewriterText text="Привет" speed={10} />)
    // В начале — только курсор, никакого текста
    const span = document.querySelector('span')
    expect(span.textContent.replace(/\s/g, '')).toBe('')
  })

  it('instant=true → весь text сразу', () => {
    render(<TypewriterText text="Привет" instant />)
    expect(screen.getByText(/Привет/)).toBeTruthy()
  })

  it('пустой text → пустой displayed', () => {
    render(<TypewriterText text="" speed={10} />)
    const span = document.querySelector('span')
    expect(span.textContent.replace(/\s/g, '')).toBe('')
  })
})

describe('TypewriterText — анимация', () => {
  it('после ожидания — символы появляются', async () => {
    render(<TypewriterText text="Hello!" speed={5} />)
    await waitFor(() => {
      const span = document.querySelector('span')
      expect(span.textContent).toContain('Hello')
    }, { timeout: 1000 })
  })

  it('после достаточного времени — весь text', async () => {
    render(<TypewriterText text="Привет!" speed={5} />)
    await waitFor(() => {
      expect(screen.getByText(/Привет!/)).toBeTruthy()
    }, { timeout: 1000 })
  })

  it('onComplete вызывается когда печать закончилась', async () => {
    const onComplete = vi.fn()
    render(<TypewriterText text="X" speed={5} onComplete={onComplete} />)
    await waitFor(() => expect(onComplete).toHaveBeenCalled(), { timeout: 500 })
  })

  it('instant=true → onComplete вызывается сразу', () => {
    const onComplete = vi.fn()
    render(<TypewriterText text="X" instant onComplete={onComplete} />)
    expect(onComplete).toHaveBeenCalled()
  })
})

describe('TypewriterText — изменение text', () => {
  it('text меняется → анимация перезапускается', async () => {
    const { rerender } = render(<TypewriterText text="First" speed={5} />)
    await waitFor(() => expect(screen.getByText(/First/)).toBeTruthy(), { timeout: 500 })

    rerender(<TypewriterText text="Second" speed={5} />)
    // Сразу после перерендера — text сбросился (пустой) или начинается заново
    const span = document.querySelector('span')
    expect(span.textContent).not.toContain('Second')
  })
})

describe('TypewriterText — курсор', () => {
  it('пока печатает — курсор виден', () => {
    render(<TypewriterText text="Long text here" speed={500} />)
    // Сразу после mount — курсор должен быть (text ещё не печатается)
    const cursors = document.querySelectorAll('span[style*="animation"]')
    expect(cursors.length).toBeGreaterThan(0)
  })

  it('когда закончил — курсора нет', async () => {
    render(<TypewriterText text="X" speed={5} />)
    await waitFor(() => {
      const cursors = Array.from(document.querySelectorAll('span'))
        .filter(s => s.style.animation && s.style.animation.includes('blink'))
      expect(cursors.length).toBe(0)
    }, { timeout: 500 })
  })
})
