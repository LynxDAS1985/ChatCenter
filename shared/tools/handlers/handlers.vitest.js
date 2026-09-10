// v0.97.0 (Phase 1 M1.3): тесты handlers (goto / get_history / search).

import { describe, it, expect, vi } from 'vitest'
import { gotoMessageHandler } from './gotoMessage.js'
import { getChatHistoryHandler } from './getChatHistory.js'
import { searchMessagesHandler } from './searchMessages.js'
import { createNotificationSource } from '../../notificationSource.js'

const SOURCE = createNotificationSource({
  messengerId: 'native_cc',
  accountId: 'tg_1',
  chatId: '-100',
  messageId: '12345',
})

describe('gotoMessageHandler', () => {
  it('valid source + dispatchUI → navigated:true', async () => {
    const dispatchUI = vi.fn(async () => {})
    const r = await gotoMessageHandler(SOURCE, null, { dispatchUI })
    expect(r.ok).toBe(true)
    expect(r.result.navigated).toBe(true)
    expect(dispatchUI).toHaveBeenCalledWith(expect.objectContaining({
      type: 'goto_message',
      accountId: 'tg_1',
      chatId: '-100',
      messageId: '12345',
    }))
  })

  it('без source → ok:false invalid_source', async () => {
    const r = await gotoMessageHandler(null, null, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_source')
  })

  it('без messageId → ok:false missing_messageId', async () => {
    const partial = { accountId: 'tg_1', chatId: '-100' }
    const r = await gotoMessageHandler(partial, null, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_messageId')
  })

  it('dispatchUI throws → ok:false', async () => {
    const dispatchUI = vi.fn(async () => { throw new Error('boom') })
    const r = await gotoMessageHandler(SOURCE, null, { dispatchUI })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })
})

describe('getChatHistoryHandler', () => {
  const fakeMessages = [
    { id: '1', senderName: 'A', text: 'Hello', timestamp: 100, isOutgoing: false },
    { id: '2', senderName: 'B', text: 'World', timestamp: 200, isOutgoing: true },
  ]

  it('valid args → возвращает messages', async () => {
    const getMessages = vi.fn(async () => fakeMessages)
    const r = await getChatHistoryHandler(SOURCE, { chatId: '-100', limit: 10 }, { getMessages })
    expect(r.ok).toBe(true)
    expect(r.result.count).toBe(2)
    expect(r.result.messages[0].id).toBe('1')
    expect(getMessages).toHaveBeenCalledWith({ chatId: '-100', limit: 10, beforeMessageId: null })
  })

  it('без chatId → ok:false', async () => {
    const r = await getChatHistoryHandler(SOURCE, {}, { getMessages: vi.fn() })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_chatId')
  })

  it('без context.getMessages → ok:false', async () => {
    const r = await getChatHistoryHandler(SOURCE, { chatId: '-100' }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_getMessages_in_context')
  })

  it('limit clamp к [1,100]', async () => {
    const getMessages = vi.fn(async () => [])
    await getChatHistoryHandler(SOURCE, { chatId: 'X', limit: 999 }, { getMessages })
    expect(getMessages).toHaveBeenCalledWith({ chatId: 'X', limit: 100, beforeMessageId: null })
    await getChatHistoryHandler(SOURCE, { chatId: 'X', limit: -10 }, { getMessages })
    expect(getMessages).toHaveBeenCalledWith({ chatId: 'X', limit: 1, beforeMessageId: null })
  })

  it('text обрезается до 500 символов', async () => {
    const longText = 'А'.repeat(1000)
    const getMessages = vi.fn(async () => [{ id: '1', text: longText, timestamp: 0 }])
    const r = await getChatHistoryHandler(SOURCE, { chatId: 'X' }, { getMessages })
    expect(r.result.messages[0].text.length).toBe(500)
  })
})

describe('searchMessagesHandler', () => {
  it('valid query → matches', async () => {
    const searchMessages = vi.fn(async () => [
      { id: '1', chatId: '-100', text: 'Hello world', timestamp: 100 },
    ])
    const r = await searchMessagesHandler(SOURCE, { query: 'world' }, { searchMessages })
    expect(r.ok).toBe(true)
    expect(r.result.count).toBe(1)
    expect(r.result.query).toBe('world')
  })

  it('query < 2 chars → ok:false', async () => {
    const r = await searchMessagesHandler(SOURCE, { query: 'a' }, { searchMessages: vi.fn() })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_query')
  })

  it('limit clamp к [1,50]', async () => {
    const searchMessages = vi.fn(async () => [])
    await searchMessagesHandler(SOURCE, { query: 'test', limit: 100 }, { searchMessages })
    expect(searchMessages).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }))
  })

  it('без context → ok:false', async () => {
    const r = await searchMessagesHandler(SOURCE, { query: 'test' }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_searchMessages_in_context')
  })
})
