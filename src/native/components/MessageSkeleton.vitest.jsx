// v0.87.36: vitest для MessageSkeleton / MessageListOverlay.
import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import MessageSkeleton, { MessageListOverlay } from './MessageSkeleton.jsx'

describe('MessageSkeleton', () => {
  it('рендерит 4 плейсхолдера по умолчанию', () => {
    const { container } = render(<MessageSkeleton />)
    const skeletons = container.querySelectorAll('.native-msg-skeleton')
    expect(skeletons.length).toBe(4)
    cleanup()
  })

  it('рендерит заданное число count', () => {
    const { container } = render(<MessageSkeleton count={6} />)
    const skeletons = container.querySelectorAll('.native-msg-skeleton')
    expect(skeletons.length).toBe(6)
    cleanup()
  })

  it('каждый плейсхолдер имеет shimmer-элемент', () => {
    const { container } = render(<MessageSkeleton count={3} />)
    const shimmers = container.querySelectorAll('.native-msg-skeleton-shimmer')
    expect(shimmers.length).toBe(3)
    cleanup()
  })

  it('плейсхолдеры чередуют alignSelf (входящие/исходящие)', () => {
    const { container } = render(<MessageSkeleton count={4} />)
    const sk = container.querySelectorAll('.native-msg-skeleton')
    // 1-й и 3-й слева, 2-й справа (по sides массиву [0,1,0,0])
    expect(sk[0].style.alignSelf).toBe('flex-start')
    expect(sk[1].style.alignSelf).toBe('flex-end')
    expect(sk[2].style.alignSelf).toBe('flex-start')
    cleanup()
  })
})

describe('MessageListOverlay', () => {
  it('скрыт при show=false', () => {
    const { container } = render(<MessageListOverlay show={false} />)
    expect(container.firstChild).toBeNull()
    cleanup()
  })

  it('видим при show=true с spinner + текстом', () => {
    const { container } = render(<MessageListOverlay show={true} />)
    expect(container.querySelector('.native-msg-overlay')).toBeTruthy()
    expect(container.querySelector('.native-msg-overlay-shimmer')).toBeTruthy()
    expect(container.querySelector('.native-spinner')).toBeTruthy()
    expect(container.textContent).toContain('Обновляю сообщения')
    cleanup()
  })
})
