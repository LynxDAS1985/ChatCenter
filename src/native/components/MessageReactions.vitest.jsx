// v0.95.29: тесты MessageReactions.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReactionsList, QUICK_REACTIONS } from './MessageReactions.jsx'

describe('MessageReactions (v0.95.29)', () => {
  it('QUICK_REACTIONS содержит 8 эмодзи', () => {
    expect(QUICK_REACTIONS).toHaveLength(8)
    expect(QUICK_REACTIONS).toContain('👍')
    expect(QUICK_REACTIONS).toContain('❤️')
    expect(QUICK_REACTIONS).toContain('🔥')
  })

  it('ReactionsList: рендерит реакции с count', () => {
    const reactions = [
      { emoji: '👍', count: 3, chosen: false },
      { emoji: '❤️', count: 1, chosen: true },
    ]
    render(<ReactionsList reactions={reactions} onToggle={vi.fn()} isOutgoing={false} />)
    expect(screen.getByText('👍')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('❤️')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('ReactionsList: chosen реакция имеет акцентный фон', () => {
    const reactions = [
      { emoji: '👍', count: 1, chosen: true },
    ]
    const { container } = render(
      <ReactionsList reactions={reactions} onToggle={vi.fn()} isOutgoing={false} />
    )
    const btn = container.querySelector('button')
    // chosen → ярче background (rgba(42,171,238,0.35) или подобное)
    expect(btn.getAttribute('style')).toMatch(/rgba\(42, ?171, ?238/)
  })

  it('ReactionsList: клик по реакции → onToggle(emoji, action)', () => {
    const onToggle = vi.fn()
    const reactions = [{ emoji: '👍', count: 1, chosen: false }]
    render(<ReactionsList reactions={reactions} onToggle={onToggle} isOutgoing={false} />)
    fireEvent.click(screen.getByText('👍'))
    expect(onToggle).toHaveBeenCalledWith('👍', 'add')
  })

  it('ReactionsList: клик по СВОЕЙ реакции (chosen) → remove', () => {
    const onToggle = vi.fn()
    const reactions = [{ emoji: '❤️', count: 1, chosen: true }]
    render(<ReactionsList reactions={reactions} onToggle={onToggle} isOutgoing={false} />)
    fireEvent.click(screen.getByText('❤️'))
    expect(onToggle).toHaveBeenCalledWith('❤️', 'remove')
  })

  it('ReactionsList: пустые/null reactions → ничего не рендерим', () => {
    const { container: c1 } = render(<ReactionsList reactions={null} onToggle={vi.fn()} />)
    expect(c1.children).toHaveLength(0)
    const { container: c2 } = render(<ReactionsList reactions={[]} onToggle={vi.fn()} />)
    expect(c2.children).toHaveLength(0)
  })

  it('ReactionsList: outgoing (свой) bubble — белый стиль', () => {
    const reactions = [{ emoji: '👍', count: 1, chosen: false }]
    const { container } = render(
      <ReactionsList reactions={reactions} onToggle={vi.fn()} isOutgoing={true} />
    )
    const btn = container.querySelector('button')
    // outgoing → rgba(255,255,255,...) background
    expect(btn.getAttribute('style')).toMatch(/rgba\(255, ?255, ?255/)
  })

  it('ReactionsList: count=0 → не показывает число (только emoji)', () => {
    const reactions = [{ emoji: '👍', count: 0, chosen: false }]
    render(<ReactionsList reactions={reactions} onToggle={vi.fn()} />)
    expect(screen.getByText('👍')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })
})
