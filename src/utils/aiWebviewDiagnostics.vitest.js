// v1.1.5: тесты диагностических логов AI WebView.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { attachAiWebviewDiagnostics } from './aiWebviewDiagnostics.js'

function makeWebviewMock() {
  const listeners = {}
  return {
    addEventListener: vi.fn((ev, fn) => {
      if (!listeners[ev]) listeners[ev] = []
      listeners[ev].push(fn)
    }),
    removeEventListener: vi.fn((ev, fn) => {
      if (!listeners[ev]) return
      listeners[ev] = listeners[ev].filter(f => f !== fn)
    }),
    getURL: vi.fn(() => 'https://chat.deepseek.com'),
    _listeners: listeners,
    _emit(ev, payload) {
      ;(listeners[ev] || []).forEach(fn => fn(payload || {}))
    },
  }
}

let logSpy, warnSpy, errSpy

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  logSpy.mockRestore()
  warnSpy.mockRestore()
  errSpy.mockRestore()
})

describe('attachAiWebviewDiagnostics', () => {
  it('null webview → null', () => {
    expect(attachAiWebviewDiagnostics(null, 'deepseek', 'https://x')).toBeNull()
  })

  it('attach пишет [attach] лог', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://chat.deepseek.com')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[ai-webview] INFO [attach]'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('provider=deepseek'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('url=https://chat.deepseek.com'))
  })

  it('подписывается на все ожидаемые события', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    const expectedEvents = [
      'did-start-loading', 'did-stop-loading', 'did-finish-load',
      'did-fail-load', 'did-navigate', 'did-navigate-in-page',
      'dom-ready', 'console-message', 'render-process-gone',
      'unresponsive', 'did-attach',
    ]
    for (const ev of expectedEvents) {
      expect(wv.addEventListener).toHaveBeenCalledWith(ev, expect.any(Function))
    }
  })

  it('did-fail-load → ERROR лог с code/desc/url', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://chat.deepseek.com')
    wv._emit('did-fail-load', {
      errorCode: -3,
      errorDescription: 'ERR_ABORTED',
      validatedURL: 'https://chat.deepseek.com/login',
      isMainFrame: true,
    })
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[did-fail-load]'))
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('code=-3'))
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('ERR_ABORTED'))
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('failedUrl=https://chat.deepseek.com/login'))
  })

  it('console-message с level=2 → ERROR лог (видим CSP/JS errors сайта)', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'gigachat', 'https://giga.chat')
    wv._emit('console-message', {
      level: 2,
      message: 'Refused to display in frame because of X-Frame-Options',
      sourceId: 'https://giga.chat/main.js',
      line: 42,
    })
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[site-console]'))
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Refused to display in frame'))
  })

  it('console-message level=1 → WARN, level=0 → INFO', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    wv._emit('console-message', { level: 1, message: 'deprecated API', sourceId: '?', line: 0 })
    wv._emit('console-message', { level: 0, message: 'info from site', sourceId: '?', line: 0 })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated API'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('info from site'))
  })

  it('did-navigate → лог с новым URL', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://chat.deepseek.com')
    wv._emit('did-navigate', { url: 'https://chat.deepseek.com/login' })
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[did-navigate] provider=deepseek url=https://chat.deepseek.com → https://chat.deepseek.com/login'))
  })

  it('render-process-gone → ERROR с reason+exitCode', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    wv._emit('render-process-gone', { reason: 'crashed', exitCode: -1 })
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('reason=crashed'))
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('exitCode=-1'))
  })

  it('detach снимает все listeners + помечает webview', () => {
    const wv = makeWebviewMock()
    const r = attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    expect(wv.__ccDiagAttached).toBe(true)
    r.detach()
    expect(wv.__ccDiagAttached).toBeUndefined()
    expect(wv.removeEventListener).toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[detach]'))
  })

  it('повторный attach на тот же элемент → не дублирует listeners', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    const firstCallCount = wv.addEventListener.mock.calls.length
    const r2 = attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    expect(wv.addEventListener.mock.calls.length).toBe(firstCallCount)  // не вырос
    expect(r2.detach).toBeDefined()
  })

  it('console-message без sourceId → лог без указания файла', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'gigachat', 'https://giga.chat')
    wv._emit('console-message', { level: 2, message: 'CSP violation' })
    const calls = errSpy.mock.calls.map(c => c[0])
    expect(calls.some(c => c.includes('CSP violation'))).toBe(true)
  })

  it('long message обрезается до 500 символов', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    const longMsg = 'A'.repeat(1000)
    wv._emit('console-message', { level: 2, message: longMsg, sourceId: '?' })
    const lastCall = errSpy.mock.calls[errSpy.mock.calls.length - 1][0]
    // 500 'A' + остальное от шаблона лога
    expect(lastCall).toContain('A'.repeat(500))
    expect(lastCall).not.toContain('A'.repeat(501))
  })
})
