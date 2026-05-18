// v0.89.34: вынесено из tdlibIpcHandlers.vitest.js (был 385 строк, лимит 400).
// Покрывает: event bridge (manager → renderer tg:* events) + IPC contracts.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'
import { initTdlibIpcHandlers } from '../../main/native/tdlibIpcHandlers.js'

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
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
  })
  const ipcMain = makeMockIpcMain()
  const sendToRenderer = vi.fn()
  const log = vi.fn()
  const unregister = initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer, log })
  return { mgr, mockClient, backend, ipcMain, sendToRenderer, log, unregister }
}

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

// v0.89.3 — IPC контракт-тесты: UI payload → handler → backend → TDLib invoke.
describe('IPC contracts (UI payload signatures)', () => {
  it('tg:pin {chatId, messageId, unpin:false} → TDLib pinChatMessage', async () => {
    const { ipcMain, mockClient } = setup()
    const r = await ipcMain.invoke('tg:pin', { chatId: 'tg_main:-1001', messageId: 12345, unpin: false })
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith({
      '@type': 'pinChatMessage', chat_id: -1001, message_id: 12345,
      disable_notification: true, only_for_self: false,
    })
  })

  it('tg:pin {unpin:true} → TDLib unpinChatMessage', async () => {
    const { ipcMain, mockClient } = setup()
    await ipcMain.invoke('tg:pin', { chatId: 'tg_main:-1001', messageId: 12345, unpin: true })
    expect(mockClient.invoke).toHaveBeenCalledWith({
      '@type': 'unpinChatMessage', chat_id: -1001, message_id: 12345,
    })
  })

  it('tg:set-mute {chatId, muteUntil} → TDLib setChatNotificationSettings c mute_for', async () => {
    const { ipcMain, mockClient } = setup()
    const now = Math.floor(Date.now() / 1000)
    await ipcMain.invoke('tg:set-mute', { chatId: 'tg_main:-1001', muteUntil: now + 3600 })
    const call = mockClient.invoke.mock.calls[0][0]
    expect(call['@type']).toBe('setChatNotificationSettings')
    expect(call.chat_id).toBe(-1001)
    expect(call.notification_settings.mute_for).toBeGreaterThanOrEqual(3599)
    expect(call.notification_settings.mute_for).toBeLessThanOrEqual(3601)
  })

  it('tg:set-mute {muteUntil: 0} → unmute (mute_for=0)', async () => {
    const { ipcMain, mockClient } = setup()
    await ipcMain.invoke('tg:set-mute', { chatId: 'tg_main:-1001', muteUntil: 0 })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      notification_settings: expect.objectContaining({ mute_for: 0 }),
    }))
  })

  it('tg:set-mute regression: handler НЕ читает поле muteFor', async () => {
    const { ipcMain, mockClient } = setup()
    await ipcMain.invoke('tg:set-mute', { chatId: 'tg_main:-1', muteUntil: 0 })
    expect(mockClient.invoke).toHaveBeenCalled()
    mockClient.invoke.mockClear()
    await ipcMain.invoke('tg:set-mute', { chatId: 'tg_main:-1', muteFor: 3600 })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      notification_settings: expect.objectContaining({ mute_for: 0 }),
    }))
  })

  it('tg:get-cleanup-stats → shape {totalFiles, totalBytes, byCategory}', async () => {
    const { ipcMain } = setup()
    const r = await ipcMain.invoke('tg:get-cleanup-stats', {})
    expect(r.ok).toBe(true)
    expect(r).toHaveProperty('totalFiles')
    expect(r).toHaveProperty('totalBytes')
    expect(r).toHaveProperty('byCategory')
  })
})
