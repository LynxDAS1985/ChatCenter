// v1.2.6: тесты typewriter эффекта.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, act } from '@testing-library/react'
import TypewriterText from './TypewriterText.jsx'

// v1.2.468: ПОДДЕЛЬНЫЕ ЧАСЫ вместо ожидания реального времени.
//
// Почему: 2026-09-16 полный прогон дал «1 failed | 2816 passed» — проверка «текст допечатался»
// увидела «Firs» вместо «First». Отдельно тест проходил 5 раз из 5, повторный полный прогон был
// зелёным. Причина не в программе: печать идёт по таймеру (5 мс на символ), а под нагрузкой
// полного прогона (200+ секунд, десятки файлов разом) таймеры отстают и за отведённое ожидание
// текст не успевает допечататься.
//
// Лечение — не увеличивать ожидание (это лечит симптом и однажды снова не хватит), а взять время
// под контроль: поддельные часы и ручная прокрутка. Приём уже применяется в проекте —
// src/native/components/ChatListLoadingSplash.vitest.jsx.
//
// 🔴 Часы возвращаем настоящими в afterEach: иначе поддельное время утечёт в СЛЕДУЮЩИЕ файлы
// прогона и там начнут зависать ожидания.
beforeEach(() => { vi.useFakeTimers() })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/**
 * Прокрутить поддельное время на `steps` шагов по `speed` мс.
 *
 * 🔴 ПОЧЕМУ ПО ШАГАМ, А НЕ ОДНИМ ПРЫЖКОМ: компонент ставит таймер на КАЖДЫЙ символ отдельно, и
 * следующий таймер появляется только ПОСЛЕ перерисовки. Один большой прыжок выполнит лишь первый
 * таймер — остальных ещё не существует. Поэтому крутим маленькими шагами: шаг → перерисовка →
 * новый таймер → шаг…
 *
 * 🔴 `waitFor` здесь НЕ используем: он ждёт РЕАЛЬНОГО времени, которого при поддельных часах нет,
 * и тест просто зависает до аварийного предела (проверено: 15 секунд и падение).
 */
function tick(steps, speed = 5) {
  for (let i = 0; i < steps; i++) act(() => { vi.advanceTimersByTime(speed) })
}

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
    tick(8)                                // «Hello!» = 6 символов, берём с запасом
    {
      const span = document.querySelector('span')
      expect(span.textContent).toContain('Hello')
    }
  })

  it('после достаточного времени — весь text', async () => {
    render(<TypewriterText text="Привет!" speed={5} />)
    tick(10)                               // «Привет!» = 7 символов, берём с запасом
    {
      expect(screen.getByText(/Привет!/)).toBeTruthy()
    }
  })

  it('onComplete вызывается когда печать закончилась', async () => {
    const onComplete = vi.fn()
    render(<TypewriterText text="X" speed={5} onComplete={onComplete} />)
    tick(3)
    expect(onComplete).toHaveBeenCalled()
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
    tick(8)                                // «First» = 5 символов, берём с запасом
    expect(screen.getByText(/First/)).toBeTruthy()

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
    tick(3)
    {
      const cursors = Array.from(document.querySelectorAll('span'))
        .filter(s => s.style.animation && s.style.animation.includes('blink'))
      expect(cursors.length).toBe(0)
    }
  })
})
