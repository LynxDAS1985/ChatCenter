// v1.1.17 (Этап 8): тесты редактора кастомных селекторов.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/react'
import AiSelectorsEditor from './AiSelectorsEditor.jsx'

let savedApi
beforeEach(() => {
  savedApi = window.api
  window.api = { invoke: vi.fn(), send: vi.fn() }
})
afterEach(() => {
  cleanup()
  window.api = savedApi
})

describe('AiSelectorsEditor — UI', () => {
  it('рендерит заголовок + селектор провайдера + 4 поля селекторов', () => {
    render(<AiSelectorsEditor
      settings={{}}
      onSettingsChange={() => {}}
      onClose={() => {}}
    />)
    expect(screen.getByText(/Настройка селекторов/)).toBeTruthy()
    expect(document.querySelector('select')).toBeTruthy()
    expect(screen.getByText(/Поле ввода/)).toBeTruthy()
    expect(screen.getByText(/Кнопка отправки/)).toBeTruthy()
    expect(screen.getByText(/Контейнер ответа/)).toBeTruthy()
    expect(screen.getByText(/индикатор/i)).toBeTruthy()
  })

  it('initialProviderId — селект показывает указанного провайдера', () => {
    render(<AiSelectorsEditor
      settings={{}}
      onSettingsChange={() => {}}
      onClose={() => {}}
      initialProviderId="deepseek"
    />)
    const select = document.querySelector('select')
    expect(select.value).toBe('deepseek')
  })

  it('initialProviderId неизвестный → fallback на первого из списка', () => {
    render(<AiSelectorsEditor
      settings={{}}
      onSettingsChange={() => {}}
      onClose={() => {}}
      initialProviderId="unknown"
    />)
    const select = document.querySelector('select')
    expect(['openai', 'deepseek', 'anthropic', 'gigachat']).toContain(select.value)
  })

  it('клик ✕ → onClose', () => {
    const onClose = vi.fn()
    render(<AiSelectorsEditor settings={{}} onSettingsChange={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalled()
  })

  it('существующие кастомные значения загружаются в инпуты', () => {
    const settings = {
      aiBridgeSelectors: {
        openai: { input: '#my-custom', submitButton: '.my-btn' },
      },
    }
    render(<AiSelectorsEditor
      settings={settings}
      onSettingsChange={() => {}}
      onClose={() => {}}
      initialProviderId="openai"
    />)
    const inputs = document.querySelectorAll('input[type="text"]')
    const values = Array.from(inputs).map(i => i.value)
    expect(values).toContain('#my-custom')
    expect(values).toContain('.my-btn')
  })
})

describe('AiSelectorsEditor — сохранение', () => {
  it('Сохранить с заполненными полями → onSettingsChange с aiBridgeSelectors', () => {
    const onSettingsChange = vi.fn()
    render(<AiSelectorsEditor
      settings={{}}
      onSettingsChange={onSettingsChange}
      onClose={() => {}}
      initialProviderId="openai"
    />)
    const inputs = document.querySelectorAll('input[type="text"]')
    fireEvent.change(inputs[0], { target: { value: '#new-input' } })
    fireEvent.click(screen.getByText(/Сохранить/))
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      aiBridgeSelectors: { openai: { input: '#new-input' } },
    }))
  })

  it('Сохранить с пустыми полями → провайдер удалён из aiBridgeSelectors', () => {
    const onSettingsChange = vi.fn()
    const settings = {
      aiBridgeSelectors: {
        openai: { input: '#old' },
        deepseek: { input: '.keep' },
      },
    }
    render(<AiSelectorsEditor
      settings={settings}
      onSettingsChange={onSettingsChange}
      onClose={() => {}}
      initialProviderId="openai"
    />)
    // Очищаем
    const inputs = document.querySelectorAll('input[type="text"]')
    fireEvent.change(inputs[0], { target: { value: '' } })
    fireEvent.click(screen.getByText(/Сохранить/))
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      aiBridgeSelectors: { deepseek: { input: '.keep' } },  // openai удалён
    }))
  })

  it('пробелы trim-аются перед сохранением', () => {
    const onSettingsChange = vi.fn()
    render(<AiSelectorsEditor
      settings={{}}
      onSettingsChange={onSettingsChange}
      onClose={() => {}}
      initialProviderId="anthropic"
    />)
    const inputs = document.querySelectorAll('input[type="text"]')
    fireEvent.change(inputs[0], { target: { value: '   #x   ' } })
    fireEvent.click(screen.getByText(/Сохранить/))
    expect(onSettingsChange.mock.calls[0][0].aiBridgeSelectors.anthropic.input).toBe('#x')
  })

  it('логи через app:log (не console.*)', () => {
    render(<AiSelectorsEditor
      settings={{}}
      onSettingsChange={() => {}}
      onClose={() => {}}
    />)
    const inputs = document.querySelectorAll('input[type="text"]')
    fireEvent.change(inputs[0], { target: { value: '#x' } })
    fireEvent.click(screen.getByText(/Сохранить/))
    const logs = window.api.send.mock.calls.filter(c => c[0] === 'app:log')
    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0][1].message).toMatch(/^\[ai-selectors-editor\]/)
  })
})

describe('AiSelectorsEditor — Сбросить и Заполнить из встроенных', () => {
  it('Сбросить → все инпуты пустые', () => {
    render(<AiSelectorsEditor
      settings={{ aiBridgeSelectors: { openai: { input: '#x', submitButton: '.y' } } }}
      onSettingsChange={() => {}}
      onClose={() => {}}
      initialProviderId="openai"
    />)
    fireEvent.click(screen.getByText(/Сбросить/))
    const inputs = document.querySelectorAll('input[type="text"]')
    for (const i of inputs) {
      expect(i.value).toBe('')
    }
  })

  it('Заполнить из встроенных → инпуты заполнены defaults', () => {
    render(<AiSelectorsEditor
      settings={{}}
      onSettingsChange={() => {}}
      onClose={() => {}}
      initialProviderId="openai"
    />)
    fireEvent.click(screen.getByText(/Заполнить из встроенных/))
    const inputs = document.querySelectorAll('input[type="text"]')
    // OpenAI input default = #prompt-textarea
    expect(inputs[0].value).toBe('#prompt-textarea')
  })
})
