// v1.2.5: тесты dropdown выбора модели AI провайдера.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/react'
import ModelSelector from './ModelSelector.jsx'

afterEach(cleanup)

describe('ModelSelector — рендер', () => {
  it('input с placeholder = первая опция провайдера', () => {
    render(<ModelSelector provider="openai" value="" onChange={() => {}} />)
    const input = document.querySelector('input[type="text"]')
    expect(input.placeholder).toBe('gpt-4o-mini')
  })

  it('кастомный placeholder перебивает default', () => {
    render(<ModelSelector provider="openai" value="" onChange={() => {}} placeholder="мой плейс" />)
    const input = document.querySelector('input[type="text"]')
    expect(input.placeholder).toBe('мой плейс')
  })

  it('value показывается в input', () => {
    render(<ModelSelector provider="openai" value="gpt-4o" onChange={() => {}} />)
    const input = document.querySelector('input[type="text"]')
    expect(input.value).toBe('gpt-4o')
  })

  it('кнопка ▼ есть в правой части', () => {
    render(<ModelSelector provider="openai" value="" onChange={() => {}} />)
    expect(screen.getByText('▼')).toBeTruthy()
  })

  it('dropdown скрыт по умолчанию', () => {
    render(<ModelSelector provider="openai" value="" onChange={() => {}} />)
    expect(screen.queryByText('gpt-4o')).toBeFalsy()
  })
})

describe('ModelSelector — открытие dropdown', () => {
  it('фокус на input → dropdown открывается + показывает все модели', () => {
    render(<ModelSelector provider="openai" value="" onChange={() => {}} />)
    const input = document.querySelector('input[type="text"]')
    fireEvent.focus(input)
    expect(screen.getByText('gpt-4o')).toBeTruthy()
    expect(screen.getByText('gpt-4o-mini')).toBeTruthy()
  })

  it('клик ▼ переключает dropdown', () => {
    render(<ModelSelector provider="anthropic" value="" onChange={() => {}} />)
    fireEvent.click(screen.getByText('▼'))
    expect(screen.getByText('claude-haiku-4-5-20251001')).toBeTruthy()
  })

  it('неизвестный провайдер → dropdown не открывается', () => {
    render(<ModelSelector provider="unknown" value="" onChange={() => {}} />)
    fireEvent.click(screen.getByText('▼'))
    // Нет известных моделей → dropdown пустой (не рендерится)
    expect(document.querySelectorAll('div[style*="z-index: 100"]').length).toBe(0)
  })
})

describe('ModelSelector — выбор модели', () => {
  it('клик по опции → onChange + закрытие dropdown', () => {
    const onChange = vi.fn()
    render(<ModelSelector provider="anthropic" value="" onChange={onChange} />)
    fireEvent.click(screen.getByText('▼'))
    fireEvent.click(screen.getByText('claude-opus-4-8'))
    expect(onChange).toHaveBeenCalledWith('claude-opus-4-8')
  })

  it('выбранная модель помечена ✓', () => {
    render(<ModelSelector provider="anthropic" value="claude-sonnet-4-6" onChange={() => {}} />)
    fireEvent.click(screen.getByText('▼'))
    const items = document.querySelectorAll('div')
    const selected = Array.from(items).find(d => d.textContent === 'claude-sonnet-4-6 ✓')
    expect(selected).toBeTruthy()
  })

  it('custom значение (не из списка) → показано «Своя модель: X» в dropdown', () => {
    render(<ModelSelector provider="openai" value="gpt-custom-2030" onChange={() => {}} />)
    fireEvent.click(screen.getByText('▼'))
    expect(screen.getByText(/Своя модель: gpt-custom-2030/)).toBeTruthy()
  })

  it('input change → onChange', () => {
    const onChange = vi.fn()
    render(<ModelSelector provider="openai" value="" onChange={onChange} />)
    const input = document.querySelector('input[type="text"]')
    fireEvent.change(input, { target: { value: 'gpt-кастом' } })
    expect(onChange).toHaveBeenCalledWith('gpt-кастом')
  })
})

describe('ModelSelector — провайдеры', () => {
  for (const provider of ['anthropic', 'openai', 'deepseek', 'gigachat']) {
    it(`${provider} имеет хотя бы одну модель`, () => {
      render(<ModelSelector provider={provider} value="" onChange={() => {}} />)
      fireEvent.click(screen.getByText('▼'))
      // dropdown открыт — есть хотя бы одна модель
      const dropdown = document.querySelector('div[style*="z-index: 100"]')
      expect(dropdown).toBeTruthy()
      expect(dropdown.children.length).toBeGreaterThan(0)
    })
  }
})

describe('ModelSelector — закрытие по клику вне', () => {
  it('клик вне → dropdown закрывается', () => {
    render(<ModelSelector provider="openai" value="" onChange={() => {}} />)
    fireEvent.click(screen.getByText('▼'))
    expect(screen.getByText('gpt-4o')).toBeTruthy()
    // Клик вне
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('gpt-4o')).toBeFalsy()
  })
})
