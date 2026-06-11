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

  it('mode=api на Этапе 2 → unsupported_mode (api bridge ещё не подключён)', async () => {
    const r = await handleSend({ mode: 'api', question: baseQuestion })
    expect(r.error.code).toBe('unsupported_mode')
  })

  it('mode=webui на Этапе 2 → unsupported_mode', async () => {
    const r = await handleSend({ mode: 'webui', question: baseQuestion })
    expect(r.error.code).toBe('unsupported_mode')
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

describe('AI_BRIDGE_IPC_CHANNELS', () => {
  it('SEND = ai-bridge:send', () => {
    expect(AI_BRIDGE_IPC_CHANNELS.SEND).toBe('ai-bridge:send')
  })

  it('константы frozen', () => {
    expect(Object.isFrozen(AI_BRIDGE_IPC_CHANNELS)).toBe(true)
  })
})
