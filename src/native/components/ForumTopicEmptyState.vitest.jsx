// v0.95.18: тесты ForumTopicEmptyState — empty state для форума без выбранной темы.

import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ForumTopicEmptyState from './ForumTopicEmptyState.jsx'

describe('ForumTopicEmptyState (v0.95.18)', () => {
  it('рендерит иконку 📚 + заголовок + подсказку', () => {
    const { container } = render(<ForumTopicEmptyState />)
    expect(container.textContent).toContain('📚')
    expect(container.textContent).toContain('Это форум-чат')
    expect(container.textContent).toMatch(/выберите тему/i)
    cleanup()
  })

  it('position: absolute inset:0 — перекрывает scroll-wrapper', () => {
    const { container } = render(<ForumTopicEmptyState />)
    const el = container.querySelector('.native-forum-empty-state')
    expect(el).toBeTruthy()
    expect(el.style.position).toBe('absolute')
    cleanup()
  })

  it('pointer-events: none — не блокирует клики (например по теме)', () => {
    const { container } = render(<ForumTopicEmptyState />)
    const el = container.querySelector('.native-forum-empty-state')
    expect(el.style.pointerEvents).toBe('none')
    cleanup()
  })

  it('display: flex с column направлением для вертикальной композиции', () => {
    const { container } = render(<ForumTopicEmptyState />)
    const el = container.querySelector('.native-forum-empty-state')
    expect(el.style.display).toBe('flex')
    expect(el.style.flexDirection).toBe('column')
    cleanup()
  })
})
