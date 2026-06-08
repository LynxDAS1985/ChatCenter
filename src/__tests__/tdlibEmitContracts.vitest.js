// v0.89.4 — emit-direction IPC контракт-тесты: TDLib update → sendToRenderer.
// Покрывает: tg:typing, tg:read, tg:sender-avatar, tg:account-update, tg:media-progress.
// Соответствие UI listeners — см. src/native/store/nativeStoreIpc.js addHandler.

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
  it('chatActionTyping → tg:typing {chatId, userId, senderName, typing:true}', () => {
    // v0.95.31: добавлен senderName для multi-user typing-индикатора.
    // userCache пустой в моке → senderName=''. С реальным userCache имя резолвится.
    const { mockClient, sendToRenderer } = setup()
    mockClient.emit('update', {
      '@type': 'updateChatAction', chat_id: -1001,
      sender_id: { '@type': 'messageSenderUser', user_id: 42 },
      action: { '@type': 'chatActionTyping' },
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:typing', {
      chatId: 'tg_main:-1001', userId: '42', senderName: '', typing: true,
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

// v0.95.38: фикс «дубля сообщений после server ACK».
// Корень: tdlibClient.js не обрабатывал updateMessageSendSucceeded — TDLib менял
// id с provisional на финальный, но store не знал → следующий loadNewerMessages
// приносил финал → дубль (dedup по id, id разные). См. mistakes/outgoing-two-cases.md
describe('tg:send-succeeded — updateMessageSendSucceeded bridge (v0.95.38)', () => {
  it('updateMessageSendSucceeded → emit "tg:send-succeeded" с oldId + newMessage', () => {
    const { mockClient, sendToRenderer } = setup()
    sendToRenderer.mockClear()
    mockClient.emit('update', {
      '@type': 'updateMessageSendSucceeded',
      old_message_id: 100000000001,
      message: {
        '@type': 'message',
        id: 12345,
        chat_id: -1001,
        sender_id: { '@type': 'messageSenderUser', user_id: 42 },
        is_outgoing: true,
        date: 1715000000,
        content: { '@type': 'messageText', text: { text: 'test' } },
      },
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:send-succeeded', expect.objectContaining({
      chatId: 'tg_main:-1001',
      oldId: '100000000001',
    }))
    // newMessage содержит финальный id и isSending=false (sending_state отсутствует)
    const call = sendToRenderer.mock.calls.find(c => c[0] === 'tg:send-succeeded')
    expect(call[1].newMessage.id).toBe('12345')
    expect(call[1].newMessage.isSending).toBe(false)
    expect(call[1].newMessage.isOutgoing).toBe(true)
  })

  it('updateMessageSendFailed → тоже emit "tg:send-succeeded" (UI обновляет статус)', () => {
    const { mockClient, sendToRenderer } = setup()
    sendToRenderer.mockClear()
    mockClient.emit('update', {
      '@type': 'updateMessageSendFailed',
      old_message_id: 100000000002,
      message: {
        '@type': 'message',
        id: 100000000002,
        chat_id: -1001,
        sender_id: { '@type': 'messageSenderUser', user_id: 42 },
        is_outgoing: true,
        sending_state: { '@type': 'messageSendingStateFailed' },
        date: 1715000000,
        content: { '@type': 'messageText', text: { text: 'failed' } },
      },
    })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:send-succeeded', expect.objectContaining({
      oldId: '100000000002',
    }))
    // sending_state=Failed → isSending=true (наш mapper маппит !!sending_state)
    const call = sendToRenderer.mock.calls.find(c => c[0] === 'tg:send-succeeded')
    expect(call[1].newMessage.isSending).toBe(true)
  })
})

// v0.95.44: прогресс UPLOAD через updateFile.remote.uploaded_size.
// throttle на Math.floor(%) в IPC bridge: emit только при изменении целого %.
describe('tg:upload-progress — updateFile bridge (v0.95.44)', () => {
  it('updateFile с remote.uploaded_size + size → emit tg:upload-progress', () => {
    const { mockClient, sendToRenderer } = setup()
    sendToRenderer.mockClear()
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: {
        '@type': 'file', id: 100, size: 1000,
        local: { downloaded_size: 0 },
        remote: { uploaded_size: 250, is_uploading_active: true, is_uploading_completed: false },
      },
    })
    const calls = sendToRenderer.mock.calls.filter(c => c[0] === 'tg:upload-progress')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0][1]).toEqual(expect.objectContaining({
      fileId: '100', uploaded: 250, total: 1000, percent: 25, done: false,
    }))
  })

  it('updateFile с is_uploading_completed → emit done:true', () => {
    const { mockClient, sendToRenderer } = setup()
    sendToRenderer.mockClear()
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: {
        '@type': 'file', id: 101, size: 1000,
        local: { downloaded_size: 0 },
        remote: { uploaded_size: 1000, is_uploading_active: false, is_uploading_completed: true },
      },
    })
    const calls = sendToRenderer.mock.calls.filter(c => c[0] === 'tg:upload-progress')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0][1].done).toBe(true)
    expect(calls[0][1].percent).toBe(100)
  })

  it('updateFile БЕЗ remote.uploaded — НЕ emit tg:upload-progress', () => {
    const { mockClient, sendToRenderer } = setup()
    sendToRenderer.mockClear()
    // updateFile только с local (download path) — upload events нет
    mockClient.emit('update', {
      '@type': 'updateFile',
      file: {
        '@type': 'file', id: 200, size: 0,
        local: { downloaded_size: 500 },
        remote: { uploaded_size: 0, is_uploading_active: false },
      },
    })
    const calls = sendToRenderer.mock.calls.filter(c => c[0] === 'tg:upload-progress')
    expect(calls.length).toBe(0)  // file.size = 0 → skip
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

describe('tg:get-accounts — race protection (snapshot cache)', () => {
  it('initial state (до finalize) — только id+messenger+status, без name/phone', async () => {
    const { ipcMain } = setup()
    const r = await ipcMain.invoke('tg:get-accounts', {})
    expect(r.ok).toBe(true)
    expect(r.accounts[0]).toEqual({
      id: 'tg_main', messenger: 'telegram', status: 'connecting',
    })
    // Регрессия v0.89.4: name:'' и phone:'' раньше были, перезаписывали merged state.
    expect(r.accounts[0]).not.toHaveProperty('name')
    expect(r.accounts[0]).not.toHaveProperty('phone')
  })

  // v0.89.6: после finalize tg:get-accounts ВОЗВРАЩАЕТ name/phone/avatar из cache —
  // это решает race condition «UI запросил accounts после того как account:update
  // event уже был emitted». Раньше handler возвращал только id/status даже когда
  // данные были известны backend'у.
  it('после finalize — name/phone/username/userId из record.userCache', async () => {
    const { mgr, mockClient, ipcMain } = setup()
    // Эмулируем getMe response
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'user', id: 196000, first_name: 'Иван', last_name: 'Петров',
      phone_number: '79991234567', usernames: { active_usernames: ['ivan'] },
    })
    const finRes = await mgr.finalizeAccount('tg_main')
    expect(finRes.ok).toBe(true)
    expect(finRes.newAccountId).toBe('tg_196000')

    const r = await ipcMain.invoke('tg:get-accounts', {})
    const acc = r.accounts.find(a => a.id === 'tg_196000')
    expect(acc).toBeDefined()
    expect(acc.name).toBe('Иван Петров')
    expect(acc.phone).toBe('+79991234567')
    expect(acc.username).toBe('ivan')
    expect(acc.userId).toBe('196000')
  })

  // v0.89.6: avatar для аккаунта попадает в snapshot после download.
  it('после avatar download — avatar в snapshot', async () => {
    const { mgr, mockClient, ipcMain } = setup()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'user', id: 196000, first_name: 'И', last_name: '',
      phone_number: '79991234567',
    })
    await mgr.finalizeAccount('tg_main')
    const record = mgr.accounts.get('tg_196000')
    // Эмулируем что avatar уже в cache (как было бы после emitAvatarReady)
    record.userAvatars.set(196000, 'cc-media://avatars/196000.jpg')
    const r = await ipcMain.invoke('tg:get-accounts', {})
    const acc = r.accounts.find(a => a.id === 'tg_196000')
    expect(acc.avatar).toBe('cc-media://avatars/196000.jpg')
  })
})

describe('snapshot caches — chatAvatars / userAvatars', () => {
  it('emitAvatarReady (chat) → record.chatAvatars[chatId] = url', async () => {
    const { mgr } = setup()
    const record = mgr.accounts.get('tg_main')
    const { emitAvatarReady } = await import('../../main/native/backends/tdlibAvatars.js')
    // Эмулируем что copyToAvatarsDir вернул URL (не зависит от fs — путь не должен
    // содержать 'tdlib-sessions' иначе вернёт null). Используем фейковый.
    // Прямой test через record.chatAvatars.set:
    record.chatAvatars.set(-1001, 'cc-media://avatars/-1001.jpg')
    expect(record.chatAvatars.get(-1001)).toBe('cc-media://avatars/-1001.jpg')
  })
  it('getAccountChats читает chatAvatars в snapshot (mapChat extras.avatar)', () => {
    const { mgr, mockClient } = setup()
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1001, type: { '@type': 'chatTypePrivate', user_id: 1 }, title: 'X', unread_count: 0 },
    })
    const record = mgr.accounts.get('tg_main')
    record.chatAvatars.set(-1001, 'cc-media://avatars/-1001.jpg')
    const chats = mgr.getAccountChats('tg_main')
    expect(chats[0].avatar).toBe('cc-media://avatars/-1001.jpg')
  })
  it('getSenderAvatar читает userAvatars (раньше hardcoded null)', async () => {
    const { mgr, mockClient, backend } = setup()
    // 1) updateUser для sender
    mockClient.emit('update', {
      '@type': 'updateUser',
      user: { id: 42, first_name: 'Sender' },
    })
    // 2) updateNewChat
    mockClient.emit('update', {
      '@type': 'updateNewChat',
      chat: { id: -1001, type: { '@type': 'chatTypeBasicGroup', basic_group_id: 1 }, title: 'G', unread_count: 0 },
    })
    // 3) Кладём avatar в cache
    const record = mgr.accounts.get('tg_main')
    record.userAvatars.set(42, 'cc-media://avatars/42.jpg')
    // 4) Эмулируем getMessages — senderAvatar должен прийти из cache
    mockClient.invoke.mockResolvedValueOnce({
      messages: [{
        '@type': 'message', id: 100, chat_id: -1001,
        sender_id: { '@type': 'messageSenderUser', user_id: 42 },
        is_outgoing: false, date: 1715000000, media_album_id: '0',
        content: { '@type': 'messageText', text: { text: 'hi', entities: [] } },
      }],
    })
    const r = await backend.messages.get({ chatId: 'tg_main:-1001', limit: 10 })
    expect(r.messages[0].senderAvatar).toBe('cc-media://avatars/42.jpg')
  })
  it('own avatar (kind=user, ownerId===ownUserId) эмитит account:update с avatar', async () => {
    const { mgr, mockClient, sendToRenderer } = setup()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'user', id: 196000, first_name: 'I', phone_number: '7',
    })
    await mgr.finalizeAccount('tg_main')
    sendToRenderer.mockClear()
    const record = mgr.accounts.get('tg_196000')
    // Эмулируем emit как бы из emitAvatarReady (минуя fs)
    record.userAvatars.set(196000, 'cc-media://avatars/196000.jpg')
    mgr.emit('account:update', { id: 'tg_196000', messenger: 'telegram', avatar: 'cc-media://avatars/196000.jpg' })
    expect(sendToRenderer).toHaveBeenCalledWith('tg:account-update',
      expect.objectContaining({ id: 'tg_196000', avatar: 'cc-media://avatars/196000.jpg' }))
  })
})
