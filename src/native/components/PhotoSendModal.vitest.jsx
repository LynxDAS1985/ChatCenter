// v1.2.198 (#4): рендер-тест окна отправки фото — проверяем «проводку» кнопок зума
// (математика проверена отдельно в imageZoomPan.vitest.js). happy-dom не считает layout,
// поэтому проверяем то, что от layout не зависит: клик +/− меняет показанный процент,
// «Отправить» без поворота зовёт onSend.
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PhotoSendModal from './PhotoSendModal.jsx'

// happy-dom может не иметь URL.createObjectURL — подставим заглушку (компонент и так в try/catch).
beforeAll(() => {
  if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:mock'
  if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {}
})
afterEach(cleanup)

function makeFile() {
  return new File([new Uint8Array([1, 2, 3, 4])], 'photo.png', { type: 'image/png' })
}
const baseProps = () => ({
  file: makeFile(), caption: '', onCaptionChange: () => {}, onSend: () => {}, onCancel: () => {}, sending: false,
})

describe('PhotoSendModal (#4)', () => {
  it('монтируется и показывает 100%', () => {
    render(<PhotoSendModal {...baseProps()} />)
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('клик «+» увеличивает масштаб 100% → 125%', () => {
    render(<PhotoSendModal {...baseProps()} />)
    fireEvent.click(screen.getByTitle('Приблизить'))
    expect(screen.getByText('125%')).toBeTruthy()
  })

  it('клик «−» на 100% не уходит ниже (остаётся 100%)', () => {
    render(<PhotoSendModal {...baseProps()} />)
    fireEvent.click(screen.getByTitle('Отдалить'))
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('«Отправить» без поворота зовёт onSend', () => {
    const onSend = vi.fn()
    render(<PhotoSendModal {...baseProps()} onSend={onSend} />)
    fireEvent.click(screen.getByText('Отправить'))
    expect(onSend).toHaveBeenCalled()
  })

  it('кнопка «Отмена» (✕) зовёт onCancel', () => {
    const onCancel = vi.fn()
    render(<PhotoSendModal {...baseProps()} onCancel={onCancel} />)
    fireEvent.click(screen.getByTitle('Отмена (Esc)'))
    expect(onCancel).toHaveBeenCalled()
  })

  // v1.2.201: поле подписи — растущее (textarea), Enter отправляет, Shift+Enter — новая строка.
  it('подпись — многострочное поле (textarea)', () => {
    render(<PhotoSendModal {...baseProps()} />)
    const cap = screen.getByPlaceholderText(/Подпись/)
    expect(cap.tagName).toBe('TEXTAREA')
  })

  it('Enter в подписи зовёт onSend', () => {
    const onSend = vi.fn()
    render(<PhotoSendModal {...baseProps()} onSend={onSend} />)
    fireEvent.keyDown(screen.getByPlaceholderText(/Подпись/), { key: 'Enter' })
    expect(onSend).toHaveBeenCalled()
  })

  it('Shift+Enter в подписи НЕ отправляет (перенос строки)', () => {
    const onSend = vi.fn()
    render(<PhotoSendModal {...baseProps()} onSend={onSend} />)
    fireEvent.keyDown(screen.getByPlaceholderText(/Подпись/), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })
})
