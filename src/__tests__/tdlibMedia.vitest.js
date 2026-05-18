// v0.89.0 — Stage 4 / Этап 2.5: тесты TDLib media.
// v0.89.15 — progressive playback удалён, stabilizeForPlayback → отдельный файл.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import {
  downloadFile, cancelDownload, extractMediaFileId, getCachedFilePath,
  tdlibPathToCcMediaUrl, getStorageStatistics, optimizeStorage,
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

// v0.89.7: tdlibPathToCcMediaUrl — конвертация raw TDLib path в cc-media:// URL.
describe('tdlibPathToCcMediaUrl', () => {
  it('Windows path → cc-media://tdlib/...', () => {
    const p = 'C:\\Users\\X\\AppData\\Roaming\\Center\\tdlib-sessions\\pending\\files\\videos\\W.mp4'
    expect(tdlibPathToCcMediaUrl(p)).toBe('cc-media://tdlib/pending/files/videos/W.mp4')
  })

  it('Linux path → cc-media://tdlib/...', () => {
    const p = '/home/u/.config/Center/tdlib-sessions/tg_196/files/photos/12345.jpg'
    expect(tdlibPathToCcMediaUrl(p)).toBe('cc-media://tdlib/tg_196/files/photos/12345.jpg')
  })

  it('Cyrillic в пути — URL-encoded', () => {
    const p = 'C:\\Users\\Директор\\AppData\\Roaming\\ЦентрЧатов\\tdlib-sessions\\pending\\files\\videos\\W.mp4'
    expect(tdlibPathToCcMediaUrl(p)).toContain('cc-media://tdlib/pending/files/videos/W.mp4')
  })

  it('путь без tdlib-sessions → null', () => {
    expect(tdlibPathToCcMediaUrl('/tmp/random.jpg')).toBe(null)
    expect(tdlibPathToCcMediaUrl('C:\\Other\\X.jpg')).toBe(null)
  })

  it('пустой/null/не-строка → null', () => {
    expect(tdlibPathToCcMediaUrl(null)).toBe(null)
    expect(tdlibPathToCcMediaUrl('')).toBe(null)
    expect(tdlibPathToCcMediaUrl(undefined)).toBe(null)
    expect(tdlibPathToCcMediaUrl({ path: '/x' })).toBe(null)
    expect(tdlibPathToCcMediaUrl(123)).toBe(null)
  })

})

