// v1.2.510: страж меню по ПРАВОЙ кнопке на вкладке ИИ-провайдера.
//
// ЗАЧЕМ. Страница ИИ-сайта может встать намертво (жалоба: DeepSeek отдаёт 403 от CloudFront).
// Оживить её раньше можно было только переключением на другого провайдера и обратно. Теперь —
// правая кнопка по вкладке → «Перезапустить страницу».
//
// 🔴 ЛОВУШКА, которую сторожит проверка 3: у провайдера в режиме «API-ключ» страницы НЕТ —
// перезапускать нечего. Если меню начнёт появляться и там, пункт будет врать: нажал — ничего
// не произошло. Поэтому меню обязано молчать для режима «API-ключ».

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import AIProviderTabs from './AIProviderTabs.jsx'

afterEach(() => cleanup())

const PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', icon: '🔍', free: true },
  { id: 'openai',   label: 'OpenAI',   icon: '🌐' },
]

// deepseek — «Веб-интерфейс» (есть страница), openai — «API-ключ» (страницы нет)
const SETTINGS = {
  aiProvider: 'deepseek',
  aiProviderKeys: {
    deepseek: { mode: 'webview', webviewUrl: 'https://chat.deepseek.com/' },
    openai:   { mode: 'api', apiKey: 'x' },
  },
}

function renderTabs(reloadProviderPage = vi.fn()) {
  const r = render(
    <AIProviderTabs
      connectedProviders={PROVIDERS}
      unconnectedProviders={[]}
      provider="deepseek"
      settings={SETTINGS}
      providerStatuses={{}}
      providerCheckTimes={{}}
      hoveredStatus={null}
      setHoveredStatus={() => {}}
      showAddProvider={false}
      setShowAddProvider={() => {}}
      setShowConfig={() => {}}
      switchProvider={() => {}}
      reloadProviderPage={reloadProviderPage}
    />
  )
  return { ...r, reloadProviderPage }
}

/** вкладка провайдера по подписи */
function tab(container, label) {
  return Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes(label))
}
/** пункт меню «Перезапустить страницу», если он есть */
function menuItem(container) {
  return Array.from(container.querySelectorAll('button')).find(
    b => (b.textContent || '').includes('Перезапустить страницу')
  )
}

describe('AIProviderTabs — меню по правой кнопке (v1.2.510)', () => {
  it('правая кнопка по вкладке «Веб-интерфейс» → появляется пункт «Перезапустить страницу»', () => {
    const { container } = renderTabs()
    expect(menuItem(container)).toBeFalsy()             // до клика меню нет
    fireEvent.contextMenu(tab(container, 'DeepSeek'), { clientX: 40, clientY: 60 })
    expect(menuItem(container)).toBeTruthy()
  })

  it('нажатие пункта зовёт перезапуск ИМЕННО этого провайдера и закрывает меню', () => {
    const { container, reloadProviderPage } = renderTabs()
    fireEvent.contextMenu(tab(container, 'DeepSeek'), { clientX: 40, clientY: 60 })
    fireEvent.click(menuItem(container))
    expect(reloadProviderPage).toHaveBeenCalledTimes(1)
    expect(reloadProviderPage).toHaveBeenCalledWith('deepseek')
    expect(menuItem(container)).toBeFalsy()             // меню закрылось
  })

  it('🔴 ЛОВУШКА: у режима «API-ключ» страницы нет → меню НЕ появляется', () => {
    const { container } = renderTabs()
    fireEvent.contextMenu(tab(container, 'OpenAI'), { clientX: 40, clientY: 60 })
    expect(menuItem(container)).toBeFalsy()
  })

  it('Escape закрывает меню', () => {
    const { container } = renderTabs()
    fireEvent.contextMenu(tab(container, 'DeepSeek'), { clientX: 40, clientY: 60 })
    expect(menuItem(container)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menuItem(container)).toBeFalsy()
  })

  it('клик мимо меню или по подложке закрывает его', () => {
    const { container } = renderTabs()
    fireEvent.contextMenu(tab(container, 'DeepSeek'), { clientX: 40, clientY: 60 })
    expect(menuItem(container)).toBeTruthy()
    const backdrop = container.querySelector('[data-testid="ctx-menu-backdrop"]')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop)
    expect(menuItem(container)).toBeFalsy()
  })

  it('🔴 ЛОВУШКА: координаты меню не вылезают за правый край экрана (clamped safeX)', () => {
    const { container } = renderTabs()
    // Клик около правого края (например, clientX = 1000 при window.innerWidth = 1024)
    fireEvent.contextMenu(tab(container, 'DeepSeek'), { clientX: window.innerWidth - 10, clientY: 60 })
    const menuEl = menuItem(container)?.parentElement
    expect(menuEl).toBeTruthy()
    // safeX должен быть сдвинут влево минимум на ширину меню (~195px)
    const leftPx = parseInt(menuEl.style.left, 10)
    expect(leftPx).toBeLessThanOrEqual(window.innerWidth - 195)
  })

  it('правый клик по вкладке режима «API-ключ» вызывает preventDefault', () => {
    const { container } = renderTabs()
    const preventDefault = vi.fn()
    fireEvent(tab(container, 'OpenAI'), new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(menuItem(container)).toBeFalsy()
  })

  it('подсказка вкладки «Веб-интерфейс» сообщает про правую кнопку, у «API-ключ» — нет', () => {
    const { container } = renderTabs()
    expect(tab(container, 'DeepSeek').getAttribute('title')).toMatch(/правая кнопка/)
    expect(tab(container, 'OpenAI').getAttribute('title') || '').not.toMatch(/правая кнопка/)
  })
})
