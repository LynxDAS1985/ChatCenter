// v1.1.5: тесты диагностических логов AI WebView.
// v1.1.6: ИСПРАВЛЕНО — логи через window.api.send('app:log'), не console.*.

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

let sendMock

beforeEach(() => {
  sendMock = vi.fn()
  globalThis.window = { api: { send: sendMock } }
})
afterEach(() => {
  delete globalThis.window
})

// Helper: ищет лог по level + содержимому в message
function findLog(level, contains) {
  const calls = sendMock.mock.calls
  return calls.find(c => {
    const [channel, data] = c
    if (channel !== 'app:log') return false
    if (data?.level !== level) return false
    if (typeof contains === 'string') return (data.message || '').includes(contains)
    if (contains instanceof RegExp) return contains.test(data.message || '')
    return true
  })
}

describe('attachAiWebviewDiagnostics — v1.1.6 (штатный логгер app:log)', () => {
  it('null webview → null', () => {
    expect(attachAiWebviewDiagnostics(null, 'deepseek', 'https://x')).toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('attach пишет [attach] INFO в app:log', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://chat.deepseek.com')
    const log = findLog('INFO', '[attach]')
    expect(log).toBeDefined()
    expect(log[1].message).toContain('provider=deepseek')
    expect(log[1].message).toContain('url=https://chat.deepseek.com')
  })

  it('все логи идут через канал app:log (НЕ console.*)', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    expect(sendMock).toHaveBeenCalled()
    for (const call of sendMock.mock.calls) {
      expect(call[0]).toBe('app:log')
      expect(call[1]).toHaveProperty('level')
      expect(call[1]).toHaveProperty('message')
    }
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

  it('did-fail-load → ERROR с code/desc/url', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://chat.deepseek.com')
    wv._emit('did-fail-load', {
      errorCode: -3,
      errorDescription: 'ERR_ABORTED',
      validatedURL: 'https://chat.deepseek.com/login',
      isMainFrame: true,
    })
    const log = findLog('ERROR', '[did-fail-load]')
    expect(log).toBeDefined()
    expect(log[1].message).toContain('code=-3')
    expect(log[1].message).toContain('ERR_ABORTED')
    expect(log[1].message).toContain('failedUrl=https://chat.deepseek.com/login')
  })

  it('console-message level=2 → ERROR (CSP errors)', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'gigachat', 'https://giga.chat')
    wv._emit('console-message', {
      level: 2,
      message: 'Refused to display in frame because of X-Frame-Options',
      sourceId: 'https://giga.chat/main.js',
      line: 42,
    })
    const log = findLog('ERROR', 'Refused to display')
    expect(log).toBeDefined()
    expect(log[1].message).toContain('[site-console]')
  })

  it('console-message level=1 → WARN, level=0 → INFO', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    wv._emit('console-message', { level: 1, message: 'deprecated API', sourceId: '?', line: 0 })
    wv._emit('console-message', { level: 0, message: 'info from site', sourceId: '?', line: 0 })
    expect(findLog('WARN', 'deprecated API')).toBeDefined()
    expect(findLog('INFO', 'info from site')).toBeDefined()
  })

  it('did-navigate → INFO с новым URL', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://chat.deepseek.com')
    wv._emit('did-navigate', { url: 'https://chat.deepseek.com/login' })
    const log = findLog('INFO', '[did-navigate]')
    expect(log).toBeDefined()
    expect(log[1].message).toContain('→ https://chat.deepseek.com/login')
  })

  it('render-process-gone → ERROR с reason+exitCode', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    wv._emit('render-process-gone', { reason: 'crashed', exitCode: -1 })
    const log = findLog('ERROR', 'reason=crashed')
    expect(log).toBeDefined()
    expect(log[1].message).toContain('exitCode=-1')
  })

  it('detach снимает все listeners + помечает webview', () => {
    const wv = makeWebviewMock()
    const r = attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    expect(wv.__ccDiagAttached).toBe(true)
    r.detach()
    expect(wv.__ccDiagAttached).toBeUndefined()
    expect(wv.removeEventListener).toHaveBeenCalled()
    expect(findLog('INFO', '[detach]')).toBeDefined()
  })

  it('повторный attach на тот же элемент → не дублирует listeners', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    const firstCallCount = wv.addEventListener.mock.calls.length
    const r2 = attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    expect(wv.addEventListener.mock.calls.length).toBe(firstCallCount)
    expect(r2.detach).toBeDefined()
  })

  it('long message обрезается до 500 символов', () => {
    const wv = makeWebviewMock()
    attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
    const longMsg = 'A'.repeat(1000)
    wv._emit('console-message', { level: 2, message: longMsg, sourceId: '?' })
    const log = findLog('ERROR', 'A')
    expect(log).toBeDefined()
    // msg в логе содержит 500 'A', но НЕ 501
    expect(log[1].message).toContain('A'.repeat(500))
    expect(log[1].message).not.toContain('A'.repeat(501))
  })

  it('window.api отсутствует → silent (не падает)', () => {
    const wv = makeWebviewMock()
    delete globalThis.window.api
    expect(() => attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')).not.toThrow()
    // События тоже не должны падать
    expect(() => wv._emit('did-fail-load', { errorCode: -3 })).not.toThrow()
  })

  it('window полностью отсутствует → silent', () => {
    const wv = makeWebviewMock()
    delete globalThis.window
    expect(() => attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')).not.toThrow()
  })

  it('НИ ОДНОГО console.log/warn/error не вызвано (всё через app:log)', () => {
    const wv = makeWebviewMock()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      attachAiWebviewDiagnostics(wv, 'deepseek', 'https://x')
      wv._emit('did-fail-load', { errorCode: -3, errorDescription: 'err', validatedURL: 'https://x' })
      wv._emit('console-message', { level: 2, message: 'css', sourceId: '?' })
      wv._emit('render-process-gone', { reason: 'crashed' })
      expect(logSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errSpy).not.toHaveBeenCalled()
    } finally {
      logSpy.mockRestore()
      warnSpy.mockRestore()
      errSpy.mockRestore()
    }
  })
})
