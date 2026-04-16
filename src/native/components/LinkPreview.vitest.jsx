// v0.87.31: render-smoke + snapshot для LinkPreview.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LinkPreview from './LinkPreview.jsx'

beforeEach(() => {
  globalThis.window.api = { invoke: vi.fn(() => Promise.resolve({ ok: true })) }
})

describe('LinkPreview render', () => {
  it('полная карточка с title/description/site', () => {
    const wp = { url: 'https://kinogo.online/123.html', title: 'Фильм', description: 'Описание', siteName: 'kinogo.online' }
    const { container } = render(<LinkPreview wp={wp} />)
    expect(container.textContent).toContain('Фильм')
    expect(container.textContent).toContain('Описание')
    expect(container.textContent).toContain('kinogo.online')
    cleanup()
  })

  it('без description (только title)', () => {
    const wp = { url: 'https://x.com', title: 'Short' }
    const { container } = render(<LinkPreview wp={wp} />)
    expect(container.textContent).toContain('Short')
    cleanup()
  })

  it('возвращает null если wp пустой', () => {
    const { container } = render(<LinkPreview wp={null} />)
    expect(container.firstChild).toBeNull()
    cleanup()
  })

  it('возвращает null если нет url', () => {
    const { container } = render(<LinkPreview wp={{ title: 'T' }} />)
    expect(container.firstChild).toBeNull()
    cleanup()
  })

  it('photoUrl рендерит превью картинку', () => {
    const wp = { url: 'https://x.com', title: 'T', photoUrl: 'cc-media://media/1.jpg' }
    const { container } = render(<LinkPreview wp={wp} />)
    expect(container.innerHTML).toContain('cc-media://media/1.jpg')
    cleanup()
  })

  it('isOutgoing меняет цвет border', () => {
    const wp = { url: 'https://x.com', title: 'T' }
    const { container: out } = render(<LinkPreview wp={wp} isOutgoing={true} />)
    const { container: inc } = render(<LinkPreview wp={wp} isOutgoing={false} />)
    expect(out.innerHTML).not.toEqual(inc.innerHTML)
    cleanup()
  })

  it('snapshot: типичная карточка', () => {
    const wp = { url: 'https://example.com', title: 'Example', description: 'Desc', siteName: 'example.com' }
    const { container } = render(<LinkPreview wp={wp} />)
    expect(container.innerHTML).toMatchSnapshot()
    cleanup()
  })
})
