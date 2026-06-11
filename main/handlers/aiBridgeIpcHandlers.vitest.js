// v1.2.0 (Этап 2): тесты IPC handlers AI Bridge.

import { describe, it, expect, vi } from 'vitest'
import {
  registerAiBridgeIpcHandlers,
  handleSend,
  AI_BRIDGE_IPC_CHANNELS,
} from './aiBridgeIpcHandlers.js'

const baseQuestion = {
  version: 1,
  text: 'hi',
  source: { messengerId: 'native_cc' },
}

describe('handleSend (Этап 2)', () => {
  it('payload без mode → config_invalid', async () => {
    const r = await handleSend({ question: baseQuestion })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('config_invalid')
  })

  it('payload без question → config_invalid', async () => {
    const r = await handleSend({ mode: 'local' })
    expect(r.error.code).toBe('config_invalid')
  })

  it('mode=local создаёт localBridge через factoryLocal', async () => {
    const fakeAsk = vi.fn().mockResolvedValue({
      version: 1, ok: true, text: 'pong', providerId: 'local', mode: 'local', latencyMs: 5,
    })
    const factoryLocal = vi.fn(() => ({ ask: fakeAsk }))
    const r = await handleSend(
      { mode: 'local', question: baseQuestion, config: { baseUrl: 'x' } },
      { factoryLocal }
    )
    expect(factoryLocal).toHaveBeenCalledWith({ baseUrl: 'x' }, { fetch: undefined })
    expect(fakeAsk).toHaveBeenCalledWith(baseQuestion)
    expect(r.text).toBe('pong')
  })

  it('mode=api без providerId → config_invalid', async () => {
    const r = await handleSend({ mode: 'api', question: baseQuestion })
    expect(r.error.code).toBe('config_invalid')
    expect(r.error.message).toContain('providerId')
  })

  it('mode=api с providerId, но без callProvider в deps → config_invalid', async () => {
    const r = await handleSend(
      { mode: 'api', question: baseQuestion, config: { providerId: 'anthropic' } }
    )
    expect(r.error.code).toBe('config_invalid')
    expect(r.error.message).toContain('callProvider')
  })

  it('mode=api с callProvider → factoryApi вызвана + answer пробрасывается', async () => {
    const fakeAsk = vi.fn().mockResolvedValue({
      version: 1, ok: true, text: 'api ok', providerId: 'anthropic', mode: 'api', latencyMs: 3,
    })
    const factoryApi = vi.fn(() => ({ ask: fakeAsk }))
    const callProvider = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'x' }] })
    const r = await handleSend(
      { mode: 'api', question: baseQuestion, config: { providerId: 'anthropic', model: 'm' } },
      { factoryApi, callProvider }
    )
    expect(factoryApi).toHaveBeenCalledWith(
      { providerId: 'anthropic', model: 'm' },
      { callProvider }
    )
    expect(fakeAsk).toHaveBeenCalledWith(baseQuestion)
    expect(r.text).toBe('api ok')
  })

  it('mode=webui без providerId → config_invalid (Этап 4)', async () => {
    const r = await handleSend({ mode: 'webui', question: baseQuestion })
    expect(r.error.code).toBe('config_invalid')
    expect(r.error.message).toContain('providerId')
  })

  it('mode=webui с providerId → factoryWebUi вызвана', async () => {
    const fakeAsk = vi.fn().mockResolvedValue({
      version: 1, ok: false, text: '', providerId: 'openai', mode: 'webui', latencyMs: 1,
      error: { code: 'config_invalid', message: 'webview не открыт', retryable: false },
    })
    const factoryWebUi = vi.fn(() => ({ ask: fakeAsk }))
    const r = await handleSend(
      { mode: 'webui', question: baseQuestion, config: { providerId: 'openai' } },
      { factoryWebUi }
    )
    expect(factoryWebUi).toHaveBeenCalledWith({ providerId: 'openai' })
    expect(fakeAsk).toHaveBeenCalledWith(baseQuestion)
    expect(r.error.code).toBe('config_invalid')
  })

  it('пустой config → factory вызывается с {}', async () => {
    const fakeAsk = vi.fn().mockResolvedValue({ ok: true })
    const factoryLocal = vi.fn(() => ({ ask: fakeAsk }))
    await handleSend({ mode: 'local', question: baseQuestion }, { factoryLocal })
    expect(factoryLocal).toHaveBeenCalledWith({}, expect.any(Object))
  })
})

describe('registerAiBridgeIpcHandlers', () => {
  it('регистрирует handler на канале ai-bridge:send', () => {
    const handlers = {}
    const ipcMain = {
      handle: (channel, fn) => { handlers[channel] = fn },
      removeHandler: (channel) => { delete handlers[channel] },
    }
    registerAiBridgeIpcHandlers(ipcMain)
    expect(handlers[AI_BRIDGE_IPC_CHANNELS.SEND]).toBeTypeOf('function')
  })

  it('throws если ipcMain.handle отсутствует', () => {
    expect(() => registerAiBridgeIpcHandlers({})).toThrow('ipcMain.handle required')
  })

  it('unsubscribe вызывает removeHandler', () => {
    const handlers = {}
    const ipcMain = {
      handle: (channel, fn) => { handlers[channel] = fn },
      removeHandler: vi.fn((channel) => { delete handlers[channel] }),
    }
    const unsub = registerAiBridgeIpcHandlers(ipcMain)
    unsub()
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(AI_BRIDGE_IPC_CHANNELS.SEND)
    expect(handlers[AI_BRIDGE_IPC_CHANNELS.SEND]).toBeUndefined()
  })

  it('handler пробрасывает payload в handleSend', async () => {
    const handlers = {}
    const ipcMain = {
      handle: (channel, fn) => { handlers[channel] = fn },
      removeHandler: () => {},
    }
    const fakeAsk = vi.fn().mockResolvedValue({ version: 1, ok: true, text: 'OK', providerId: 'local', mode: 'local', latencyMs: 1 })
    const factoryLocal = () => ({ ask: fakeAsk })
    registerAiBridgeIpcHandlers(ipcMain, { factoryLocal })
    const result = await handlers['ai-bridge:send'](
      { sender: {} },
      { mode: 'local', question: baseQuestion }
    )
    expect(result.text).toBe('OK')
  })
})

describe('handleSend chain (Этап 9 fallback)', () => {
  it('payload.chain используется вместо single bridge', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    // Используем factoryApi через deps чтобы fallback использовал наш mock
    const ask = vi.fn().mockResolvedValue({
      version: 1, ok: true, text: 'OK', providerId: 'anthropic', mode: 'api', latencyMs: 1,
    })
    const factoryApi = vi.fn(() => ({ ask }))
    const out = await r.handleSend(
      {
        chain: [{ mode: 'api', config: { providerId: 'anthropic' } }],
        question: baseQuestion,
      },
      { factoryApi, callProvider: vi.fn() }
    )
    expect(out.ok).toBe(true)
    expect(out.text).toBe('OK')
  })

  it('chain без question → config_invalid', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const out = await r.handleSend({ chain: [{ mode: 'api' }] }, {})
    expect(out.ok).toBe(false)
    expect(out.error.code).toBe('config_invalid')
  })

  it('пустой chain → используется обычный mode (single bridge ветка)', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const out = await r.handleSend({ chain: [], mode: 'api', question: baseQuestion }, {})
    // Поскольку нет config.providerId → config_invalid (как раньше для api без provider)
    expect(out.error.code).toBe('config_invalid')
  })
})

describe('handleRegisterWebview / handleUnregisterWebview (Этап 7)', () => {
  it('register без providerId → error', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const out = await r.handleRegisterWebview({ webContentsId: 5 }, {})
    expect(out.ok).toBe(false)
    expect(out.error).toContain('providerId')
  })

  it('register с невалидным webContentsId → error', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const out = await r.handleRegisterWebview({ providerId: 'openai' }, {})
    expect(out.ok).toBe(false)
  })

  it('register когда webContents.fromId возвращает null → error', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const out = await r.handleRegisterWebview(
      { providerId: 'openai', webContentsId: 99 },
      { webContentsFromId: () => null, webviewUnregisterByProvider: new Map() }
    )
    expect(out.ok).toBe(false)
    expect(out.error).toContain('не найден')
  })

  it('register успешный → ok:true + сохранена unregister функция', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const fakeWc = { send: vi.fn() }
    const map = new Map()
    const out = await r.handleRegisterWebview(
      { providerId: 'openai', webContentsId: 5 },
      { webContentsFromId: () => fakeWc, webviewUnregisterByProvider: map }
    )
    expect(out.ok).toBe(true)
    expect(map.get('openai')).toBeTypeOf('function')
  })

  it('повторный register для того же providerId → старый unregister вызван', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const fakeWc1 = { send: vi.fn() }
    const fakeWc2 = { send: vi.fn() }
    const map = new Map()
    await r.handleRegisterWebview(
      { providerId: 'openai', webContentsId: 1 },
      { webContentsFromId: () => fakeWc1, webviewUnregisterByProvider: map }
    )
    const firstUnreg = map.get('openai')
    expect(firstUnreg).toBeTypeOf('function')

    await r.handleRegisterWebview(
      { providerId: 'openai', webContentsId: 2 },
      { webContentsFromId: () => fakeWc2, webviewUnregisterByProvider: map }
    )
    // Старый unreg больше не в map
    expect(map.get('openai')).not.toBe(firstUnreg)
  })

  it('unregister без providerId → error', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const out = r.handleUnregisterWebview({}, {})
    expect(out.ok).toBe(false)
  })

  it('unregister известного providerId → ok + map очищена', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const fakeWc = { send: vi.fn() }
    const map = new Map()
    await r.handleRegisterWebview(
      { providerId: 'openai', webContentsId: 5 },
      { webContentsFromId: () => fakeWc, webviewUnregisterByProvider: map }
    )
    const out = r.handleUnregisterWebview({ providerId: 'openai' }, { webviewUnregisterByProvider: map })
    expect(out.ok).toBe(true)
    expect(map.has('openai')).toBe(false)
  })

  it('unregister неизвестного providerId → ok (без throw)', async () => {
    const r = await import('./aiBridgeIpcHandlers.js')
    const out = r.handleUnregisterWebview({ providerId: 'unknown' }, { webviewUnregisterByProvider: new Map() })
    expect(out.ok).toBe(true)
  })
})

describe('AI_BRIDGE_IPC_CHANNELS', () => {
  it('SEND = ai-bridge:send', () => {
    expect(AI_BRIDGE_IPC_CHANNELS.SEND).toBe('ai-bridge:send')
  })

  it('константы frozen', () => {
    expect(Object.isFrozen(AI_BRIDGE_IPC_CHANNELS)).toBe(true)
  })
})
