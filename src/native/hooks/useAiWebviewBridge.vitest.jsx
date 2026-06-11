// v1.1.16 (Этап 7): тесты hook подключения webview к WebUI Bridge.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAiWebviewBridge } from './useAiWebviewBridge.js'

let savedApi

beforeEach(() => {
  savedApi = window.api
})
afterEach(() => {
  window.api = savedApi
})

function makeWebviewMock() {
  const listeners = new Map()
  return {
    addEventListener: vi.fn((ev, fn) => listeners.set(ev, fn)),
    removeEventListener: vi.fn((ev) => listeners.delete(ev)),
    setAttribute: vi.fn(),
    getWebContentsId: vi.fn(() => 42),
    _fire: (ev) => { const fn = listeners.get(ev); if (fn) fn({}) },
  }
}

describe('useAiWebviewBridge — gating', () => {
  it('providerMode !== webview → ничего не делает', () => {
    window.api = { invoke: vi.fn(), send: vi.fn() }
    const wv = makeWebviewMock()
    renderHook(() => useAiWebviewBridge({ current: wv }, 'https://chat.openai.com/', 'api'))
    expect(wv.addEventListener).not.toHaveBeenCalled()
  })

  it('пустой URL → ничего', () => {
    window.api = { invoke: vi.fn(), send: vi.fn() }
    const wv = makeWebviewMock()
    renderHook(() => useAiWebviewBridge({ current: wv }, '', 'webview'))
    expect(wv.addEventListener).not.toHaveBeenCalled()
  })

  it('ref пустой → ничего', () => {
    window.api = { invoke: vi.fn(), send: vi.fn() }
    expect(() => {
      renderHook(() => useAiWebviewBridge({ current: null }, 'https://chat.openai.com/', 'webview'))
    }).not.toThrow()
  })

  it('URL не AI-провайдер → лог + ничего не подключаем', () => {
    window.api = { invoke: vi.fn(), send: vi.fn() }
    const wv = makeWebviewMock()
    renderHook(() => useAiWebviewBridge({ current: wv }, 'https://example.com/', 'webview'))
    expect(wv.addEventListener).not.toHaveBeenCalled()
    // Лог через app:log про «не распознан»
    const logCalls = window.api.send.mock.calls.filter(c => c[0] === 'app:log')
    const unknownLog = logCalls.find(c => c[1].message.includes('host не распознан'))
    expect(unknownLog).toBeTruthy()
  })
})

describe('useAiWebviewBridge — happy path', () => {
  it('chat.openai.com → setAttribute preload + did-attach listener', async () => {
    window.api = {
      invoke: vi.fn().mockImplementation((channel) => {
        if (channel === 'app:get-paths') return Promise.resolve({ aiMonitorPreload: 'C:\\path\\ai-monitor.preload.cjs' })
        if (channel === 'ai-bridge:webui:register-webview') return Promise.resolve({ ok: true })
        return Promise.resolve(null)
      }),
      send: vi.fn(),
    }
    const wv = makeWebviewMock()
    renderHook(() => useAiWebviewBridge({ current: wv }, 'https://chat.openai.com/', 'webview'))
    // Ждём микротик чтобы async setupPreload отработал
    await new Promise(r => setTimeout(r, 50))
    expect(wv.setAttribute).toHaveBeenCalledWith('preload', expect.stringMatching(/^file:\/\//))
    expect(wv.addEventListener).toHaveBeenCalledWith('did-attach', expect.any(Function))
  })

  it('did-attach → IPC register с правильным providerId + webContentsId', async () => {
    window.api = {
      invoke: vi.fn().mockImplementation((channel) => {
        if (channel === 'app:get-paths') return Promise.resolve({ aiMonitorPreload: '/path/preload' })
        return Promise.resolve({ ok: true })
      }),
      send: vi.fn(),
    }
    const wv = makeWebviewMock()
    renderHook(() => useAiWebviewBridge({ current: wv }, 'https://claude.ai/chat/abc', 'webview'))
    await new Promise(r => setTimeout(r, 30))
    wv._fire('did-attach')
    expect(window.api.invoke).toHaveBeenCalledWith('ai-bridge:webui:register-webview', {
      providerId: 'anthropic',
      webContentsId: 42,
    })
  })

  it('unmount → removeEventListener + IPC unregister', async () => {
    window.api = {
      invoke: vi.fn().mockResolvedValue({ ok: true, aiMonitorPreload: '/p' }),
      send: vi.fn(),
    }
    const wv = makeWebviewMock()
    const { unmount } = renderHook(() => useAiWebviewBridge({ current: wv }, 'https://chat.deepseek.com/', 'webview'))
    await new Promise(r => setTimeout(r, 30))
    wv._fire('did-attach')
    // Чтобы registeredWebContentsId был установлен, нужно дать did-attach отработать
    await new Promise(r => setTimeout(r, 10))
    unmount()
    expect(wv.removeEventListener).toHaveBeenCalledWith('did-attach', expect.any(Function))
    expect(window.api.invoke).toHaveBeenCalledWith('ai-bridge:webui:unregister-webview', { providerId: 'deepseek' })
  })

  it('app:get-paths без aiMonitorPreload → лог warn + не падает', async () => {
    window.api = {
      invoke: vi.fn().mockResolvedValue({}),  // нет aiMonitorPreload
      send: vi.fn(),
    }
    const wv = makeWebviewMock()
    expect(() => {
      renderHook(() => useAiWebviewBridge({ current: wv }, 'https://chat.openai.com/', 'webview'))
    }).not.toThrow()
    await new Promise(r => setTimeout(r, 50))
    expect(wv.setAttribute).not.toHaveBeenCalled()
  })

  it('логи идут через app:log, не console.*', async () => {
    window.api = {
      invoke: vi.fn().mockResolvedValue({ aiMonitorPreload: '/p' }),
      send: vi.fn(),
    }
    const wv = makeWebviewMock()
    renderHook(() => useAiWebviewBridge({ current: wv }, 'https://chat.openai.com/', 'webview'))
    await new Promise(r => setTimeout(r, 50))
    const logCalls = window.api.send.mock.calls.filter(c => c[0] === 'app:log')
    expect(logCalls.length).toBeGreaterThan(0)
    // Все сообщения с префиксом [ai-webview-bridge]
    for (const c of logCalls) {
      expect(c[1].message).toMatch(/^\[ai-webview-bridge\]/)
    }
  })
})
