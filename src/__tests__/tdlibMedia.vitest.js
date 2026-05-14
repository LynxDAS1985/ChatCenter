// v0.89.0 — Stage 4 / Этап 2.5: тесты TDLib media.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import {
  downloadFile, cancelDownload, extractMediaFileId, getCachedFilePath,
  getStorageStatistics, optimizeStorage,
} from '../../main/native/backends/tdlibMedia.js'

function makeMockClient() {
  const client = new EventEmitter()
  client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
  client.close = vi.fn(() => Promise.resolve())
  return client
}

function makeManager() {
  const mockClient = makeMockClient()
  const mgr = new TdlibClientManager({ clientFactory: () => mockClient })
  mgr.createAccount('tg_a', {})
  return { mgr, mockClient }
}

// ──────────────────────────────────────────────────────────────────────
// extractMediaFileId
// ──────────────────────────────────────────────────────────────────────

describe('extractMediaFileId', () => {
  it('messagePhoto → fileId максимального размера', () => {
    const content = {
      '@type': 'messagePhoto',
      photo: {
        sizes: [
          { type: 's', width: 100, height: 75, photo: { id: 1 } },
          { type: 'x', width: 1280, height: 960, photo: { id: 3 } },
          { type: 'm', width: 800, height: 600, photo: { id: 2 } },
        ],
      },
    }
    expect(extractMediaFileId(content)).toEqual({ fileId: 3, kind: 'photo' })
  })

  it('messageVideo → video.id', () => {
    const content = { '@type': 'messageVideo', video: { video: { id: 42 } } }
    expect(extractMediaFileId(content)).toEqual({ fileId: 42, kind: 'video' })
  })

  it('messageDocument → document.id', () => {
    const content = { '@type': 'messageDocument', document: { document: { id: 99 } } }
    expect(extractMediaFileId(content)).toEqual({ fileId: 99, kind: 'document' })
  })

  it('messageVoiceNote', () => {
    expect(extractMediaFileId({
      '@type': 'messageVoiceNote', voice_note: { voice: { id: 5 } },
    })).toEqual({ fileId: 5, kind: 'voice' })
  })

  it('messageAnimation', () => {
    expect(extractMediaFileId({
      '@type': 'messageAnimation', animation: { animation: { id: 7 } },
    })).toEqual({ fileId: 7, kind: 'animation' })
  })

  it('messageText → null fileId', () => {
    expect(extractMediaFileId({ '@type': 'messageText' })).toEqual({ fileId: null, kind: null })
  })

  it('null content → null', () => {
    expect(extractMediaFileId(null)).toEqual({ fileId: null, kind: null })
  })

  it('messagePhoto без sizes → null fileId', () => {
    expect(extractMediaFileId({ '@type': 'messagePhoto', photo: {} }))
      .toEqual({ fileId: null, kind: 'photo' })
  })
})

// ──────────────────────────────────────────────────────────────────────
// getCachedFilePath
// ──────────────────────────────────────────────────────────────────────

describe('getCachedFilePath', () => {
  it('downloading_completed=true → возвращает path', () => {
    expect(getCachedFilePath({
      local: { is_downloading_completed: true, path: '/tmp/file.jpg' },
    })).toBe('/tmp/file.jpg')
  })

  it('is_downloading_completed=false → null', () => {
    expect(getCachedFilePath({
      local: { is_downloading_completed: false, path: '/tmp/file.jpg' },
    })).toBe(null)
  })

  it('null/undefined → null', () => {
    expect(getCachedFilePath(null)).toBe(null)
    expect(getCachedFilePath({})).toBe(null)
  })
})

// ──────────────────────────────────────────────────────────────────────
// downloadFile — main flow
// ──────────────────────────────────────────────────────────────────────

describe('downloadFile', () => {
  it('файл уже скачан — invoke возвращает completed=true → резолвится мгновенно', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'file', id: 10,
      local: { is_downloading_completed: true, path: '/cached/file.jpg' },
    })
    const r = await downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 10 })
    expect(r.ok).toBe(true)
    expect(r.path).toBe('/cached/file.jpg')
  })

  it('файл скачивается асинхронно — резолвится через file:update event', async () => {
    const { mgr, mockClient } = makeManager()
    // invoke возвращает partial файл
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'file', id: 20,
      local: { is_downloading_completed: false, downloaded_size: 0 },
    })
    const downloadPromise = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 20 })
    // Имитируем последовательные updateFile events
    setTimeout(() => {
      mockClient.emit('update', {
        '@type': 'updateFile',
        file: { id: 20, local: { is_downloading_completed: false, downloaded_size: 50000 } },
      })
      mockClient.emit('update', {
        '@type': 'updateFile',
        file: { id: 20, local: { is_downloading_completed: true, downloaded_size: 100000, path: '/disk/file.jpg' } },
      })
    }, 10)
    const r = await downloadPromise
    expect(r.ok).toBe(true)
    expect(r.path).toBe('/disk/file.jpg')
  })

  it('onProgress вызывается на промежуточных updateFile', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'file', id: 30, local: { is_downloading_completed: false } })
    const onProgress = vi.fn()
    const downloadPromise = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 30, onProgress })
    setTimeout(() => {
      mockClient.emit('update', { '@type': 'updateFile', file: { id: 30, local: { downloaded_size: 50, is_downloading_completed: false } } })
      mockClient.emit('update', { '@type': 'updateFile', file: { id: 30, local: { downloaded_size: 100, is_downloading_completed: true, path: '/x' } } })
    }, 5)
    await downloadPromise
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('updateFile для другого fileId игнорируется', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'file', id: 40, local: { is_downloading_completed: false } })
    const downloadPromise = downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 40 })
    setTimeout(() => {
      mockClient.emit('update', { '@type': 'updateFile', file: { id: 41, local: { is_downloading_completed: true, path: '/wrong.jpg' } } })
      mockClient.emit('update', { '@type': 'updateFile', file: { id: 40, local: { is_downloading_completed: true, path: '/correct.jpg' } } })
    }, 5)
    const r = await downloadPromise
    expect(r.path).toBe('/correct.jpg')
  })

  it('updateFile для другого accountId игнорируется', async () => {
    const { mgr, mockClient } = makeManager()
    // Создаём ещё один аккаунт
    const mockB = makeMockClient()
    let count = 0
    const mgr2 = new TdlibClientManager({
      clientFactory: () => { count++; return count === 1 ? makeMockClient() : mockB },
    })
    mgr2.createAccount('tg_x', {})
    mgr2.createAccount('tg_y', {})
    const xClient = mgr2.getClient('tg_x')
    xClient.invoke.mockResolvedValueOnce({ '@type': 'file', id: 50, local: { is_downloading_completed: false } })
    const downloadPromise = downloadFile({ manager: mgr2, accountId: 'tg_x', fileId: 50 })
    setTimeout(() => {
      // file:update от tg_y → должен быть проигнорирован
      mockB.emit('update', { '@type': 'updateFile', file: { id: 50, local: { is_downloading_completed: true, path: '/wrong_account.jpg' } } })
      // file:update от tg_x → должен резолвить
      xClient.emit('update', { '@type': 'updateFile', file: { id: 50, local: { is_downloading_completed: true, path: '/correct_account.jpg' } } })
    }, 5)
    const r = await downloadPromise
    expect(r.path).toBe('/correct_account.jpg')
    // глушим warning про unused
    void mgr; void mockClient
  })

  it('invoke падает → ok: false', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockRejectedValueOnce(new Error('FILE_REFERENCE_INVALID'))
    const r = await downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 60 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('FILE_REFERENCE_INVALID')
  })

  it('manager отсутствует → ok: false', async () => {
    const r = await downloadFile({ accountId: 'tg_a', fileId: 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('manager required')
  })

  it('accountId отсутствует → ok: false', async () => {
    const { mgr } = makeManager()
    const r = await downloadFile({ manager: mgr, fileId: 1 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('accountId required')
  })

  it('fileId отсутствует → ok: false', async () => {
    const { mgr } = makeManager()
    const r = await downloadFile({ manager: mgr, accountId: 'tg_a' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('fileId required')
  })

  it('priority clamped в диапазон 1-32', async () => {
    const { mgr, mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'file', id: 70,
      local: { is_downloading_completed: true, path: '/ok' },
    })
    await downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 70, priority: 999 })
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'downloadFile', priority: 32,
    }))
  })

  it('listener снимается после завершения (нет утечки)', async () => {
    const { mgr, mockClient } = makeManager()
    const before = mgr.listenerCount('file:update')
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'file', id: 80, local: { is_downloading_completed: true, path: '/x' },
    })
    await downloadFile({ manager: mgr, accountId: 'tg_a', fileId: 80 })
    expect(mgr.listenerCount('file:update')).toBe(before)
  })
})

// ──────────────────────────────────────────────────────────────────────
// cancelDownload
// ──────────────────────────────────────────────────────────────────────

describe('cancelDownload', () => {
  it('вызывает cancelDownloadFile', async () => {
    const { mgr, mockClient } = makeManager()
    const r = await cancelDownload({ manager: mgr, accountId: 'tg_a', fileId: 100 })
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'cancelDownloadFile', file_id: 100, only_if_pending: false,
    }))
  })

  it('manager отсутствует → ok: false', async () => {
    const r = await cancelDownload({ accountId: 'tg_a', fileId: 1 })
    expect(r.ok).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────
// storage
// ──────────────────────────────────────────────────────────────────────

describe('getStorageStatistics / optimizeStorage', () => {
  it('getStorageStatistics возвращает байты', async () => {
    const { mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({
      '@type': 'storageStatisticsFast',
      files_size: 1234567, file_count: 50, database_size: 100000,
    })
    const r = await getStorageStatistics(mockClient)
    expect(r).toEqual({ ok: true, bytes: 1234567, fileCount: 50, databaseSize: 100000 })
  })

  it('optimizeStorage возвращает freedBytes', async () => {
    const { mockClient } = makeManager()
    mockClient.invoke.mockResolvedValueOnce({ size: 555555 })
    const r = await optimizeStorage(mockClient)
    expect(r).toEqual({ ok: true, freedBytes: 555555 })
  })

  it('getStorageStatistics — invoke падает', async () => {
    const { mockClient } = makeManager()
    mockClient.invoke.mockRejectedValueOnce(new Error('FAIL'))
    const r = await getStorageStatistics(mockClient)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('FAIL')
  })
})
