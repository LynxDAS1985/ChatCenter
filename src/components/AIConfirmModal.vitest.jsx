// v0.98.0 (Phase 2 M2.3): тесты AIConfirmModal.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import AIConfirmModal from './AIConfirmModal.jsx'

const SOURCE = {
  messengerId: 'native_cc',
  accountId: 'tg_1',
  chatId: '-100',
  messageId: '12345',
  senderName: 'Иван',
  chatTitle: 'Магазин',
  textPreview: 'Здравствуйте',
}

describe('AIConfirmModal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('visible=false → ничего не рендерит', () => {
    const { container } = render(
      <AIConfirmModal visible={false} actionId="reply_to_message" source={SOURCE} args={{ text: 'x' }} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('visible=true → рендерит модалку с title', () => {
    const { getByText } = render(
      <AIConfirmModal visible actionId="reply_to_message" source={SOURCE} args={{ text: 'Hi' }} />
    )
    expect(getByText('AI предлагает действие')).toBeTruthy()
    expect(getByText('Ответить на сообщение')).toBeTruthy()
  })

  it('кнопка [Подтвердить] disabled первые 3 секунды', () => {
    const onConfirm = vi.fn()
    const { getByRole, getAllByRole } = render(
      <AIConfirmModal visible actionId="reply_to_message" source={SOURCE} args={{ text: 'Hi' }} onConfirm={onConfirm} />
    )
    const buttons = getAllByRole('button')
    const confirmBtn = buttons.find(b => b.textContent.match(/Подтвердить|Ждите/))
    expect(confirmBtn.disabled).toBe(true)

    // Через 3 секунды — enabled
    act(() => { vi.advanceTimersByTime(3000) })
    expect(confirmBtn.disabled).toBe(false)
    expect(confirmBtn.textContent).toContain('Подтвердить')
  })

  it('клик [Подтвердить] вызывает onConfirm с актуальным text', () => {
    const onConfirm = vi.fn()
    const { getAllByRole, getByRole } = render(
      <AIConfirmModal
        visible
        actionId="reply_to_message"
        source={SOURCE}
        args={{ text: 'Initial text' }}
        onConfirm={onConfirm}
      />
    )

    // Юзер редактирует текст
    const textarea = getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Modified text' } })

    // Ждём 3 секунды
    act(() => { vi.advanceTimersByTime(3000) })

    const buttons = getAllByRole('button')
    const confirmBtn = buttons.find(b => b.textContent.includes('Подтвердить'))
    fireEvent.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledWith({ text: 'Modified text' })
  })

  it('клик [Отмена] вызывает onCancel', () => {
    const onCancel = vi.fn()
    const { getByText } = render(
      <AIConfirmModal visible actionId="reply_to_message" source={SOURCE} args={{ text: 'x' }} onCancel={onCancel} />
    )
    fireEvent.click(getByText('✗ Отмена'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('mark_as_read action — нет textarea, формат описания', () => {
    const { queryByRole, getAllByText } = render(
      <AIConfirmModal
        visible
        actionId="mark_as_read"
        source={SOURCE}
        args={{ upToMessageId: '99' }}
      />
    )
    expect(queryByRole('textbox')).toBe(null)
    // Текст есть и в title и в details — 2 совпадения это норма
    const matches = getAllByText(/Отметить прочитанным/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('пустой text → confirm disabled даже после 3 секунд', () => {
    const { getAllByRole, getByRole } = render(
      <AIConfirmModal visible actionId="reply_to_message" source={SOURCE} args={{ text: 'x' }} />
    )
    const textarea = getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '' } })

    act(() => { vi.advanceTimersByTime(3000) })

    const confirmBtn = getAllByRole('button').find(b => b.textContent.includes('Подтвердить'))
    expect(confirmBtn.disabled).toBe(true)
  })
})
