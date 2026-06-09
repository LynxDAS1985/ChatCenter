// v1.0.2: тесты адаптера tdlibBackend → плоский интерфейс для AI tools.

import { describe, it, expect, vi } from 'vitest'
import { createAiAgentBackendAdapter } from './aiAgentBackendAdapter.js'

describe('createAiAgentBackendAdapter — guards', () => {
  it('null backend → empty adapter с no_tdlib_backend для write', async () => {
    const a = createAiAgentBackendAdapter(null)
    expect(await a.getMessages({ chatId: 'x' })).toEqual([])
    expect(await a.searchMessages({ query: 'q' })).toEqual([])
    expect(await a.sendMessage({ chatId: 'x', text: 'y' })).toEqual({ ok: false, error: 'no_tdlib_backend' })
    expect(await a.markAsRead({ chatId: 'x', upToMessageId: 1 })).toEqual({ ok: false, error: 'no_tdlib_backend' })
  })

  it('backend без messages → no_messages_domain', async () => {
    const a = createAiAgentBackendAdapter({ chats: {} })
    expect(await a.sendMessage({ chatId: 'x', text: 'y' })).toEqual({ ok: false, error: 'no_messages_domain' })
  })

  it('backend с messages={} но без методов → graceful fallback', async () => {
    const a = createAiAgentBackendAdapter({ messages: {} })
    expect(await a.getMessages({ chatId: 'x' })).toEqual([])
    expect(await a.searchMessages({ query: 'q' })).toEqual([])
    expect(await a.sendMessage({ chatId: 'x', text: 'y' })).toEqual({ ok: false, error: 'no_send_in_backend' })
    expect(await a.markAsRead({ chatId: 'x', upToMessageId: 1 })).toEqual({ ok: false, error: 'no_markRead_in_backend' })
  })
})

describe('adapter.getMessages', () => {
  it('пробрасывает chatId, лимит зажимается [1,100], beforeMessageId → offsetId', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, messages: [{ id: 1 }, { id: 2 }] })
    const a = createAiAgentBackendAdapter({ messages: { get } })
    const r = await a.getMessages({ chatId: 'tg_main:-1001', limit: 50, beforeMessageId: '888' })
    expect(r).toEqual([{ id: 1 }, { id: 2 }])
    expect(get).toHaveBeenCalledWith({ chatId: 'tg_main:-1001', limit: 50, offsetId: '888' })
  })

  it('limit > 100 → 100', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, messages: [] })
    const a = createAiAgentBackendAdapter({ messages: { get } })
    await a.getMessages({ chatId: 'x', limit: 999 })
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }))
  })

  it('limit отсутствует → default 20', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, messages: [] })
    const a = createAiAgentBackendAdapter({ messages: { get } })
    await a.getMessages({ chatId: 'x' })
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }))
  })

  it('beforeMessageId отсутствует → offsetId=0', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, messages: [] })
    const a = createAiAgentBackendAdapter({ messages: { get } })
    await a.getMessages({ chatId: 'x' })
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ offsetId: 0 }))
  })

  it('chatId отсутствует → пустой массив (не вызывает get)', async () => {
    const get = vi.fn()
    const a = createAiAgentBackendAdapter({ messages: { get } })
    expect(await a.getMessages({})).toEqual([])
    expect(get).not.toHaveBeenCalled()
  })

  it('backend вернул ok:false → пустой массив', async () => {
    const get = vi.fn().mockResolvedValue({ ok: false, error: 'fail', messages: [] })
    const a = createAiAgentBackendAdapter({ messages: { get } })
    expect(await a.getMessages({ chatId: 'x' })).toEqual([])
  })

  it('throw в backend → пустой массив (graceful)', async () => {
    const get = vi.fn().mockRejectedValue(new Error('boom'))
    const a = createAiAgentBackendAdapter({ messages: { get } })
    expect(await a.getMessages({ chatId: 'x' })).toEqual([])
  })

  it('backend вернул messages=undefined → пустой массив', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true })
    const a = createAiAgentBackendAdapter({ messages: { get } })
    expect(await a.getMessages({ chatId: 'x' })).toEqual([])
  })
})

describe('adapter.searchMessages', () => {
  it('передаёт query/chatId/accountId/limit, limit зажимается [1,50]', async () => {
    const search = vi.fn().mockResolvedValue({ ok: true, messages: [{ id: 1, text: 'hi' }] })
    const a = createAiAgentBackendAdapter({ messages: { search } })
    const r = await a.searchMessages({ query: 'hi', chatId: 'tg_main:-1', accountId: 'tg_main', limit: 99 })
    expect(r).toEqual([{ id: 1, text: 'hi' }])
    expect(search).toHaveBeenCalledWith({ query: 'hi', chatId: 'tg_main:-1', accountId: 'tg_main', limit: 50 })
  })

  it('пустой query → не вызывает backend, пустой массив', async () => {
    const search = vi.fn()
    const a = createAiAgentBackendAdapter({ messages: { search } })
    expect(await a.searchMessages({})).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('throw → graceful', async () => {
    const search = vi.fn().mockRejectedValue(new Error('boom'))
    const a = createAiAgentBackendAdapter({ messages: { search } })
    expect(await a.searchMessages({ query: 'x' })).toEqual([])
  })
})

describe('adapter.sendMessage', () => {
  it('возвращает {ok:true, id} из tdlibBackend.messages.send (поле messageId)', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: '999' })
    const a = createAiAgentBackendAdapter({ messages: { send } })
    const r = await a.sendMessage({ chatId: 'tg_main:-1', text: 'hi', replyToMessageId: '12345' })
    expect(r).toEqual({ ok: true, id: '999' })
    expect(send).toHaveBeenCalledWith('tg_main:-1', 'hi', 12345)
  })

  it('replyToMessageId отсутствует → undefined в send (TDLib без reply)', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: '100' })
    const a = createAiAgentBackendAdapter({ messages: { send } })
    await a.sendMessage({ chatId: 'x', text: 'hi' })
    expect(send).toHaveBeenCalledWith('x', 'hi', undefined)
  })

  it('messageId как число → конвертит в строку', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, messageId: 42 })
    const a = createAiAgentBackendAdapter({ messages: { send } })
    const r = await a.sendMessage({ chatId: 'x', text: 'hi' })
    expect(r.id).toBe('42')
  })

  it('пустой text → invalid_args (без вызова backend)', async () => {
    const send = vi.fn()
    const a = createAiAgentBackendAdapter({ messages: { send } })
    expect(await a.sendMessage({ chatId: 'x', text: '' })).toEqual({ ok: false, error: 'invalid_args' })
    expect(send).not.toHaveBeenCalled()
  })

  it('backend.send {ok:false, error} → пробрасывает', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, error: 'CHAT_NOT_FOUND' })
    const a = createAiAgentBackendAdapter({ messages: { send } })
    const r = await a.sendMessage({ chatId: 'x', text: 'hi' })
    expect(r).toEqual({ ok: false, error: 'CHAT_NOT_FOUND' })
  })

  it('throw → {ok:false, error}', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'))
    const a = createAiAgentBackendAdapter({ messages: { send } })
    const r = await a.sendMessage({ chatId: 'x', text: 'hi' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })
})

describe('adapter.markAsRead', () => {
  it('вызывает markRead(chatId, Number(upToMessageId))', async () => {
    const markRead = vi.fn().mockResolvedValue({ ok: true })
    const a = createAiAgentBackendAdapter({ messages: { markRead } })
    const r = await a.markAsRead({ chatId: 'tg_main:-1', upToMessageId: '12345' })
    expect(r).toEqual({ ok: true })
    expect(markRead).toHaveBeenCalledWith('tg_main:-1', 12345)
  })

  it('пустой upToMessageId → invalid_args', async () => {
    const markRead = vi.fn()
    const a = createAiAgentBackendAdapter({ messages: { markRead } })
    expect(await a.markAsRead({ chatId: 'x' })).toEqual({ ok: false, error: 'invalid_args' })
    expect(markRead).not.toHaveBeenCalled()
  })

  it('throw → {ok:false, error}', async () => {
    const markRead = vi.fn().mockRejectedValue(new Error('boom'))
    const a = createAiAgentBackendAdapter({ messages: { markRead } })
    const r = await a.markAsRead({ chatId: 'x', upToMessageId: 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })

  it('backend вернул void → ok:true (best effort)', async () => {
    const markRead = vi.fn().mockResolvedValue(undefined)
    const a = createAiAgentBackendAdapter({ messages: { markRead } })
    expect(await a.markAsRead({ chatId: 'x', upToMessageId: 1 })).toEqual({ ok: true })
  })
})
