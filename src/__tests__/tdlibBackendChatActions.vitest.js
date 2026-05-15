// v0.89.2 — тесты backend.chats: setMute / togglePin / getCleanupStats.
//
// Раньше эти IPC каналы (`tg:set-mute`, `tg:pin`, `tg:get-cleanup-stats`)
// были stub'ами возвращавшими `{ ok: true }` без реальных вызовов TDLib.
// Этап 4-аудита пометил это как user-facing регрессию (юзер нажимает «Закрепить
// чат» → ничего не происходит). Здесь проверяем что:
//   - IPC payload корректно конвертируется в TDLib request
//   - Используются правильные `@type` и required поля
//   - Ошибка от TDLib пробрасывается как { ok: false, error, code }

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'

function makeMockClient() {
  const c = new EventEmitter()
  c.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  c.close = vi.fn(() => Promise.resolve())
  return c
}

function makeBackend() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_main', {})
  const backend = createTdlibBackend({
    manager: mgr,
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
  })
  return { mgr, mockClient, backend }
}

describe('backend.chats.setMute — setChatNotificationSettings', () => {
  it('mute на 3600 секунд → setChatNotificationSettings с mute_for=3600', async () => {
    const { backend, mockClient } = makeBackend()
    const r = await backend.chats.setMute('tg_main:-1001', 3600)
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'setChatNotificationSettings',
      chat_id: -1001,
      notification_settings: expect.objectContaining({
        '@type': 'chatNotificationSettings',
        use_default_mute_for: false,
        mute_for: 3600,
      }),
    }))
  })

  it('unmute (muteFor=0) → mute_for=0 + use_default_mute_for=false', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.chats.setMute('tg_main:-1001', 0)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      notification_settings: expect.objectContaining({
        use_default_mute_for: false,
        mute_for: 0,
      }),
    }))
  })

  it('передаёт ВСЕ required-поля chatNotificationSettings (16 полей)', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.chats.setMute('tg_main:-1001', 60)
    const call = mockClient.invoke.mock.calls[0][0]
    const ns = call.notification_settings
    // Все ключи которые TDLib требует non-nullable
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
    for (const key of required) {
      expect(ns).toHaveProperty(key)
    }
  })

  it('invalid chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.chats.setMute('no-colon', 60)
    expect(r.ok).toBe(false)
  })

  it('TDLib error → ok: false с message', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce({ '@type': 'error', code: 400, message: 'CHAT_NOT_FOUND' })
    const r = await backend.chats.setMute('tg_main:-1', 60)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('CHAT_NOT_FOUND')
  })
})

describe('backend.chats.togglePin — toggleChatIsPinned', () => {
  it('pin → toggleChatIsPinned с chat_list:chatListMain + is_pinned:true', async () => {
    const { backend, mockClient } = makeBackend()
    const r = await backend.chats.togglePin('tg_main:-1001', true)
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'toggleChatIsPinned',
      chat_list: { '@type': 'chatListMain' },
      chat_id: -1001,
      is_pinned: true,
    }))
  })

  it('unpin → is_pinned:false', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.chats.togglePin('tg_main:-1001', false)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      is_pinned: false,
    }))
  })

  it('invalid chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.chats.togglePin('no-colon', true)
    expect(r.ok).toBe(false)
  })

  it('TDLib error → ok: false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce(new Error('PINNED_CHATS_TOO_MUCH'))
    const r = await backend.chats.togglePin('tg_main:-1', true)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('PINNED_CHATS_TOO_MUCH')
  })
})

describe('backend.chats.getCleanupStats — getStorageStatisticsFast', () => {
  it('суммирует files_size + database_size по аккаунтам', async () => {
    const { mgr, backend, mockClient } = makeBackend()
    const mock2 = makeMockClient()
    mgr.clientFactory = () => mock2
    mgr.createAccount('tg_other', {})

    // mockClient (для tg_main) — 1 МБ files + 0.5 МБ db
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'storageStatisticsFast',
      files_size: 1024 * 1024,
      database_size: 512 * 1024,
    })
    // mock2 (для tg_other) — 2 МБ files + 1 МБ db
    mock2.invoke.mockResolvedValueOnce({
      '@type': 'storageStatisticsFast',
      files_size: 2 * 1024 * 1024,
      database_size: 1024 * 1024,
    })

    const r = await backend.chats.getCleanupStats()
    expect(r.ok).toBe(true)
    expect(r.bytes).toBe(3 * 1024 * 1024)        // files_size summed
    expect(r.dbBytes).toBe(1536 * 1024)           // database_size summed
  })

  it('ошибка одного аккаунта не ломает остальные', async () => {
    const { mgr, backend, mockClient } = makeBackend()
    const mock2 = makeMockClient()
    mgr.clientFactory = () => mock2
    mgr.createAccount('tg_other', {})

    mockClient.invoke.mockRejectedValueOnce(new Error('TDLib busy'))
    mock2.invoke.mockResolvedValueOnce({
      '@type': 'storageStatisticsFast',
      files_size: 100, database_size: 50,
    })

    const r = await backend.chats.getCleanupStats()
    expect(r.ok).toBe(true)
    expect(r.bytes).toBe(100)
    expect(r.dbBytes).toBe(50)
  })

  it('правильный @type запроса (getStorageStatisticsFast, не getStorageStatistics)', async () => {
    const { backend, mockClient } = makeBackend()
    await backend.chats.getCleanupStats()
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'getStorageStatisticsFast',
    }))
  })
})
