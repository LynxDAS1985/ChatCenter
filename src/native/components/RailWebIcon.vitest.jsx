// v1.2.256 — тест значка веб-мессенджера в единой полосе (Модель 🅰️).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import RailWebIcon from './RailWebIcon.jsx'

afterEach(() => cleanup())
const m = { id: 'vk', name: 'ВКонтакте', emoji: '🅥', color: '#0077FF' }

describe('RailWebIcon', () => {
  it('рисует значок по имени и эмодзи', () => {
    const { getByTitle } = render(<RailWebIcon messenger={m} onSelect={() => {}} />)
    const el = getByTitle('ВКонтакте')
    expect(el).toBeTruthy()
    expect(el.getAttribute('data-web-id')).toBe('vk')
  })

  it('клик зовёт onSelect с id мессенджера', () => {
    const onSelect = vi.fn()
    const { getByTitle } = render(<RailWebIcon messenger={m} onSelect={onSelect} />)
    fireEvent.click(getByTitle('ВКонтакте'))
    expect(onSelect).toHaveBeenCalledWith('vk')
  })

  it('активный помечен aria-current; бейдж непрочитанных показывается', () => {
    const { getByTitle } = render(<RailWebIcon messenger={m} isActive unread={7} onSelect={() => {}} />)
    const el = getByTitle('ВКонтакте')
    expect(el.getAttribute('aria-current')).toBe('true')
    expect(el.textContent).toContain('7')
  })

  it('>99 показывает «99+»; без непрочитанных бейджа нет', () => {
    const { getByTitle, rerender } = render(<RailWebIcon messenger={m} unread={150} onSelect={() => {}} />)
    expect(getByTitle('ВКонтакте').textContent).toContain('99+')
    rerender(<RailWebIcon messenger={m} unread={0} onSelect={() => {}} />)
    expect(getByTitle('ВКонтакте').textContent).not.toContain('0')
  })

  // v1.2.257: функции вкладок на веб-значке
  it('правый клик зовёт onContextMenu с id и координатами', () => {
    const onContextMenu = vi.fn()
    const { getByTitle } = render(<RailWebIcon messenger={m} onSelect={() => {}} onContextMenu={onContextMenu} />)
    fireEvent.contextMenu(getByTitle('ВКонтакте'), { clientX: 30, clientY: 300 })
    expect(onContextMenu).toHaveBeenCalledWith('vk', 30, 300)
  })

  it('перетаскивание вызывает обработчики drag с id', () => {
    const onDragStart = vi.fn()
    const onDrop = vi.fn()
    const { getByTitle } = render(<RailWebIcon messenger={m} onSelect={() => {}} onDragStart={onDragStart} onDrop={onDrop} />)
    const el = getByTitle('ВКонтакте')
    fireEvent.dragStart(el)
    fireEvent.drop(el)
    expect(onDragStart).toHaveBeenCalledWith('vk')
    expect(onDrop).toHaveBeenCalledWith('vk')
  })

  // v1.2.280 (ревью #4): покрываем новые ветки — фото аккаунта и круглую форму.
  it('есть avatar → фон-картинка (url) поверх круглого значка', () => {
    const av = 'data:image/png;base64,AAAA'
    const { getByTitle } = render(<RailWebIcon messenger={m} avatar={av} onSelect={() => {}} />)
    const style = getByTitle('ВКонтакте').getAttribute('style') || ''
    expect(style).toContain('url(') // фото показано фоном
    expect(style).toContain('50%')  // круглый (borderRadius:'50%')
  })

  it('нет avatar → фон без картинки, но значок всё равно круглый', () => {
    const { getByTitle } = render(<RailWebIcon messenger={m} onSelect={() => {}} />)
    const style = getByTitle('ВКонтакте').getAttribute('style') || ''
    expect(style).not.toContain('url(') // логотип, не фото
    expect(style).toContain('50%')      // круглый
  })

  // v1.2.317 (ревью #1): распознавание типа по имени НЕ должно ловить чужие слова с подстрокой vk/max.
  it('кастомная вкладка «Vkusvill» НЕ получает логотип ВК (маска не по подстроке)', () => {
    const src = { id: 'custom_1', name: 'Vkusvill', emoji: '🛒', color: '#123456' }
    const { container } = render(<RailWebIcon messenger={src} onSelect={() => {}} />)
    expect(container.querySelector('img')).toBeNull() // логотипа нет
    expect(container.textContent).toContain('🛒')      // показан свой эмодзи
  })

  it('кастомная вкладка «MaxBet» НЕ получает логотип МАКС', () => {
    const src = { id: 'custom_3', name: 'MaxBet', emoji: '🎲', color: '#123456' }
    const { container } = render(<RailWebIcon messenger={src} onSelect={() => {}} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('🎲')
  })

  it('кастомный ВК (id custom_, имя «ВКонтакте») всё равно получает логотип', () => {
    const src = { id: 'custom_2', name: 'ВКонтакте', emoji: '🅥', color: '#0077FF' }
    const { container } = render(<RailWebIcon messenger={src} onSelect={() => {}} />)
    expect(container.querySelector('img')).not.toBeNull() // кириллическое имя → логотип есть
  })
})
