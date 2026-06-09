// v0.99.1 (Phase 3.5): тесты aiAgentSetup.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initToolRegistry,
  setAgentDeps,
  getHandlerContext,
  _internal,
} from './aiAgentSetup.js'

describe('initToolRegistry', () => {
  it('возвращает registry с 8 tools (5 Phase 1-2 + 3 Phase 4)', () => {
    const reg = initToolRegistry()
    const tools = reg.list()
    expect(tools.length).toBe(8)
    const ids = tools.map(t => t.id)
    // Phase 1 + 2
    expect(ids).toContain('goto_message')
    expect(ids).toContain('get_chat_history')
    expect(ids).toContain('search_messages')
    expect(ids).toContain('reply_to_message')
    expect(ids).toContain('mark_as_read')
    // Phase 4
    expect(ids).toContain('create_task')
    expect(ids).toContain('list_tasks')
    expect(ids).toContain('schedule_reminder')
  })

  it('идемпотентен — повторный вызов возвращает тот же registry', () => {
    const r1 = initToolRegistry()
    const r2 = initToolRegistry()
    expect(r1).toBe(r2)
  })
})

describe('getHandlerContext + setAgentDeps', () => {
  beforeEach(() => {
    setAgentDeps(null)
  })

  it('без deps → dispatchUI возвращает no_mainWindow error', async () => {
    setAgentDeps(null)
    const ctx = getHandlerContext()
    const r = await ctx.dispatchUI({ type: 'goto_message' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_mainWindow')
  })

  it('dispatchUI с mainWindow → webContents.send вызван', async () => {
    const sendMock = vi.fn()
    setAgentDeps({
      mainWindow: () => ({ isDestroyed: () => false, webContents: { send: sendMock } }),
    })
    const ctx = getHandlerContext()
    const r = await ctx.dispatchUI({ type: 'goto_message', accountId: 'a', chatId: 'c' })
    expect(r.ok).toBe(true)
    expect(sendMock).toHaveBeenCalledWith('ai:agent:ui-dispatch', expect.objectContaining({
      type: 'goto_message',
    }))
  })

  it('getMessages без tdlibBackend → пустой массив', async () => {
    setAgentDeps({ mainWindow: () => null, tdlibBackend: null })
    const ctx = getHandlerContext()
    const r = await ctx.getMessages({ chatId: 'X', limit: 10 })
    expect(Array.isArray(r)).toBe(true)
    expect(r).toEqual([])
  })

  it('getMessages с tdlibBackend → результат backend', async () => {
    const fakeMessages = [{ id: '1', text: 'hi' }]
    setAgentDeps({
      mainWindow: () => null,
      tdlibBackend: { getMessages: vi.fn(async () => fakeMessages) },
    })
    const ctx = getHandlerContext()
    const r = await ctx.getMessages({ chatId: 'X', limit: 10 })
    expect(r).toEqual(fakeMessages)
  })

  it('sendMessage без tdlibBackend → ok:false', async () => {
    setAgentDeps({ mainWindow: () => null, tdlibBackend: null })
    const ctx = getHandlerContext()
    const r = await ctx.sendMessage({ accountId: 'a', chatId: 'c', text: 'hi' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_tdlib_backend')
  })

  it('sendMessage с backend → результат backend', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, id: 'msg_123' }))
    setAgentDeps({
      mainWindow: () => null,
      tdlibBackend: { sendMessage },
    })
    const ctx = getHandlerContext()
    const r = await ctx.sendMessage({ accountId: 'a', chatId: 'c', text: 'hi' })
    expect(r.ok).toBe(true)
    expect(r.id).toBe('msg_123')
  })

  it('markAsRead без backend → ok:false', async () => {
    setAgentDeps({ mainWindow: () => null, tdlibBackend: null })
    const ctx = getHandlerContext()
    const r = await ctx.markAsRead({ accountId: 'a', chatId: 'c', upToMessageId: 'm' })
    expect(r.ok).toBe(false)
  })

  it('searchMessages без backend → пустой массив', async () => {
    setAgentDeps({ mainWindow: () => null, tdlibBackend: null })
    const ctx = getHandlerContext()
    const r = await ctx.searchMessages({ query: 'test' })
    expect(r).toEqual([])
  })
})
