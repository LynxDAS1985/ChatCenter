// v0.94.5: тест на облачко прогресса непрочитанных (#3 — защита от поломки).
import { describe, it, expect, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import UnreadProgressPill from './UnreadProgressPill.jsx'

describe('UnreadProgressPill', () => {
  it('show=true → видим, без класса --hidden, показывает N / M', () => {
    const { container } = render(<UnreadProgressPill show={true} loaded={100} total={1005} onClick={() => {}} />)
    const pill = container.querySelector('.native-unread-pill')
    expect(pill).toBeTruthy()
    expect(pill.className).not.toContain('native-unread-pill--hidden')
    expect(container.textContent).toContain('100')
    expect(container.textContent).toContain('1005')
    cleanup()
  })

  it('show=false → класс --hidden (плавно гаснет, не кликается)', () => {
    const { container } = render(<UnreadProgressPill show={false} loaded={100} total={1005} onClick={() => {}} />)
    expect(container.querySelector('.native-unread-pill').className).toContain('native-unread-pill--hidden')
    cleanup()
  })

  it('клик → вызывает onClick (переход к первому непрочитанному)', () => {
    const onClick = vi.fn()
    const { container } = render(<UnreadProgressPill show={true} loaded={50} total={300} onClick={onClick} />)
    fireEvent.click(container.querySelector('.native-unread-pill'))
    expect(onClick).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('total=0 → число не рендерится, только точка', () => {
    const { container } = render(<UnreadProgressPill show={true} loaded={0} total={0} onClick={() => {}} />)
    expect(container.querySelector('.native-unread-pill__dot')).toBeTruthy()
    expect(container.textContent).not.toContain('/')
    cleanup()
  })
})
