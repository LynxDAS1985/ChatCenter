// v1.2.264 — поведение окна «Добавить источник»: 2 шага (протокол → мессенджер).
// v1.2.266 — +улучшения: поиск фильтрует, счётчик «N доступно», статус «уже подключён/добавлен».
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import AddSourceModal from './AddSourceModal.jsx'

afterEach(() => cleanup())

function setup(props = {}) {
  const onClose = vi.fn(), onAddApi = vi.fn(), onAddWeb = vi.fn()
  const utils = render(<AddSourceModal onClose={onClose} onAddApi={onAddApi} onAddWeb={onAddWeb} {...props} />)
  return { ...utils, onClose, onAddApi, onAddWeb }
}

describe('AddSourceModal', () => {
  it('шаг 1 показывает два протокола', () => {
    const { getByTestId } = setup()
    expect(getByTestId('add-proto-api')).toBeTruthy()
    expect(getByTestId('add-proto-web')).toBeTruthy()
  })

  it('API → Telegram доступен (→ onAddApi + onClose), остальные «скоро»', () => {
    const { getByTestId, getByText, queryAllByText, onAddApi, onClose } = setup()
    fireEvent.click(getByTestId('add-proto-api'))
    expect(queryAllByText(/скоро/).length).toBeGreaterThan(0)
    fireEvent.click(getByText('Telegram'))
    expect(onAddApi).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Веб → выбор мессенджера зовёт onAddWeb с пресетом (id) + onClose', () => {
    const { getByTestId, getByText, onAddWeb, onClose } = setup()
    fireEvent.click(getByTestId('add-proto-web'))
    fireEvent.click(getByText('ВКонтакте'))
    expect(onAddWeb).toHaveBeenCalledTimes(1)
    expect(onAddWeb.mock.calls[0][0]?.id).toBe('vk')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Веб → «Другой» зовёт onAddWeb(null) (ручной ввод URL)', () => {
    const { getByTestId, getByText, onAddWeb } = setup()
    fireEvent.click(getByTestId('add-proto-web'))
    fireEvent.click(getByText('Другой'))
    expect(onAddWeb).toHaveBeenCalledWith(null)
  })

  it('Escape закрывает окно', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  // ── v1.2.266 улучшения ──
  it('#3 поиск фильтрует список (What → только WhatsApp)', () => {
    const { getByTestId, getByText, queryByText } = setup()
    fireEvent.click(getByTestId('add-proto-web'))
    fireEvent.change(getByTestId('add-search'), { target: { value: 'What' } })
    expect(getByText('WhatsApp')).toBeTruthy()
    expect(queryByText('Telegram')).toBeNull()
    expect(queryByText('ВКонтакте')).toBeNull()
  })

  it('#8 счётчик «доступно»: Веб=4, API=1', () => {
    const { getByTestId, getByText } = setup()
    fireEvent.click(getByTestId('add-proto-web'))
    expect(getByText('4 доступно')).toBeTruthy()
  })

  it('#8 API → «1 доступно»', () => {
    const { getByTestId, getByText } = setup()
    fireEvent.click(getByTestId('add-proto-api'))
    expect(getByText('1 доступно')).toBeTruthy()
  })

  it('#1 счётчик учитывает поиск: «What» → «1 доступно»', () => {
    const { getByTestId, getByText } = setup()
    fireEvent.click(getByTestId('add-proto-web'))
    fireEvent.change(getByTestId('add-search'), { target: { value: 'What' } })
    expect(getByText('1 доступно')).toBeTruthy()
  })

  it('#4 статус «Уже добавлен» по URL', () => {
    const { getByTestId, getByTitle } = setup({ connectedWeb: [{ url: 'https://vk.ru/im', name: 'ВКонтакте' }] })
    fireEvent.click(getByTestId('add-proto-web'))
    expect(getByTitle('Уже добавлен')).toBeTruthy()
  })

  it('#4 статус «Уже добавлен» по ИМЕНИ (другой URL)', () => {
    const { getByTestId, getByTitle } = setup({ connectedWeb: [{ url: 'https://vk.com/im', name: 'ВКонтакте' }] })
    fireEvent.click(getByTestId('add-proto-web'))
    expect(getByTitle('Уже добавлен')).toBeTruthy()
  })

  it('#7 стрелка → перемещает фокус между плитками', () => {
    const { getByTestId, getByText } = setup()
    fireEvent.click(getByTestId('add-proto-web'))
    const tg = getByText('Telegram').closest('button')
    tg.focus()
    expect(document.activeElement).toBe(tg)
    fireEvent.keyDown(tg, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(getByText('WhatsApp').closest('button'))
  })
})
