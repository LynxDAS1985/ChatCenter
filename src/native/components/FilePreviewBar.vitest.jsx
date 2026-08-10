// v1.2.220: рендер-тест панели превью файла (перетаскивание файла мышкой).
// Проверяет поведение при длинной подписи: «Отправить» активна, отдельной кнопки
// «Файл, затем текст» больше нет, обычная «Отправить» шлёт splitText:true (авто-разбивка).
// happy-dom не считает layout, поэтому проверяем то, что от layout не зависит.
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FilePreviewBar from './FilePreviewBar.jsx'

// happy-dom может не иметь URL.createObjectURL — заглушка (компонент и так в try/catch).
beforeAll(() => {
  if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:mock'
  if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {}
})
afterEach(cleanup)

function makeFile(name = 'doc.png') {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/png' })
}
const baseProps = (caption) => ({
  files: [makeFile()],
  caption,
  onCaptionChange: () => {},
  onRemoveFile: () => {},
  onCancel: () => {},
  onSend: vi.fn(),
  sending: false,
  uploads: {},
})

describe('FilePreviewBar (v1.2.220)', () => {
  it('короткая подпись → «Отправить» активна, splitText:false', () => {
    const onSend = vi.fn()
    render(<FilePreviewBar {...baseProps('привет')} onSend={onSend} />)
    const btn = screen.getByText('Отправить').closest('button')
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(onSend.mock.calls[0][1]).toEqual({ splitText: false })
  })

  it('длинная подпись → «Отправить» активна, нет кнопки «Файл, затем текст», splitText:true', () => {
    const onSend = vi.fn()
    render(<FilePreviewBar {...baseProps('a'.repeat(1100))} onSend={onSend} />)
    // счётчик показывает превышение
    expect(screen.getByText(/1100 \/ 1024/)).toBeTruthy()
    // «Отправить» НЕ заблокирована
    expect(screen.getByText('Отправить').closest('button').disabled).toBe(false)
    // отдельной кнопки раздельной отправки больше нет
    expect(screen.queryByText(/Файл, затем текст/)).toBeNull()
    // информационная строка про N сообщений осталась
    expect(screen.getByText(/уйдёт .* сообщени/)).toBeTruthy()
    // обычная «Отправить» → авто-разбивка
    fireEvent.click(screen.getByText('Отправить'))
    expect(onSend).toHaveBeenCalled()
    expect(onSend.mock.calls[0][1]).toEqual({ splitText: true })
  })
})
