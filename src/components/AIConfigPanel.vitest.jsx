// v1.1.7: тесты переключения режима AI (fix из v1.1.5 бага set()).
// Проверяем что:
// - Клик «API-ключ» вызывает setProviderProp('mode', 'api') — НЕ set
// - Клик «Веб-интерфейс» вызывает setProviderProp('mode', 'webview') — НЕ set
// - Клик переключателя contextMode → setProviderProp
// - Изменение webviewUrl → setProviderProp
// - aiApiKey / aiModel / aiClientSecret продолжают идти через set (глобальные)

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import AIConfigPanel from './AIConfigPanel.jsx'

afterEach(cleanup)

function baseProps(overrides = {}) {
  return {
    showConfig: true,
    setShowConfig: vi.fn(),
    providerMode: 'api',
    aiCfg: {
      provider: 'deepseek',
      apiKey: 'sk-test',
      clientSecret: '',
      model: 'deepseek-chat',
      webviewUrl: 'https://chat.deepseek.com',
      contextMode: 'last',
    },
    set: vi.fn(),
    setProviderProp: vi.fn(),
    showKey: false,
    setShowKey: vi.fn(),
    showSecret: false,
    setShowSecret: vi.fn(),
    testing: false,
    testStatus: null,
    justSaved: false,
    waitingForKey: false,
    keyFoundMsg: '',
    providerInfo: { id: 'deepseek', label: 'DeepSeek' },
    openProviderUrl: vi.fn(),
    openLoginWindow: vi.fn(),
    testConnection: vi.fn(),
    ...overrides,
  }
}

describe('AIConfigPanel — переключение режима (v1.1.7 fix)', () => {
  it('клик «API-ключ» вызывает setProviderProp(mode, api), НЕ set()', () => {
    const props = baseProps({ providerMode: 'webview' })
    const { getByText } = render(<AIConfigPanel {...props} />)
    fireEvent.click(getByText('API-ключ'))
    expect(props.setProviderProp).toHaveBeenCalledWith('mode', 'api')
    expect(props.set).not.toHaveBeenCalledWith('mode', expect.anything())
  })

  it('клик «Веб-интерфейс» вызывает setProviderProp(mode, webview), НЕ set()', () => {
    const props = baseProps({ providerMode: 'api' })
    const { getByText } = render(<AIConfigPanel {...props} />)
    fireEvent.click(getByText('Веб-интерфейс'))
    expect(props.setProviderProp).toHaveBeenCalledWith('mode', 'webview')
    expect(props.set).not.toHaveBeenCalledWith('mode', expect.anything())
  })

  it('webview режим: изменение URL → setProviderProp(webviewUrl, ...)', () => {
    const props = baseProps({ providerMode: 'webview' })
    const { container } = render(<AIConfigPanel {...props} />)
    const urlInput = container.querySelector('input[type="text"]')
    expect(urlInput).toBeTruthy()
    fireEvent.change(urlInput, { target: { value: 'https://custom.deepseek.com' } })
    expect(props.setProviderProp).toHaveBeenCalledWith('webviewUrl', 'https://custom.deepseek.com')
    expect(props.set).not.toHaveBeenCalledWith('webviewUrl', expect.anything())
  })

  it('webview режим: клик «Сбросить» → setProviderProp(webviewUrl, default)', () => {
    const props = baseProps({
      providerMode: 'webview',
      aiCfg: { ...baseProps().aiCfg, webviewUrl: 'https://custom.url' },
    })
    const { getByText } = render(<AIConfigPanel {...props} />)
    // Кнопка появляется только если URL не дефолтный
    const resetBtn = getByText(/Сбросить на стандартный/)
    fireEvent.click(resetBtn)
    expect(props.setProviderProp).toHaveBeenCalledWith('webviewUrl', expect.any(String))
  })

  it('webview режим: клик переключателя contextMode → setProviderProp', () => {
    const props = baseProps({ providerMode: 'webview' })
    const { getByText } = render(<AIConfigPanel {...props} />)
    // 3 кнопки contextMode: «Ничего» / «Последнее» / «История»
    fireEvent.click(getByText('История'))
    expect(props.setProviderProp).toHaveBeenCalledWith('contextMode', 'full')
  })

  it('API mode: aiApiKey изменение → set() (глобальное поле)', () => {
    const props = baseProps({ providerMode: 'api' })
    const { container } = render(<AIConfigPanel {...props} />)
    // ищем password input для apiKey
    const inputs = container.querySelectorAll('input')
    const apiInput = Array.from(inputs).find(i => i.value === 'sk-test')
    expect(apiInput).toBeTruthy()
    fireEvent.change(apiInput, { target: { value: 'sk-new' } })
    expect(props.set).toHaveBeenCalledWith('aiApiKey', 'sk-new')
    expect(props.setProviderProp).not.toHaveBeenCalledWith('aiApiKey', expect.anything())
  })

  it('Активный режим API → ✓ на API-ключ кнопке', () => {
    const props = baseProps({ providerMode: 'api' })
    const { getByText } = render(<AIConfigPanel {...props} />)
    const apiBtn = getByText('API-ключ').closest('button')
    expect(apiBtn.textContent).toContain('✓')
  })

  it('Активный режим webview → ✓ на Веб-интерфейс кнопке', () => {
    const props = baseProps({ providerMode: 'webview' })
    const { getByText } = render(<AIConfigPanel {...props} />)
    const wvBtn = getByText('Веб-интерфейс').closest('button')
    expect(wvBtn.textContent).toContain('✓')
  })
})
