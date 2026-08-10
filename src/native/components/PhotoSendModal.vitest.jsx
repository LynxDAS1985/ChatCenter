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

function makeFile(name = 'photo.png') {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/png' })
}
const baseProps = () => ({
  files: [makeFile()], caption: '', onCaptionChange: () => {}, onSend: () => {}, onCancel: () => {}, sending: false,
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

  it('✕ показывает подтверждение, «Отменить отправку» зовёт onCancel (#10)', () => {
    const onCancel = vi.fn()
    render(<PhotoSendModal {...baseProps()} onCancel={onCancel} />)
    fireEvent.click(screen.getByTitle('Отмена (Esc)'))
    expect(onCancel).not.toHaveBeenCalled() // сразу НЕ закрывает
    expect(screen.getByText(/Отменить отправку 1 фото/)).toBeTruthy()
    fireEvent.click(screen.getByText('Отменить отправку'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('переключатель «Без сжатия» → onSend с { asDocument:true } (#1)', () => {
    const onSend = vi.fn()
    render(<PhotoSendModal {...baseProps()} onSend={onSend} />)
    fireEvent.click(screen.getByLabelText(/Без сжатия/))
    fireEvent.click(screen.getByText('Отправить'))
    expect(onSend).toHaveBeenCalled()
    expect(onSend.mock.calls[0][1]).toEqual({ asDocument: true, splitText: false })
  })

  // v1.2.209 (вариант 1): счётчик подписи + выбор при превышении лимита.
  it('счётчик подписи показывается', () => {
    render(<PhotoSendModal {...baseProps()} caption="привет" />)
    expect(screen.getByText(/6 \/ 1024/)).toBeTruthy()
  })

  // v1.2.220: подпись сверх лимита — «Отправить» АКТИВНА, лишних кнопок нет, только инфо-строка;
  // обычная «Отправить» сама шлёт «фото, затем текст отдельно» (splitText:true).
  it('подпись сверх лимита → «Отправить» активна, нет «Сократить»/«текст отдельно», авто-разбивка', () => {
    const onSend = vi.fn()
    render(<PhotoSendModal {...baseProps()} caption={'a'.repeat(1100)} onSend={onSend} />)
    expect(screen.getByText(/1100 \/ 1024/)).toBeTruthy()
    // кнопка отправки НЕ заблокирована
    expect(screen.getByText('Отправить').closest('button').disabled).toBe(false)
    // лишние кнопки убраны
    expect(screen.queryByText('Сократить')).toBeNull()
    expect(screen.queryByText(/Фото, затем текст/)).toBeNull()
    // информационная строка про N сообщений осталась
    expect(screen.getByText(/уйдёт .* сообщени/)).toBeTruthy()
    // обычная «Отправить» → авто-разбивка (splitText:true)
    fireEvent.click(screen.getByText('Отправить'))
    expect(onSend).toHaveBeenCalled()
    expect(onSend.mock.calls[0][1]).toEqual({ asDocument: false, splitText: true })
  })

  it('🗑 удаляет текущее фото (#7)', () => {
    const onRemove = vi.fn()
    render(<PhotoSendModal {...baseProps()} onRemove={onRemove} />)
    fireEvent.click(screen.getByTitle('Удалить это фото (Del)'))
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('кнопки «Вписать» и «1:1» присутствуют (#8)', () => {
    render(<PhotoSendModal {...baseProps()} />)
    expect(screen.getByTitle('Вписать в окно')).toBeTruthy()
    expect(screen.getByTitle('Реальный размер 1:1')).toBeTruthy()
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

  // v1.2.203: несколько фото.
  it('несколько фото: счётчик «1 из N» и кнопка «Отправить (N)»', () => {
    render(<PhotoSendModal {...baseProps()} files={[makeFile('a.png'), makeFile('b.png'), makeFile('c.png')]} />)
    expect(screen.getByText(/1 из 3/)).toBeTruthy()
    expect(screen.getByText('Отправить (3)')).toBeTruthy()
  })

  it('«Отправить» без поворота зовёт onSend со ВСЕМ массивом фото', () => {
    const onSend = vi.fn()
    render(<PhotoSendModal {...baseProps()} files={[makeFile('a.png'), makeFile('b.png')]} onSend={onSend} />)
    fireEvent.click(screen.getByText('Отправить (2)'))
    expect(onSend).toHaveBeenCalled()
    const arg = onSend.mock.calls[0][0]
    expect(Array.isArray(arg)).toBe(true)
    expect(arg.length).toBe(2)
  })
})
