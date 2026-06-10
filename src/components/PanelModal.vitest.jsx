// v1.0.3: тесты PanelModal — Esc для закрытия + click overlay/stopPropagation.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import PanelModal from './PanelModal.jsx'

afterEach(cleanup)

describe('PanelModal — Esc handler (v1.0.3)', () => {
  it('Esc вызывает onClose', () => {
    const onClose = vi.fn()
    render(<PanelModal title="T" onClose={onClose}><div>x</div></PanelModal>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('другие клавиши onClose не вызывают', () => {
    const onClose = vi.fn()
    render(<PanelModal title="T" onClose={onClose}><div>x</div></PanelModal>)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('после unmount Esc больше не реагирует', () => {
    const onClose = vi.fn()
    const { unmount } = render(<PanelModal title="T" onClose={onClose}><div>x</div></PanelModal>)
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('onClose=undefined не падает', () => {
    expect(() => {
      render(<PanelModal title="T" onClose={undefined}><div>x</div></PanelModal>)
      fireEvent.keyDown(window, { key: 'Escape' })
    }).not.toThrow()
  })
})

describe('PanelModal — click behaviour', () => {
  it('клик по затемнению вызывает onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <PanelModal title="T" onClose={onClose}><div data-testid="body">body</div></PanelModal>
    )
    // overlay = root div (с position: fixed inset 0)
    const overlay = container.firstChild
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('клик внутри тела модалки НЕ вызывает onClose (stopPropagation)', () => {
    const onClose = vi.fn()
    const { getByTestId } = render(
      <PanelModal title="T" onClose={onClose}><div data-testid="body">body</div></PanelModal>
    )
    fireEvent.click(getByTestId('body'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('клик по кнопке ✕ вызывает onClose', () => {
    const onClose = vi.fn()
    const { getByTitle } = render(
      <PanelModal title="T" onClose={onClose}><div>x</div></PanelModal>
    )
    fireEvent.click(getByTitle(/Закрыть/))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
