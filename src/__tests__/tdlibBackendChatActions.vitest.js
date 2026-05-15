// v0.89.3 — тесты backend.chats.setMute / backend.chats.getCleanupStats +
// backend.messages.pinMessage/unpinMessage. Проверяют:
//   - корректную конвертацию UI payload в TDLib request
//   - правильные TDLib `@type` и required поля
//   - shape ответа совпадает с тем что ждёт UI (см. AccountContextMenu / MuteMenu)
//
// v0.89.2 версия этого файла тестировала backend.chats.togglePin (закреп ЧАТА),
// который оказался регрессией от GramJS контракта (UI шлёт `{messageId, unpin}`
// для закрепа сообщения, не чата). Переписано в v0.89.3:
//   - togglePin удалён
//   - tg:pin теперь идёт через backend.messages.pinMessage / unpinMessage
//   - setMute принимает muteUntil (Unix ts), не muteFor (duration)
//   - getCleanupStats возвращает { totalFiles, totalBytes, byCategory: {...} }
//     через fs-скан реальных папок (тут — через mocked fs)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'

function makeMockClient() {
  const c = new EventEmitter()
  c.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  c.close = vi.fn(() => Promise.resolve())
  return c
}

function makeBackend(opts = {}) {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_main', {})
  const backend = createTdlibBackend({
    manager: mgr,
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
    userDataDir: opts.userDataDir,
  })
  return { mgr, mockClient, backend }
}

// ──────────────────────────────────────────────────────────────────────
// setMute — UI шлёт muteUntil (Unix ts), backend конвертирует в mute_for
// ──────────────────────────────────────────────────────────────────────

describe('backend.chats.setMute — muteUntil → mute_for conversion', () => {
  let now = 0
  beforeEach(() => {
    now = Math.floor(Date.now() / 1000)
  })

  it('muteUntil=0 (UI «Включить») → mute_for=0 → unmute', async () => {
    const { backend, mockClient } = makeBackend()
    const r = await backend.chats.setMute('tg_main:-1001', 0)
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'setChatNotificationSettings',
      chat_id: -1001,
      notification_settings: expect.objectContaining({
        use_default_mute_for: false,
        mute_for: 0,
      }),
    }))
  })

  it('muteUntil=now+3600 («На час») → mute_for≈3600', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.chats.setMute('tg_main:-1001', now + 3600)
    const call = mockClient.invoke.mock.calls[0][0]
    expect(call.notification_settings.mute_for).toBeGreaterThanOrEqual(3599)
    expect(call.notification_settings.mute_for).toBeLessThanOrEqual(3601)
  })

  it('muteUntil=2147483647 («Навсегда» INT_MAX) → большое mute_for', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.chats.setMute('tg_main:-1001', 2147483647)
    const call = mockClient.invoke.mock.calls[0][0]
    // Должно быть > 100 лет в секундах
    expect(call.notification_settings.mute_for).toBeGreaterThan(2147483647 - now - 60)
  })

  it('muteUntil в прошлом → mute_for=0 (Math.max protection)', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.chats.setMute('tg_main:-1001', now - 1000)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      notification_settings: expect.objectContaining({ mute_for: 0 }),
    }))
  })

  it('передаёт ВСЕ 16 required-полей chatNotificationSettings', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.chats.setMute('tg_main:-1001', 0)
    const ns = mockClient.invoke.mock.calls[0][0].notification_settings
    const required = [
      'use_default_mute_for', 'mute_for',
      'use_default_sound', 'sound_id',
      'use_default_show_preview', 'show_preview',
      'use_default_mute_stories', 'mute_stories',
      'use_default_story_sound', 'story_sound_id',
      'use_default_show_story_poster', 'show_story_poster',
      'use_default_disable_pinned_message_notifications', 'disable_pinned_message_notifications',
      'use_default_disable_mention_notifications', 'disable_mention_notifications',
    ]
    for (const key of required) expect(ns).toHaveProperty(key)
  })

  it('invalid chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.chats.setMute('no-colon', 0)
    expect(r.ok).toBe(false)
  })

  it('TDLib error → ok: false с message + code', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce({ '@type': 'error', code: 400, message: 'CHAT_NOT_FOUND' })
    const r = await backend.chats.setMute('tg_main:-1', 0)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('CHAT_NOT_FOUND')
  })
})

// ──────────────────────────────────────────────────────────────────────
// pinMessage / unpinMessage — UI шлёт {chatId, messageId, unpin}
// ──────────────────────────────────────────────────────────────────────

describe('backend.messages.pinMessage / unpinMessage', () => {
  it('pinMessage → TDLib pinChatMessage с disable_notification:true', async () => {
    const { backend, mockClient } = makeBackend()
    const r = await backend.messages.pinMessage('tg_main:-1001', 12345, { disableNotification: true })
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith({
      '@type': 'pinChatMessage',
      chat_id: -1001,
      message_id: 12345,
      disable_notification: true,
      only_for_self: false,
    })
  })

  it('pinMessage с disableNotification:false → передаёт false', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.messages.pinMessage('tg_main:-1001', 12345, { disableNotification: false })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      disable_notification: false,
    }))
  })

  it('pinMessage с onlyForSelf:true → передаёт true', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.messages.pinMessage('tg_main:-1001', 12345, { onlyForSelf: true })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      only_for_self: true,
    }))
  })

  it('unpinMessage → TDLib unpinChatMessage', async () => {
    const { backend, mockClient } = makeBackend()
    const r = await backend.messages.unpinMessage('tg_main:-1001', 12345)
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith({
      '@type': 'unpinChatMessage',
      chat_id: -1001,
      message_id: 12345,
    })
  })

  it('pinMessage без messageId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.pinMessage('tg_main:-1', 0)
    expect(r.ok).toBe(false)
  })

  it('pinMessage с CHAT_ADMIN_REQUIRED ошибкой', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce({ '@type': 'error', code: 400, message: 'CHAT_ADMIN_REQUIRED' })
    const r = await backend.messages.pinMessage('tg_main:-1', 100)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('CHAT_ADMIN_REQUIRED')
  })

  it('invalid chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.pinMessage('no-colon', 100)
    expect(r.ok).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────
// getCleanupStats — fs scan tdlib-sessions/ + tg-avatars/
// ──────────────────────────────────────────────────────────────────────

describe('backend.chats.getCleanupStats — fs scan tdlib-sessions', () => {
  let tmpDir
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cleanup-'))
    // Структура:
    //   {tmp}/tdlib-sessions/tg_1/db.sqlite          (session)
    //   {tmp}/tdlib-sessions/tg_1/files/profile_photos/a.jpg  (avatars)
    //   {tmp}/tdlib-sessions/tg_1/files/photos/b.jpg          (media)
    //   {tmp}/tdlib-sessions/tg_1/files/stickers/c.webp       (cache)
    //   {tmp}/tdlib-sessions/tg_1/files/temp/d.dat            (tmp)
    //   {tmp}/tg-avatars/12345.jpg                            (avatars)
    const root = path.join(tmpDir, 'tdlib-sessions', 'tg_1')
    fs.mkdirSync(path.join(root, 'files', 'profile_photos'), { recursive: true })
    fs.mkdirSync(path.join(root, 'files', 'photos'), { recursive: true })
    fs.mkdirSync(path.join(root, 'files', 'stickers'), { recursive: true })
    fs.mkdirSync(path.join(root, 'files', 'temp'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'tg-avatars'), { recursive: true })

    fs.writeFileSync(path.join(root, 'db.sqlite'), 'x'.repeat(1000))                        // session 1000
    fs.writeFileSync(path.join(root, 'files', 'profile_photos', 'a.jpg'), 'x'.repeat(500))  // avatars 500
    fs.writeFileSync(path.join(root, 'files', 'photos', 'b.jpg'), 'x'.repeat(2000))         // media 2000
    fs.writeFileSync(path.join(root, 'files', 'stickers', 'c.webp'), 'x'.repeat(300))       // cache 300
    fs.writeFileSync(path.join(root, 'files', 'temp', 'd.dat'), 'x'.repeat(100))            // tmp 100
    fs.writeFileSync(path.join(tmpDir, 'tg-avatars', '12345.jpg'), 'x'.repeat(400))         // avatars 400
  })
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
  })

  it('возвращает { ok, totalFiles, totalBytes, byCategory: {...} }', async () => {
    const { backend } = makeBackend({ userDataDir: tmpDir })
    const r = await backend.chats.getCleanupStats()
    expect(r.ok).toBe(true)
    expect(r.totalFiles).toBe(6)
    expect(r.totalBytes).toBe(1000 + 500 + 2000 + 300 + 100 + 400)
    expect(r.byCategory.session).toEqual({ files: 1, bytes: 1000 })
    expect(r.byCategory.avatars).toEqual({ files: 2, bytes: 500 + 400 })
    expect(r.byCategory.media).toEqual({ files: 1, bytes: 2000 })
    expect(r.byCategory.cache).toEqual({ files: 1, bytes: 300 })
    expect(r.byCategory.tmp).toEqual({ files: 1, bytes: 100 })
  })

  it('shape совпадает с тем что ждёт UI (AccountContextMenu CleanupRow)', async () => {
    const { backend } = makeBackend({ userDataDir: tmpDir })
    const r = await backend.chats.getCleanupStats()
    // UI читает: stats.byCategory?.session, .avatars, .cache, .media, .tmp
    // CleanupRow ждёт { files, bytes } (см. AccountContextMenu.jsx:41-52)
    for (const cat of ['session', 'avatars', 'cache', 'media', 'tmp']) {
      expect(r.byCategory[cat]).toHaveProperty('files')
      expect(r.byCategory[cat]).toHaveProperty('bytes')
      expect(typeof r.byCategory[cat].files).toBe('number')
      expect(typeof r.byCategory[cat].bytes).toBe('number')
    }
    expect(typeof r.totalFiles).toBe('number')
    expect(typeof r.totalBytes).toBe('number')
  })

  it('если tdlib-sessions/ нет → пустой результат (не падает)', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cleanup-empty-'))
    try {
      const { backend } = makeBackend({ userDataDir: empty })
      const r = await backend.chats.getCleanupStats()
      expect(r.ok).toBe(true)
      expect(r.totalFiles).toBe(0)
      expect(r.totalBytes).toBe(0)
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })

  it('userDataDir не передан → { ok: true, totalFiles: 0, totalBytes: 0 }', async () => {
    const { backend } = makeBackend()
    const r = await backend.chats.getCleanupStats()
    expect(r.ok).toBe(true)
    expect(r.totalFiles).toBe(0)
  })
})
