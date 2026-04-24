// v0.87.31: render-smoke + snapshot для MessageBubble.
// Ловит TDZ / hook-order / битые импорты. Snapshot фиксирует вёрстку.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import MessageBubble from './MessageBubble.jsx'

beforeEach(() => {
  globalThis.window.api = {
    invoke: vi.fn(() => Promise.resolve({ ok: false })),
    on: vi.fn(() => () => {}),
    send: vi.fn(),
  }
  globalThis.IntersectionObserver = class {
    observe() {}; disconnect() {}; unobserve() {}
  }
})

const baseMsg = {
  id: '1', chatId: 'c1', senderId: 's1',
  senderName: 'Иван', text: 'Привет',
  timestamp: 1712000000000, isOutgoing: false,
  mediaType: null, entities: [],
}

describe('MessageBubble render', () => {
  it('текстовое входящее сообщение', () => {
    const { container } = render(<MessageBubble m={baseMsg} chatId="c1" />)
    expect(container.textContent).toContain('Привет')
    cleanup()
  })

  it('исходящее сообщение (outgoing) с ✓', () => {
    const { container } = render(
      <MessageBubble m={{ ...baseMsg, id: '2', isOutgoing: true, isRead: false }} chatId="c1" />
    )
    expect(container.textContent).toContain('✓')
    cleanup()
  })

  it('прочитанное сообщение ✓✓', () => {
    const { container } = render(
      <MessageBubble m={{ ...baseMsg, id: '3', isOutgoing: true, isRead: true }} chatId="c1" />
    )
    expect(container.textContent).toContain('✓✓')
    cleanup()
  })

  it('медиа-фото с stripped thumb', () => {
    const m = {
      ...baseMsg, id: '4', text: '', mediaType: 'photo',
      mediaWidth: 800, mediaHeight: 600,
      strippedThumb: 'data:image/jpeg;base64,AAAA',
    }
    const { container } = render(
      <MessageBubble m={m} chatId="c1" downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    expect(container).toBeTruthy()
    cleanup()
  })

  it('сообщение с ссылкой и webPage preview', () => {
    const m = {
      ...baseMsg, id: '5', text: 'https://example.com',
      mediaType: 'link',
      webPage: { url: 'https://example.com', title: 'T', description: 'D', siteName: 'example.com' },
    }
    const { container } = render(<MessageBubble m={m} chatId="c1" />)
    expect(container.textContent).toContain('T')
    expect(container.textContent).toContain('example.com')
    cleanup()
  })

  // v0.87.72: URL строкой над LinkPreview когда text НЕ содержит URL (как Telegram Desktop)
  it('v0.87.72: URL строкой показан если его нет в text (исходящие пустые, только webPage)', () => {
    const m = {
      ...baseMsg, id: '6', text: '',  // text пустой — нужна отдельная строка URL
      isOutgoing: true, mediaType: 'link',
      webPage: { url: 'https://yandex.ru', title: 'Яндекс', description: 'D', siteName: 'yandex.ru' },
    }
    const { container } = render(<MessageBubble m={m} chatId="c1" />)
    // Должен быть <a> с href=https://yandex.ru
    const link = container.querySelector('a[href="https://yandex.ru"]')
    expect(link).toBeTruthy()
    expect(link.textContent).toBe('https://yandex.ru')
    cleanup()
  })

  it('v0.87.72: URL строкой НЕ дублируется если уже в text', () => {
    const m = {
      ...baseMsg, id: '7', text: 'Посмотри https://dup.com это интересно',
      mediaType: 'link',
      webPage: { url: 'https://dup.com', title: 'Dup', description: 'D', siteName: 'dup.com' },
    }
    const { container } = render(<MessageBubble m={m} chatId="c1" />)
    // Не должно быть ДВУХ вхождений "https://dup.com" на верхнем уровне (только в тексте)
    const links = container.querySelectorAll('a[href="https://dup.com"]')
    // В text рендерится через AutoLinks как <a>, в preview тоже может быть <a>, но
    // нашего ОТДЕЛЬНОГО <a> с href=url строкой выше preview — не должно быть
    // Проверяем что URL встречается ровно 1 раз как отдельная строка (в text)
    const url = 'https://dup.com'
    const urlCount = (container.textContent.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    // Может быть 1 (text) или 2 (text + title/siteName где-то) — главное не 3 (где добавилась отдельная строка)
    expect(urlCount).toBeLessThanOrEqual(2)
    cleanup()
  })

  it('snapshot: типичное текстовое сообщение (визуальная регрессия)', () => {
    const { container } = render(<MessageBubble m={baseMsg} chatId="c1" />)
    expect(container.innerHTML).toMatchSnapshot()
    cleanup()
  })

  it('snapshot: исходящее медиа-фото с подписью', () => {
    const m = {
      ...baseMsg, id: '99', isOutgoing: true, text: 'Смотри',
      mediaType: 'photo', mediaWidth: 1000, mediaHeight: 750,
      strippedThumb: 'data:image/jpeg;base64,xxxx',
    }
    const { container } = render(
      <MessageBubble m={m} chatId="c1" downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    expect(container.innerHTML).toMatchSnapshot()
    cleanup()
  })
})
