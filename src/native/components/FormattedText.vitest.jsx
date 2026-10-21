// v0.87.31: render-smoke для FormattedText (entities / autolinks / спойлеры).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
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

  // v1.2.514: ссылки в исходящих сообщениях белые (#ffffff) с подчеркиванием
  it('v1.2.514: ссылки в исходящих сообщениях белые с подчеркиванием (не сливаются с фоном)', () => {
    const { container } = render(<FormattedText text="Сайт https://test.ru и почта support@chatcenter.ru" isOutgoing={true} />)
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(2)
    for (const a of links) {
      expect(['#ffffff', 'rgb(255, 255, 255)']).toContain(a.style.color)
      expect(a.style.textDecoration).toBe('underline')
    }
    cleanup()
  })

  it('v1.2.514: entity email в исходящих сообщениях белый с подчеркиванием', () => {
    const entities = [{ type: 'email', offset: 0, length: 22 }]
    const { container } = render(<FormattedText text="alexdugin818@gmail.com" entities={entities} isOutgoing={true} />)
    const a = container.querySelector('a')
    expect(a).toBeTruthy()
    expect(a.getAttribute('href')).toBe('mailto:alexdugin818@gmail.com')
    expect(['#ffffff', 'rgb(255, 255, 255)']).toContain(a.style.color)
    expect(a.style.textDecoration).toBe('underline')
    cleanup()
  })

  it('v1.2.514: ссылки имеют всплывающую подсказку title с полным адресом', () => {
    const entities = [{ type: 'texturl', offset: 0, length: 5, url: 'https://secret.target.org/page' }]
    const { container } = render(<FormattedText text="Тыкни сюда" entities={entities} />)
    const a = container.querySelector('a')
    expect(a.getAttribute('title')).toBe('https://secret.target.org/page')
    cleanup()
  })

  it('v1.2.514: правый клик по ссылке открывает меню копирования адреса', () => {
    const { container } = render(<FormattedText text="Смотри https://example.com/item" />)
    const a = container.querySelector('a')
    expect(a).toBeTruthy()
    act(() => {
      fireEvent.contextMenu(a, { clientX: 100, clientY: 100 })
    })
    expect(container.textContent).toContain('Копировать адрес ссылки')
    cleanup()
  })

  it('v1.2.514: entities=null не приводит к ошибке', () => {
    const { container } = render(<FormattedText text="Тестовый текст" entities={null} />)
    expect(container.textContent).toContain('Тестовый текст')
    cleanup()
  })

  it('v1.2.514: авто-детект email с плюсом (+tag) корректно сохраняет полный адрес', () => {
    const { container } = render(<FormattedText text="Пишите на client+support@chatcenter.ru" />)
    const a = container.querySelector('a')
    expect(a).toBeTruthy()
    expect(a.getAttribute('href')).toBe('mailto:client+support@chatcenter.ru')
    cleanup()
  })

  it('v1.2.514: контекстное меню ссылки закрывается по Escape', () => {
    const { container } = render(<FormattedText text="Ссылка https://example.com" />)
    const a = container.querySelector('a')
    act(() => {
      fireEvent.contextMenu(a, { clientX: 100, clientY: 100 })
    })
    expect(container.textContent).toContain('Копировать адрес ссылки')
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(container.textContent).not.toContain('Копировать адрес ссылки')
    cleanup()
  })

  it('v1.2.514: t.me ссылки нормализуются с префиксом https://', () => {
    const { container } = render(<FormattedText text="Канал t.me/durov" />)
    const a = container.querySelector('a')
    expect(a).toBeTruthy()
    expect(a.getAttribute('href')).toBe('https://t.me/durov')
    expect(a.getAttribute('title')).toBe('https://t.me/durov')
    cleanup()
  })
})
