// v0.87.36: vitest для MessageSkeleton / MessageListOverlay.
import { describe, it, expect } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
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

  // v0.94.3: без кэша (hasContent=false) полоса показывается сразу, БЕЗ spinner/текста-пилюли
  it('v0.94.3: при show=true без кэша — тонкая полоса сразу, без spinner/текста', () => {
    const { container } = render(<MessageListOverlay show={true} />)
    expect(container.querySelector('.native-msg-overlay')).toBeTruthy()
    expect(container.querySelector('.native-msg-overlay-shimmer')).toBeTruthy()
    // пилюля «Обновляю сообщения...» убрана
    expect(container.querySelector('.native-spinner')).toBeNull()
    expect(container.textContent).not.toContain('Обновляю')
    cleanup()
  })

  // v0.94.3: с кэшем (hasContent=true) полоса ОТЛОЖЕНА на 250мс — мгновенно её нет
  // (быстрая загрузка <250мс не покажет полосу → нет мигания).
  it('v0.94.3: при hasContent полоса НЕ появляется мгновенно (задержка 250мс)', () => {
    const { container } = render(<MessageListOverlay show={true} hasContent={true} />)
    expect(container.querySelector('.native-msg-overlay')).toBeNull()
    cleanup()
  })

  // v0.94.3: при долгой загрузке полоса всё же появляется после задержки
  it('v0.94.3: при hasContent и долгой загрузке полоса появляется после задержки', async () => {
    const { container } = render(<MessageListOverlay show={true} hasContent={true} />)
    await waitFor(
      () => expect(container.querySelector('.native-msg-overlay')).toBeTruthy(),
      { timeout: 1000 }
    )
    cleanup()
  })
})
