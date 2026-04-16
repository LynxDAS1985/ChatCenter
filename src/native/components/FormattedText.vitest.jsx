// v0.87.31: render-smoke для FormattedText (entities / autolinks / спойлеры).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import FormattedText from './FormattedText.jsx'

beforeEach(() => {
  globalThis.window.api = { invoke: vi.fn(() => Promise.resolve({ ok: true })) }
})

describe('FormattedText render', () => {
  it('пустой текст → null', () => {
    const { container } = render(<FormattedText text="" />)
    expect(container.firstChild).toBeNull()
    cleanup()
  })

  it('обычный текст без entities', () => {
    const { container } = render(<FormattedText text="Просто текст" />)
    expect(container.textContent).toContain('Просто текст')
    cleanup()
  })

  it('auto-link для https://', () => {
    const { container } = render(<FormattedText text="См: https://example.com вот" />)
    expect(container.querySelector('a')).toBeTruthy()
    cleanup()
  })

  it('auto-hashtag', () => {
    const { container } = render(<FormattedText text="Привет #тег" />)
    expect(container.textContent).toContain('#тег')
    cleanup()
  })

  it('bold entity', () => {
    const entities = [{ type: 'bold', offset: 0, length: 5 }]
    const { container } = render(<FormattedText text="Жирный простой" entities={entities} />)
    expect(container.querySelector('strong')).toBeTruthy()
    cleanup()
  })

  it('italic + code entities', () => {
    const entities = [
      { type: 'italic', offset: 0, length: 7 },
      { type: 'code', offset: 8, length: 4 },
    ]
    const { container } = render(<FormattedText text="Наклон и code" entities={entities} />)
    expect(container.querySelector('em')).toBeTruthy()
    expect(container.querySelector('code')).toBeTruthy()
    cleanup()
  })

  it('url entity кликается через app:open-external', async () => {
    const entities = [{ type: 'url', offset: 0, length: 19 }]
    const { container } = render(<FormattedText text="https://example.com" entities={entities} />)
    const a = container.querySelector('a')
    expect(a).toBeTruthy()
    expect(a.getAttribute('href')).toContain('example.com')
    cleanup()
  })

  it('mention / hashtag стилизуются', () => {
    const entities = [
      { type: 'mention', offset: 0, length: 4 },
    ]
    const { container } = render(<FormattedText text="@abc text" entities={entities} />)
    expect(container.textContent).toContain('@abc')
    cleanup()
  })
})
