// v0.89.0 — Stage 4 / Этап 3.2: тесты tdlibIpcHandlers.
//
// Mock ipcMain + mock backend (через TDLib stack — реальный backend на mock-clients).
// Проверяем что IPC каналы правильно роутят запросы и manager events
// корректно мостятся в renderer через sendToRenderer.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'
import { buildTdlibParameters } from '../../main/native/backends/tdlibAuth.js'
import { initTdlibIpcHandlers } from '../../main/native/tdlibIpcHandlers.js'

// ──────────────────────────────────────────────────────────────────────
// MOCK ipcMain
// ──────────────────────────────────────────────────────────────────────

function makeMockIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, fn) { handlers.set(channel, fn) },
    removeHandler(channel) { handlers.delete(channel) },
    invoke(channel, payload) {
      const fn = handlers.get(channel)
      if (!fn) throw new Error(`no handler: ${channel}`)
      return fn({}, payload)
    },
  }
}

function makeMockClient() {
  const client = new EventEmitter()
  client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  client.close = vi.fn(() => Promise.resolve())
  return client
}

function setup() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_main', {})
  const backend = createTdlibBackend({
    manager: mgr,
    tdlibParameters: buildTdlibParameters({ apiId: 1, apiHash: 'h', databaseDirectory: '/tmp' }),
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
  })
  const ipcMain = makeMockIpcMain()
  const sendToRenderer = vi.fn()
  const log = vi.fn()
  const unregister = initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer, log })
  return { mgr, mockClient, backend, ipcMain, sendToRenderer, log, unregister }
}

// ──────────────────────────────────────────────────────────────────────
// VALIDATION
// ──────────────────────────────────────────────────────────────────────

describe('initTdlibIpcHandlers — validation', () => {
  it('падает без ipcMain.handle', () => {
    expect(() => initTdlibIpcHandlers({ backend: {}, sendToRenderer: () => {} }))
      .toThrow(/ipcMain\.handle required/)
  })

  it('падает без backend', () => {
    expect(() => initTdlibIpcHandlers({ ipcMain: makeMockIpcMain(), sendToRenderer: () => {} }))
      .toThrow(/backend required/)
  })

  it('падает без sendToRenderer', () => {
    expect(() => initTdlibIpcHandlers({ ipcMain: makeMockIpcMain(), backend: {} }))
      .toThrow(/sendToRenderer required/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// REGISTRATION
// ──────────────────────────────────────────────────────────────────────

describe('IPC channel registration', () => {
  it('регистрирует все ожидаемые каналы', () => {
    const { ipcMain } = setup()
    const expected = [
      'tg:login-start', 'tg:login-code', 'tg:login-password', 'tg:login-cancel',
      'tg:get-accounts', 'tg:remove-account',
      'tg:get-chats', 'tg:get-cached-chats', 'tg:rescan-unread', 'tg:health-check',
      'tg:get-messages', 'tg:get-topic-messages',
      'tg:send-message', 'tg:edit-message', 'tg:delete-message', 'tg:forward',
      'tg:mark-read', 'tg:mark-topic-read', 'tg:get-pinned-message',
      'tg:download-media', 'tg:download-video', 'tg:get-forum-topics',
    ]
    for (const ch of expected) {
      expect(ipcMain.handlers.has(ch)).toBe(true)
    }
  })

  it('unregister снимает все handlers', () => {
    const { ipcMain, unregister } = setup()
    expect(ipcMain.handlers.size).toBeGreaterThan(0)
    unregister()
    expect(ipcMain.handlers.size).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────
// MESSAGES routing
// ──────────────────────────────────────────────────────────────────────

describe('messages IPC handlers', () => {
  it('tg:get-messages вызывает backend.messages.get', async () => {
    const { ipcMain, mockClient } = setup()
    mockClient.invoke.mockResolvedValueOnce({ messages: [] })
    const r = await ipcMain.invoke('tg:get-messages', { chatId: 'tg_main:-1', limit: 50 })
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getChatHistory', chat_id: -1, limit: 50,
    }))
  })

  it('tg:send-message вызывает backend.messages.send', async () => {
    const { ipcMain, mockClient } = setup()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'message', id: 100, chat_id: -1,
      sender_id: { '@type': 'messageSenderUser', user_id: 1 },
      is_outgoing: true, date: 1715000000, media_album_id: '0',
      content: { '@type': 'messageText', text: { text: 'hi', entities: [] } },
    })
    const r = await ipcMain.invoke('tg:send-message', { chatId: 'tg_main:-1', text: 'hi' })
    expect(r.ok).toBe(true)
    expect(r.messageId).toBe('100')
  })

  it('tg:mark-read через viewMessages', async () => {
    const { ipcMain, mockClient } = setup()
    await ipcMain.invoke('tg:mark-read', { chatId: 'tg_main:-1', maxId: 50 })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'viewMessages', chat_id: -1, message_ids: [50],
    }))
  })

  it('tg:delete-message с forAll=true (revoke)', async () => {
    const { ipcMain, mockClient } = setup()
    await ipcMain.invoke('tg:delete-message', { chatId: 'tg_main:-1', messageId: 10, forAll: true })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'deleteMessages', revoke: true,
    }))
  })

  it('tg:edit-message', async () => {
    const { ipcMain, mockClient } = setup()
    await ipcMain.invoke('tg:edit-message', { chatId: 'tg_main:-1', messageId: 5, text: 'new' })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'editMessageText', message_id: 5,
    }))
  })

  it('handler exception → { ok: false, error }', async () => {
    const { ipcMain } = setup()
    const r = await ipcMain.invoke('tg:send-message', { chatId: 'broken' })
    expect(r.ok).toBe(false)
    expect(r.error).toBeDefined()
  })
})

// ──────────────────────────────────────────────────────────────────────
// CHATS routing
// ──────────────────────────────────────────────────────────────────────

describe('chats IPC handlers', () => {
  it('tg:get-cached-chats возвращает chats из cache', async () => {
    const { ipcMain, mockClient } = setup()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: 1, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'X', unread_count: 0 },
    })
    const r = await ipcMain.invoke('tg:get-cached-chats', { accountId: 'tg_main' })
    expect(r.ok).toBe(true)
    expect(r.chats).toHaveLength(1)
  })

  it('tg:rescan-unread возвращает accountStats', async () => {
    const { ipcMain } = setup()
    const r = await ipcMain.invoke('tg:rescan-unread', {})
    expect(r.ok).toBe(true)
    expect(r.accountStats).toBeDefined()
  })

  it('tg:health-check возвращает accountStats[]', async () => {
    const { ipcMain, mockClient } = setup()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'optionValueString', value: '1.8.30' })
    const r = await ipcMain.invoke('tg:health-check', {})
    expect(r.ok).toBe(true)
    // v0.89.0 / Этап 3.8: UI ожидает accountStats[] (массив, не объект)
    expect(Array.isArray(r.accountStats)).toBe(true)
    expect(r.accountStats[0]).toEqual(expect.objectContaining({ accountId: 'tg_main', ok: true }))
  })
})

// ──────────────────────────────────────────────────────────────────────
// ACCOUNTS routing
// ──────────────────────────────────────────────────────────────────────

describe('accounts IPC handlers', () => {
  it('tg:get-accounts возвращает список', async () => {
    const { ipcMain } = setup()
    const r = await ipcMain.invoke('tg:get-accounts', {})
    expect(r.ok).toBe(true)
    expect(r.accounts).toHaveLength(1)
    expect(r.accounts[0]).toEqual(expect.objectContaining({
      id: 'tg_main', messenger: 'telegram',
    }))
  })

  it('connected status когда authState=Ready', async () => {
    const { ipcMain, mockClient } = setup()
    mockClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateReady' },
    })
    const r = await ipcMain.invoke('tg:get-accounts', {})
    expect(r.accounts[0].status).toBe('connected')
  })

  it('tg:remove-account', async () => {
    const { ipcMain, mgr } = setup()
    expect(mgr.listAccounts()).toContain('tg_main')
    await ipcMain.invoke('tg:remove-account', { accountId: 'tg_main' })
    expect(mgr.listAccounts()).not.toContain('tg_main')
  })
})

// ──────────────────────────────────────────────────────────────────────
// EVENT BRIDGE: manager → renderer
// ──────────────────────────────────────────────────────────────────────

describe('manager → renderer event bridge', () => {
  it('message:new → tg:new-message', async () => {
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('update', {
      '@type': 'updateNewMessage',
      message: {
        '@type': 'message', id: 1, chat_id: -1,
        sender_id: { '@type': 'messageSenderUser', user_id: 1 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'привет', entities: [] } },
      },
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:new-message',
      expect.objectContaining({ chatId: 'tg_main:-1' }))
  })

  it('chat:unread-sync → tg:chat-unread-sync', async () => {
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'X', unread_count: 5 },
    })
    sendToRenderer.mockClear()
    mockClient.emit('update', {
      '@type': 'updateChatReadInbox',
      chat_id: -1, last_read_inbox_message_id: 100, unread_count: 2,
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:chat-unread-sync',
      { chatId: 'tg_main:-1', unreadCount: 2 })
  })

  it('account:auth-state authorizationStateWaitCode → tg:login-step step=code', async () => {
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitCode' },
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:login-step',
      expect.objectContaining({ step: 'code', accountId: 'tg_main' }))
  })

  it('authorizationStateReady → tg:login-step step=success', async () => {
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('update', {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateReady' },
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:login-step',
      expect.objectContaining({ step: 'success' }))
  })

  it('account:error → tg:account-update status=error', async () => {
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('error', new Error('TEST_ERR'))
    expect(sendToRenderer).toHaveBeenCalledWith('tg:account-update',
      expect.objectContaining({ status: 'error', error: 'TEST_ERR' }))
  })

  it('unregister снимает event listeners', async () => {
    const { mockClient, sendToRenderer, unregister } = setup()
    unregister()
    sendToRenderer.mockClear()
    mockClient.emit('update', {
      '@type': 'updateNewMessage',
      message: {
        '@type': 'message', id: 1, chat_id: -1,
        sender_id: { '@type': 'messageSenderUser', user_id: 1 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'x', entities: [] } },
      },
    })
    expect(sendToRenderer).not.toHaveBeenCalled()
  })
})
