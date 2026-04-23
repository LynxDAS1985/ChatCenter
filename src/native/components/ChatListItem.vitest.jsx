// v0.87.31: render-smoke + snapshot для ChatListItem.
import { describe, it, expect } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ChatListItem from './ChatListItem.jsx'

const baseChat = {
  id: 'tg_self:1', accountId: 'tg_self',
  title: 'Иван Иванов', lastMessage: 'Привет',
  lastMessageTs: 1712000000000, unreadCount: 0,
  type: 'user',
}

describe('ChatListItem render', () => {
  it('обычный user-чат', () => {
    const { container } = render(<ChatListItem chat={baseChat} />)
    expect(container.textContent).toContain('Иван Иванов')
    expect(container.textContent).toContain('Привет')
    cleanup()
  })

  it('непрочитанные показывают бейдж', () => {
    const { container } = render(<ChatListItem chat={{ ...baseChat, unreadCount: 5 }} />)
    expect(container.textContent).toContain('5')
    cleanup()
  })

  it('unread > 999 показывает 999+', () => {
    const { container } = render(<ChatListItem chat={{ ...baseChat, unreadCount: 1500 }} />)
    expect(container.textContent).toContain('999+')
    cleanup()
  })

  it('канал (📢)', () => {
    const { container } = render(<ChatListItem chat={{ ...baseChat, type: 'channel' }} />)
    expect(container.textContent).toContain('📢')
    cleanup()
  })

  it('группа (👥)', () => {
    const { container } = render(<ChatListItem chat={{ ...baseChat, type: 'group' }} />)
    expect(container.textContent).toContain('👥')
    cleanup()
  })

  it('бот (🤖)', () => {
    const { container } = render(<ChatListItem chat={{ ...baseChat, isBot: true }} />)
    expect(container.textContent).toContain('🤖')
    cleanup()
  })

  it('онлайн-точка зелёная', () => {
    const { container } = render(<ChatListItem chat={{ ...baseChat, isOnline: true }} />)
    expect(container).toBeTruthy()
    cleanup()
  })

  it('аватарка с URL задаёт background-image', () => {
    const { container } = render(<ChatListItem chat={{ ...baseChat, avatar: 'cc-media://avatars/1.jpg' }} />)
    expect(container.innerHTML).toContain('cc-media://avatars/1.jpg')
    cleanup()
  })

  it('инициалы когда нет аватарки', () => {
    const { container } = render(<ChatListItem chat={baseChat} />)
    expect(container.textContent).toContain('ИИ')  // Иван Иванов
    cleanup()
  })

  it('активный чат имеет другой background', () => {
    const { container: a } = render(<ChatListItem chat={baseChat} active={false} />)
    const { container: b } = render(<ChatListItem chat={baseChat} active={true} />)
    expect(a.innerHTML).not.toEqual(b.innerHTML)
    cleanup()
  })

  it('snapshot: обычный чат с unread', () => {
    const { container } = render(<ChatListItem chat={{ ...baseChat, unreadCount: 3 }} />)
    expect(container.innerHTML).toMatchSnapshot()
    cleanup()
  })

  it('snapshot: канал с большим счётчиком', () => {
    const { container } = render(<ChatListItem chat={{
      ...baseChat, type: 'channel', unreadCount: 42, title: 'Автопоток',
    }} />)
    expect(container.innerHTML).toMatchSnapshot()
    cleanup()
  })

  // v0.87.51: groupedUnread удалён — UI показывает чистый unreadCount от Telegram API.
  it('v0.87.51: unreadCount=9 показывает 9 (Telegram API value)', () => {
    const { container } = render(<ChatListItem chat={{
      ...baseChat, unreadCount: 9,
    }} />)
    expect(container.querySelector('[style*="background: var(--amoled-accent)"]').textContent).toBe('9')
    cleanup()
  })

  it('v0.87.51: groupedUnread если задан — ИГНОРИРУЕТСЯ (используем unreadCount)', () => {
    // Даже если где-то остался груженный груздь в chat, UI должен показывать unreadCount.
    const { container } = render(<ChatListItem chat={{
      ...baseChat, unreadCount: 5, groupedUnread: 1,  // groupedUnread игнорируется
    }} />)
    expect(container.querySelector('[style*="background: var(--amoled-accent)"]').textContent).toBe('5')
    cleanup()
  })
})
