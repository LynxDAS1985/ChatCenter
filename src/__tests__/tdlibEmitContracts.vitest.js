// v0.89.4 — emit-direction IPC контракт-тесты.
//
// Защита от того что пропустил третий аудит: эти тесты проверяют что для каждого
// manager.emit('X', payload) в backend есть bridge sendToRenderer('tg:Y', ...)
// и что payload совпадает с тем что UI ждёт в nativeStoreIpc.js addHandler.
//
// Подход: эмитим TDLib update, проверяем что sendToRenderer вызвался с
// правильным каналом и shape (полные поля и их типы).
//
// Соответствие UI listeners (см. src/native/store/nativeStoreIpc.js):
//   addHandler('tg:typing', ({ chatId, userId, typing }) => ...)
//   addHandler('tg:read', ({ chatId, outgoing, stillUnread, maxId }) => ...)
//   addHandler('tg:sender-avatar', ({ senderId, avatarUrl }) => ...)
//   addHandler('tg:account-update', (acc) => ...)        // acc.removed → cleanup
//   addHandler('tg:media-progress', (data) => ...)

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
    invoke(channel, payload) { return handlers.get(channel)({}, payload) },
  }
}

function makeMockClient() {
  const c = new EventEmitter()
  c.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  c.close = vi.fn(() => Promise.resolve())
  return c
}

function setup(opts = {}) {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_main', {})
  const backend = createTdlibBackend({
    manager: mgr,
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
    userDataDir: opts.userDataDir,
  })
  const ipcMain = makeMockIpcMain()
  const sendToRenderer = vi.fn()
  const unregister = initTdlibIpcHandlers({ ipcMain, backend, sendToRenderer, userDataPath: opts.userDataDir })
  return { mgr, mockClient, backend, ipcMain, sendToRenderer, unregister }
}

describe('tg:typing — updateChatAction bridge', () => {
  it('chatActionTyping → tg:typing {chatId, userId, typing:true}', () => {
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('update', {
      '@type': 'updateChatAction', chat_id: -1001,
      sender_id: { '@type': 'messageSenderUser', user_id: 42 },
      action: { '@type': 'chatActionTyping' },
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:typing', {
      chatId: 'tg_main:-1001', userId: '42', typing: true,
    })
  })

  it('chatActionCancel → tg:typing {typing:false}', () => {
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('update', {
      '@type': 'updateChatAction', chat_id: -1001,
      sender_id: { '@type': 'messageSenderUser', user_id: 42 },
      action: { '@type': 'chatActionCancel' },
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:typing',
      expect.objectContaining({ typing: false }))
  })

  it('messageSenderChat (бот/канал) — не эмитим typing', () => {
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('update', {
      '@type': 'updateChatAction', chat_id: -1,
      sender_id: { '@type': 'messageSenderChat', chat_id: -2 },
      action: { '@type': 'chatActionTyping' },
    })
    const typingCalls = sendToRenderer.mock.calls.filter(c => c[0] === 'tg:typing')
    expect(typingCalls).toHaveLength(0)
  })
})

describe('tg:read — updateChatReadOutbox bridge', () => {
  it('outgoing read-receipt → tg:read {chatId, outgoing:true, maxId}', () => {
    const { mockClient, sendToRenderer } = setup()
    // Setup: chat exists in cache
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1001, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'X', unread_count: 0 },
    })
    sendToRenderer.mockClear()
    mockClient.emit('update', {
      '@type': 'updateChatReadOutbox', chat_id: -1001,
      last_read_outbox_message_id: 500,
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:read', {
      chatId: 'tg_main:-1001', outgoing: true, maxId: 500,
    })
  })
})

describe('tg:sender-avatar — user:avatar bridge (без chatId)', () => {
  it('emit формата {senderId, avatarUrl} — UI iterates все чаты', () => {
    const { mgr, sendToRenderer } = setup()
    // Эмулируем emit от tdlibAvatars (после download completed)
    mgr.emit('user:avatar', { accountId: 'tg_main', userId: 42, avatarPath: 'cc-media://avatars/42.jpg' })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:sender-avatar', {
      senderId: '42', avatarUrl: 'cc-media://avatars/42.jpg',
    })
    // Регрессия: НЕ должно быть accountId/userId/avatarPath полей
    const call = sendToRenderer.mock.calls.find(c => c[0] === 'tg:sender-avatar')
    expect(call[1]).not.toHaveProperty('accountId')
    expect(call[1]).not.toHaveProperty('userId')
    expect(call[1]).not.toHaveProperty('avatarPath')
  })
})

describe('tg:account-update {removed:true} — removeAccount flow', () => {
  it('backend.auth.removeAccount эмитит tg:account-update с removed:true', async () => {
    const { backend, sendToRenderer } = setup()
    sendToRenderer.mockClear()
    await backend.auth.removeAccount('tg_main')
    const accountUpdates = sendToRenderer.mock.calls.filter(c => c[0] === 'tg:account-update')
    expect(accountUpdates.length).toBeGreaterThan(0)
    const removedCall = accountUpdates.find(c => c[1]?.removed === true)
    expect(removedCall).toBeDefined()
    expect(removedCall[1]).toEqual(expect.objectContaining({
      id: 'tg_main', removed: true, status: 'disconnected',
      wipeStats: expect.objectContaining({ isLast: true }),
    }))
  })

  it('removeAccount вызывает logOut на TDLib перед close', async () => {
    const { mockClient, backend } = setup()
    await backend.auth.removeAccount('tg_main')
    const logOutCall = mockClient.invoke.mock.calls.find(c => c[0]?.['@type'] === 'logOut')
    expect(logOutCall).toBeDefined()
  })
})

describe('tg:media-progress — onProgress bridge', () => {
  it('tg:download-media передаёт onProgress, эмитит tg:media-progress', async () => {
    const { ipcMain, mockClient, sendToRenderer } = setup()
    // Setup raw message для getMessage
    mockClient.invoke.mockImplementation(async (req) => {
      if (req['@type'] === 'getMessage') {
        return { '@type': 'message', id: 100, chat_id: -1,
          content: { '@type': 'messagePhoto', photo: { sizes: [
            { width: 100, height: 100, photo: { id: 555, size: 1000, local: {} } }
          ] } } }
      }
      if (req['@type'] === 'downloadFile') return { id: 555, local: {} }
      return { '@type': 'ok' }
    })
    // Запускаем download — не ждём (он висит на updateFile)
    const dlPromise = ipcMain.invoke('tg:download-media', { chatId: 'tg_main:-1', messageId: 100 })
    // Эмулируем updateFile с progress
    await new Promise(r => setTimeout(r, 5))
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: { id: 555, size: 1000, local: { downloaded_size: 500, is_downloading_completed: false } },
    })
    await new Promise(r => setTimeout(r, 5))
    const progressCall = sendToRenderer.mock.calls.find(c => c[0] === 'tg:media-progress')
    expect(progressCall).toBeDefined()
    expect(progressCall[1]).toEqual({
      chatId: 'tg_main:-1', messageId: '100', bytes: 500, total: 1000,
    })
    // Cleanup — complete download
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: { id: 555, size: 1000, local: { downloaded_size: 1000, is_downloading_completed: true, path: '/x.jpg' } },
    })
    await dlPromise
  })
})

describe('tg:send-clipboard-image handler', () => {
  it('handler существует (раньше UI получал NO_HANDLER ошибку)', () => {
    const { ipcMain } = setup()
    expect(ipcMain.handlers.has('tg:send-clipboard-image')).toBe(true)
  })

  it('без userDataPath → ok:false с понятной ошибкой', async () => {
    const { ipcMain } = setup() // НЕТ userDataDir
    const r = await ipcMain.invoke('tg:send-clipboard-image', {
      chatId: 'tg_main:-1', data: [1, 2, 3], ext: 'png',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/userDataPath/i)
  })

  it('без chatId → ok:false', async () => {
    const { ipcMain } = setup({ userDataDir: '/tmp/test' })
    const r = await ipcMain.invoke('tg:send-clipboard-image', { data: [1, 2, 3], ext: 'png' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/chatId/i)
  })

  it('пустой data → ok:false', async () => {
    const { ipcMain } = setup({ userDataDir: '/tmp/test' })
    const r = await ipcMain.invoke('tg:send-clipboard-image', { chatId: 'tg_main:-1', data: [], ext: 'png' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/empty/i)
  })
})

describe('tg:get-accounts — не возвращает пустые name/phone (race protection)', () => {
  it('initial state — только id+messenger+status, без name/phone полей', async () => {
    const { ipcMain } = setup()
    const r = await ipcMain.invoke('tg:get-accounts', {})
    expect(r.ok).toBe(true)
    expect(r.accounts[0]).toEqual({
      id: 'tg_main', messenger: 'telegram', status: 'connecting',
    })
    // Регрессия: name:'' и phone:'' раньше были, перезаписывали merged state в UI
    expect(r.accounts[0]).not.toHaveProperty('name')
    expect(r.accounts[0]).not.toHaveProperty('phone')
  })
})
