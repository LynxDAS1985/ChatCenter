// v0.89.0 — Stage 4 / Этап 2.4: тесты TDLib messages API.

import { describe, it, expect, vi } from 'vitest'
import {
  getChatHistory, sendTextMessage, editMessageText, deleteMessages,
  viewMessages, getMessage, getChatPinnedMessage,
} from '../../main/native/backends/tdlibMessages.js'

function makeClient(invokeImpl) {
  return { invoke: vi.fn(invokeImpl || (() => Promise.resolve({ '@type': 'ok' }))) }
}

function makeTdMessage(id, text = 'hello') {
  return {
    '@type': 'message',
    id, chat_id: -1001,
    sender_id: { '@type': 'messageSenderUser', user_id: 42 },
    is_outgoing: false,
    date: 1715000000,
    media_album_id: '0',
    content: { '@type': 'messageText', text: { text, entities: [] } },
  }
}

// ──────────────────────────────────────────────────────────────────────
// getChatHistory
// ──────────────────────────────────────────────────────────────────────

describe('getChatHistory', () => {
  it('конвертирует TDLib messages в NativeMessage и reverse', async () => {
    const client = makeClient(() => Promise.resolve({
      messages: [makeTdMessage(3, 'newest'), makeTdMessage(2, 'middle'), makeTdMessage(1, 'oldest')],
    }))
    const r = await getChatHistory(client, -1001, { limit: 3, chatIdStr: 'tg_1:-1001' })
    expect(r.ok).toBe(true)
    expect(r.messages).toHaveLength(3)
    // После .reverse — порядок от старых к новым
    expect(r.messages[0].text).toBe('oldest')
    expect(r.messages[2].text).toBe('newest')
    expect(r.messages[0].chatId).toBe('tg_1:-1001')
  })

  it('параметры передаются в getChatHistory invoke', async () => {
    const client = makeClient(() => Promise.resolve({ messages: [] }))
    await getChatHistory(client, -1001, {
      limit: 50, fromMessageId: 100, offset: -25, chatIdStr: 'tg_1:-1001',
    })
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getChatHistory',
      chat_id: -1001,
      from_message_id: 100,
      offset: -25,
      limit: 50,
      only_local: false,
    }))
  })

  it('hasMore=true если вернулось ровно limit', async () => {
    const msgs = Array.from({ length: 50 }, (_, i) => makeTdMessage(i + 1))
    const client = makeClient(() => Promise.resolve({ messages: msgs }))
    const r = await getChatHistory(client, -1001, { limit: 50 })
    expect(r.hasMore).toBe(true)
  })

  it('hasMore=false если вернулось меньше', async () => {
    const msgs = Array.from({ length: 10 }, (_, i) => makeTdMessage(i + 1))
    const client = makeClient(() => Promise.resolve({ messages: msgs }))
    const r = await getChatHistory(client, -1001, { limit: 50 })
    expect(r.hasMore).toBe(false)
  })

  it('extras.getSenderName / getSenderAvatar заполняют поля mapMessage', async () => {
    const msg = makeTdMessage(1, 'hi')
    const client = makeClient(() => Promise.resolve({ messages: [msg] }))
    const getSenderName = vi.fn(() => 'Иван')
    const getSenderAvatar = vi.fn(() => 'cc-media://avatars/42.jpg')
    const r = await getChatHistory(client, -1001, {
      chatIdStr: 'tg_1:-1001',
      extras: { getSenderName, getSenderAvatar },
    })
    expect(getSenderName).toHaveBeenCalledWith(msg.sender_id)
    expect(getSenderAvatar).toHaveBeenCalledWith(msg.sender_id)
    expect(r.messages[0].senderName).toBe('Иван')
    expect(r.messages[0].senderAvatar).toBe('cc-media://avatars/42.jpg')
  })

  it('client без invoke → ошибка', async () => {
    const r = await getChatHistory(null, -1001, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('client not ready')
  })

  it('invoke падает → wrapError возвращает { ok: false, error }', async () => {
    const client = makeClient(() => Promise.reject({ '@type': 'error', code: 400, message: 'CHAT_INVALID' }))
    const r = await getChatHistory(client, -1001, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('CHAT_INVALID')
  })
})

// ──────────────────────────────────────────────────────────────────────
// sendTextMessage
// ──────────────────────────────────────────────────────────────────────

describe('sendTextMessage', () => {
  it('отправляет sendMessage с inputMessageText', async () => {
    const sent = makeTdMessage(999, 'Привет')
    const client = makeClient(() => Promise.resolve(sent))
    const r = await sendTextMessage(client, -1001, 'Привет', { chatIdStr: 'tg_1:-1001' })
    expect(r.ok).toBe(true)
    expect(r.messageId).toBe('999')
    expect(r.message.text).toBe('Привет')
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'sendMessage',
      chat_id: -1001,
      input_message_content: expect.objectContaining({
        '@type': 'inputMessageText',
        text: expect.objectContaining({ text: 'Привет' }),
      }),
    }))
  })

  it('replyTo генерирует inputMessageReplyToMessage', async () => {
    const client = makeClient(() => Promise.resolve(makeTdMessage(1)))
    await sendTextMessage(client, -1001, 'reply', { replyTo: 555 })
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({
      reply_to: { '@type': 'inputMessageReplyToMessage', message_id: 555 },
    }))
  })

  it('пустой text → ok: false', async () => {
    const client = makeClient(() => Promise.resolve({}))
    const r = await sendTextMessage(client, -1001, '   ', {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('empty text')
    expect(client.invoke).not.toHaveBeenCalled()
  })

  it('invoke падает → ok: false с error', async () => {
    const client = makeClient(() => Promise.reject(new Error('FORBIDDEN')))
    const r = await sendTextMessage(client, -1001, 'hi')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('FORBIDDEN')
  })
})

// ──────────────────────────────────────────────────────────────────────
// editMessageText
// ──────────────────────────────────────────────────────────────────────

describe('editMessageText', () => {
  it('вызывает editMessageText с правильными полями', async () => {
    const client = makeClient(() => Promise.resolve({}))
    const r = await editMessageText(client, -1001, 100, 'new text')
    expect(r.ok).toBe(true)
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'editMessageText',
      chat_id: -1001,
      message_id: 100,
      input_message_content: expect.objectContaining({
        '@type': 'inputMessageText',
        text: expect.objectContaining({ text: 'new text' }),
      }),
    }))
  })

  it('invoke падает → ok: false', async () => {
    const client = makeClient(() => Promise.reject(new Error('MESSAGE_NOT_MODIFIED')))
    const r = await editMessageText(client, -1001, 100, 'x')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('MESSAGE_NOT_MODIFIED')
  })
})

// ──────────────────────────────────────────────────────────────────────
// deleteMessages
// ──────────────────────────────────────────────────────────────────────

describe('deleteMessages', () => {
  it('одиночный id → ok', async () => {
    const client = makeClient(() => Promise.resolve({}))
    const r = await deleteMessages(client, -1001, 100)
    expect(r.ok).toBe(true)
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'deleteMessages',
      chat_id: -1001,
      message_ids: [100],
      revoke: true,
    }))
  })

  it('массив id', async () => {
    const client = makeClient(() => Promise.resolve({}))
    await deleteMessages(client, -1001, [10, 20, 30], false)
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({
      message_ids: [10, 20, 30],
      revoke: false,
    }))
  })

  it('пустой список → ok: false', async () => {
    const client = makeClient(() => Promise.resolve({}))
    const r = await deleteMessages(client, -1001, [])
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no messageIds')
  })
})

// ──────────────────────────────────────────────────────────────────────
// viewMessages
// ──────────────────────────────────────────────────────────────────────

describe('viewMessages', () => {
  it('вызывает viewMessages с force_read=true по умолчанию', async () => {
    const client = makeClient(() => Promise.resolve({}))
    const r = await viewMessages(client, -1001, [100, 101, 102])
    expect(r.ok).toBe(true)
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'viewMessages',
      chat_id: -1001,
      message_ids: [100, 101, 102],
      force_read: true,
    }))
  })

  it('forceRead=false передаётся', async () => {
    const client = makeClient(() => Promise.resolve({}))
    await viewMessages(client, -1001, [1], { forceRead: false })
    expect(client.invoke).toHaveBeenCalledWith(expect.objectContaining({
      force_read: false,
    }))
  })

  it('пустой список → ok: false', async () => {
    const client = makeClient(() => Promise.resolve({}))
    const r = await viewMessages(client, -1001, [])
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no messageIds')
  })
})

// ──────────────────────────────────────────────────────────────────────
// getMessage / getChatPinnedMessage
// ──────────────────────────────────────────────────────────────────────

describe('getMessage', () => {
  it('возвращает замапленное сообщение', async () => {
    const td = makeTdMessage(100, 'pinned text')
    const client = makeClient(() => Promise.resolve(td))
    const r = await getMessage(client, -1001, 100, { chatIdStr: 'tg_1:-1001' })
    expect(r.ok).toBe(true)
    expect(r.message.id).toBe('100')
    expect(r.message.text).toBe('pinned text')
  })

  it('invoke падает → ok: false', async () => {
    const client = makeClient(() => Promise.reject(new Error('MSG_ID_INVALID')))
    const r = await getMessage(client, -1001, 999)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('MSG_ID_INVALID')
  })
})

describe('getChatPinnedMessage', () => {
  it('возвращает замапленное pinned', async () => {
    const td = makeTdMessage(50, 'pinned')
    const client = makeClient(() => Promise.resolve(td))
    const r = await getChatPinnedMessage(client, -1001, { chatIdStr: 'tg_1:-1001' })
    expect(r.ok).toBe(true)
    expect(r.message.text).toBe('pinned')
  })

  it('"Pinned message not found" → ok: true, message: null', async () => {
    const client = makeClient(() => Promise.reject({ '@type': 'error', code: 404, message: 'Pinned message not found' }))
    const r = await getChatPinnedMessage(client, -1001)
    expect(r.ok).toBe(true)
    expect(r.message).toBe(null)
  })

  it('другая ошибка → ok: false', async () => {
    const client = makeClient(() => Promise.reject({ '@type': 'error', code: 400, message: 'CHAT_INVALID' }))
    const r = await getChatPinnedMessage(client, -1001)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('CHAT_INVALID')
  })
})
