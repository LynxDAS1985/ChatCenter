// v0.89.43: webContentsViewBridge unit-тесты.
//
// Bridge proxy-объект эмулирует <webview> интерфейс через wcv:* IPC.
// Тесты проверяют контракт: executeJavaScript / send / addEventListener /
// removeEventListener должны корректно работать с моком window.api.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createWebContentsViewBridge } from '../utils/webContentsViewBridge.js'

describe('webContentsViewBridge v0.89.43', () => {
  let invokeMock, onMock, eventCallback

  beforeEach(() => {
    invokeMock = vi.fn(() => Promise.resolve({ ok: true, result: 'mocked' }))
    onMock = vi.fn((channel, cb) => {
      if (channel === 'wcv:event') eventCallback = cb
      return () => { eventCallback = null }
    })
    globalThis.window.api = {
      invoke: invokeMock,
      on: onMock,
      send: vi.fn(),
    }
  })

  it('createWebContentsViewBridge без viewId → throws', () => {
    expect(() => createWebContentsViewBridge()).toThrow(/viewId required/)
    expect(() => createWebContentsViewBridge('')).toThrow(/viewId required/)
  })

  it('bridge помечен _isWebContentsViewBridge для отладки', () => {
    const b = createWebContentsViewBridge('view1')
    expect(b._isWebContentsViewBridge).toBe(true)
    expect(b._viewId).toBe('view1')
  })

  it('bridge имеет _chatcenterListeners массив (webviewSetup контракт)', () => {
    const b = createWebContentsViewBridge('view1')
    expect(Array.isArray(b._chatcenterListeners)).toBe(true)
  })

  it('executeJavaScript проксирует через wcv:execute-js IPC', async () => {
    const b = createWebContentsViewBridge('view1')
    const result = await b.executeJavaScript('1+1', true)
    expect(invokeMock).toHaveBeenCalledWith('wcv:execute-js', { id: 'view1', code: '1+1' })
    expect(result).toBe('mocked')
  })

  it('executeJavaScript при ok:false бросает ошибку', async () => {
    invokeMock.mockResolvedValueOnce({ ok: false, error: 'view not found' })
    const b = createWebContentsViewBridge('view1')
    await expect(b.executeJavaScript('x')).rejects.toThrow(/view not found/)
  })

  it('send проксирует через wcv:send IPC', () => {
    const b = createWebContentsViewBridge('view1')
    b.send('cc:command', { foo: 1 }, { bar: 2 })
    expect(invokeMock).toHaveBeenCalledWith('wcv:send',
      { id: 'view1', channel: 'cc:command', args: [{ foo: 1 }, { bar: 2 }] })
  })

  it('addEventListener подписывается на wcv:event', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('did-finish-load', handler)
    expect(onMock).toHaveBeenCalledWith('wcv:event', expect.any(Function))
  })

  it('did-finish-load event → handler вызван без аргументов (как у <webview>)', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('did-finish-load', handler)
    eventCallback({ viewId: 'view1', type: 'did-finish-load', args: [] })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('page-title-updated event → handler получает event.title', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('page-title-updated', handler)
    eventCallback({ viewId: 'view1', type: 'page-title-updated', args: [{}, 'Новый заголовок'] })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ title: 'Новый заголовок' }))
  })

  it('did-fail-load event → errorCode/errorDescription/validatedURL', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('did-fail-load', handler)
    eventCallback({ viewId: 'view1', type: 'did-fail-load',
      args: [{}, -106, 'ERR_INTERNET_DISCONNECTED', 'https://x'] })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: -106,
      errorDescription: 'ERR_INTERNET_DISCONNECTED',
      validatedURL: 'https://x',
    }))
  })

  it('did-navigate-in-page event → event.url', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('did-navigate-in-page', handler)
    eventCallback({ viewId: 'view1', type: 'did-navigate-in-page',
      args: [{}, 'https://web.telegram.org/k/#chat42'] })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://web.telegram.org/k/#chat42',
    }))
  })

  it('ipc-message event → channel + args', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('ipc-message', handler)
    eventCallback({ viewId: 'view1', type: 'ipc-message',
      channel: '__CC_MSG__', args: [{ text: 'hi' }] })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      channel: '__CC_MSG__',
      args: [{ text: 'hi' }],
    }))
  })

  it('console-message event → level/message/line/sourceId', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('console-message', handler)
    eventCallback({ viewId: 'view1', type: 'console-message',
      args: [{}, 1, 'log msg', 42, 'app.js'] })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      level: 1, message: 'log msg', line: 42, sourceId: 'app.js',
    }))
  })

  it('event для другого viewId игнорируется', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('did-finish-load', handler)
    eventCallback({ viewId: 'view2', type: 'did-finish-load', args: [] })
    expect(handler).not.toHaveBeenCalled()
  })

  it('removeEventListener — handler больше не вызывается', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('did-finish-load', handler)
    b.removeEventListener('did-finish-load', handler)
    eventCallback({ viewId: 'view1', type: 'did-finish-load', args: [] })
    expect(handler).not.toHaveBeenCalled()
  })

  it('_bridgeCleanup отписывает от wcv:event', () => {
    const b = createWebContentsViewBridge('view1')
    const handler = vi.fn()
    b.addEventListener('did-finish-load', handler)
    b._bridgeCleanup()
    expect(eventCallback).toBeNull()
  })

  it('несколько handlers на один event все вызываются', () => {
    const b = createWebContentsViewBridge('view1')
    const h1 = vi.fn(); const h2 = vi.fn()
    b.addEventListener('dom-ready', h1)
    b.addEventListener('dom-ready', h2)
    eventCallback({ viewId: 'view1', type: 'dom-ready', args: [] })
    expect(h1).toHaveBeenCalled()
    expect(h2).toHaveBeenCalled()
  })
})
