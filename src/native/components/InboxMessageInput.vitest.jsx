// v1.2.224: тест строки отправки — многострочное растущее поле (как Телеграм).
// @vitest-environment happy-dom
//
// Проверяет: поле — textarea (а не однострочный input); Enter без Shift отправляет,
// Shift+Enter — нет (новая строка); Enter при пустом тексте не отправляет; ввод зовёт onChange.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import InboxMessageInput from './InboxMessageInput.jsx'

afterEach(cleanup)

function setup(input = 'привет', over = {}) {
  const props = {
    input,
    setInput: vi.fn(),
    sending: false,
    replyTo: null,
    editTarget: null,
    setReplyTo: vi.fn(),
    setEditTarget: vi.fn(),
    activeMessages: [],
    handleInputChange: vi.fn(),
    handleReplySend: vi.fn(),
    handlePaste: vi.fn(),
    disabled: false,
    attachFiles: [],
    ...over,
  }
  render(<InboxMessageInput {...props} />)
  return props
}

describe('InboxMessageInput — многострочное поле (v1.2.224)', () => {
  it('поле отправки — textarea (многострочное), а не однострочный input', () => {
    setup()
    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA')
  })

  it('Enter (без Shift) при непустом тексте → отправка', () => {
    const p = setup('привет')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(p.handleReplySend).toHaveBeenCalledTimes(1)
  })

  it('Shift+Enter → НЕ отправляет (это новая строка)', () => {
    const p = setup('привет')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true })
    expect(p.handleReplySend).not.toHaveBeenCalled()
  })

  it('Enter при пустом тексте → не отправляет', () => {
    const p = setup('   ')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(p.handleReplySend).not.toHaveBeenCalled()
  })

  it('ввод текста → handleInputChange с новым значением', () => {
    const p = setup('')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'строка 1\nстрока 2' } })
    expect(p.handleInputChange).toHaveBeenCalledWith('строка 1\nстрока 2')
  })
})
