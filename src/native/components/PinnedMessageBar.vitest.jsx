// v0.95.5: тесты pinned-overlay компонента.
//
// Главное — что блок position:absolute (overlay), а не flex-child. Это закрывает
// баг «дёрг при появлении закреплённого» (28 мая 2026): был {pinnedMsg && <div>} в
// потоке flex → async setState через 50-500мс толкало ленту вниз.
//
// Также проверяем z-index: 4 — выше dragOver overlay (2), ниже кнопки ↓ (5).
// Контрактные тесты — гарантия что переход в обычный flex-child (регрессия) поймается.

import { describe, it, expect, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import PinnedMessageBar from './PinnedMessageBar.jsx'

describe('PinnedMessageBar — overlay позиционирование (v0.95.5)', () => {
  it('без pinnedMsg — ничего не рендерит (null)', () => {
    const { container } = render(<PinnedMessageBar pinnedMsg={null} onClose={() => {}} />)
    expect(container.querySelector('.native-pinned-bar')).toBeNull()
    expect(container.firstChild).toBeNull()
    cleanup()
  })

  it('с pinnedMsg — блок position:absolute (НЕ в потоке layout)', () => {
    const { container } = render(
      <PinnedMessageBar pinnedMsg={{ text: 'Тестовое закреплённое' }} onClose={() => {}} />
    )
    const bar = container.querySelector('.native-pinned-bar')
    expect(bar).toBeTruthy()
    // Главная гарантия — position:absolute. Если кто-то поменяет на relative/static —
    // вернётся баг с «дёргом», тест отловит.
    expect(bar.style.position).toBe('absolute')
    expect(bar.style.top).toBe('0px')
    expect(bar.style.left).toBe('0px')
    expect(bar.style.right).toBe('0px')
    cleanup()
  })

  it('z-index = 4 — выше dragOver(2) overlay, ниже кнопки ↓(5)', () => {
    const { container } = render(
      <PinnedMessageBar pinnedMsg={{ text: 'msg' }} onClose={() => {}} />
    )
    const bar = container.querySelector('.native-pinned-bar')
    expect(bar.style.zIndex).toBe('4')
    cleanup()
  })

  it('показывает текст pinned-сообщения (обрезка 100 символов)', () => {
    const longText = 'А'.repeat(200)
    const { container } = render(
      <PinnedMessageBar pinnedMsg={{ text: longText }} onClose={() => {}} />
    )
    expect(container.textContent).toContain('Закреплённое')
    // Не больше 100 символов из текста + лейбл + emoji
    const aCount = (container.textContent.match(/А/g) || []).length
    expect(aCount).toBe(100)
    cleanup()
  })

  it('без text — fallback [медиа]', () => {
    const { container } = render(
      <PinnedMessageBar pinnedMsg={{ text: null }} onClose={() => {}} />
    )
    expect(container.textContent).toContain('[медиа]')
    cleanup()
  })

  it('клик по ✕ вызывает onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <PinnedMessageBar pinnedMsg={{ text: 'msg' }} onClose={onClose} />
    )
    const closeBtn = container.querySelector('button[title="Скрыть"]')
    expect(closeBtn).toBeTruthy()
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('v1.2.167: клик по телу полосы вызывает onJump (переход к сообщению)', () => {
    const onJump = vi.fn()
    const { container } = render(
      <PinnedMessageBar pinnedMsg={{ id: 5, text: 'msg' }} onClose={() => {}} onJump={onJump} />
    )
    const clickable = container.querySelector('.native-pinned-bar > div') // область 📌+текст
    fireEvent.click(clickable)
    expect(onJump).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('v1.2.167: клик по ✕ НЕ вызывает onJump (только закрытие)', () => {
    const onJump = vi.fn(); const onClose = vi.fn()
    const { container } = render(
      <PinnedMessageBar pinnedMsg={{ id: 5, text: 'msg' }} onClose={onClose} onJump={onJump} />
    )
    fireEvent.click(container.querySelector('button[title="Скрыть"]'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onJump).not.toHaveBeenCalled()
    cleanup()
  })

  it('v1.2.166: фон СПЛОШНОЙ непрозрачный (читаемость на любом сообщении под полосой)', () => {
    const { container } = render(
      <PinnedMessageBar pinnedMsg={{ text: 'msg' }} onClose={() => {}} />
    )
    const bar = container.querySelector('.native-pinned-bar')
    // Раньше был полупрозрачный фон + blur → текст сливался на светлых сообщениях.
    // Теперь сплошной панельный фон (var(--amoled-surface)) и БЕЗ размытия.
    expect(bar.style.background).toContain('--amoled-surface')
    expect(bar.style.background).not.toContain('rgba') // не полупрозрачный
    const hasBlur = Boolean(
      (bar.style.backdropFilter && bar.style.backdropFilter.includes('blur')) ||
      (bar.style.WebkitBackdropFilter && bar.style.WebkitBackdropFilter.includes('blur'))
    )
    expect(hasBlur).toBe(false) // размытие убрано (непрозрачному не нужно)
    cleanup()
  })
})
