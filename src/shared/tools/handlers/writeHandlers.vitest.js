// v0.98.0 (Phase 2 M2.2): тесты для write handlers (reply / markAsRead).

import { describe, it, expect, vi } from 'vitest'
import { replyToMessageHandler } from './replyToMessage.js'
import { markAsReadHandler } from './markAsRead.js'
import { createNotificationSource } from '../../notificationSource.js'

const SOURCE = createNotificationSource({
  messengerId: 'native_cc',
  accountId: 'tg_1',
  chatId: '-100',
  messageId: '12345',
})

describe('replyToMessageHandler', () => {
  it('valid args + sendMessage success → ok с sentMessageId', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, id: 'msg_new_123' }))
    const r = await replyToMessageHandler(SOURCE, { text: 'Здравствуйте' }, { sendMessage })
    expect(r.ok).toBe(true)
    expect(r.result.sent).toBe(true)
    expect(r.result.sentMessageId).toBe('msg_new_123')
    expect(r.result.replyToMessageId).toBe('12345')
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'tg_1',
      chatId: '-100',
      text: 'Здравствуйте',
      replyToMessageId: '12345',
      parseMode: 'plain',
    }))
  })

  it('без source → ok:false', async () => {
    const r = await replyToMessageHandler(null, { text: 'x' }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_source')
  })

  it('пустой text → ok:false', async () => {
    const r = await replyToMessageHandler(SOURCE, { text: '' }, { sendMessage: vi.fn() })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_text')
  })

  it('text > 4000 chars → ok:false', async () => {
    const longText = 'А'.repeat(5000)
    const r = await replyToMessageHandler(SOURCE, { text: longText }, { sendMessage: vi.fn() })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/text_too_long/)
  })

  it('без context.sendMessage → ok:false', async () => {
    const r = await replyToMessageHandler(SOURCE, { text: 'hi' }, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_sendMessage_in_context')
  })

  it('sendMessage throws → ok:false', async () => {
    const sendMessage = vi.fn(async () => { throw new Error('network') })
    const r = await replyToMessageHandler(SOURCE, { text: 'hi' }, { sendMessage })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('network')
  })

  it('sendMessage возвращает {ok:false} → propagate error', async () => {
    const sendMessage = vi.fn(async () => ({ ok: false, error: 'rate_limited' }))
    const r = await replyToMessageHandler(SOURCE, { text: 'hi' }, { sendMessage })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('rate_limited')
  })
})

describe('markAsReadHandler', () => {
  it('valid → markAsRead called с upToMessageId=source.messageId', async () => {
    const markAsRead = vi.fn(async () => ({ ok: true }))
    const r = await markAsReadHandler(SOURCE, {}, { markAsRead })
    expect(r.ok).toBe(true)
    expect(r.result.upToMessageId).toBe('12345')
    expect(markAsRead).toHaveBeenCalledWith({
      accountId: 'tg_1',
      chatId: '-100',
      upToMessageId: '12345',
    })
  })

  it('args.upToMessageId переопределяет source.messageId', async () => {
    const markAsRead = vi.fn(async () => ({ ok: true }))
    await markAsReadHandler(SOURCE, { upToMessageId: 'custom_id' }, { markAsRead })
    expect(markAsRead).toHaveBeenCalledWith(expect.objectContaining({
      upToMessageId: 'custom_id',
    }))
  })

  it('без upToMessageId и без source.messageId → ok:false', async () => {
    const partialSource = { accountId: 'a', chatId: 'c' }
    const r = await markAsReadHandler(partialSource, {}, { markAsRead: vi.fn() })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_upToMessageId')
  })

  it('markAsRead throws → graceful', async () => {
    const markAsRead = vi.fn(async () => { throw new Error('offline') })
    const r = await markAsReadHandler(SOURCE, {}, { markAsRead })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('offline')
  })
})
