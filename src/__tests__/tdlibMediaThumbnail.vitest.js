// v0.89.16: тесты extractThumbnailFileId — извлекает file_id ПРЕВЬЮ
// (thumbnail.file) для медиа-сообщений. Используется для постера видео в
// VideoTile.jsx + MediaAlbum.jsx через backend.media.downloadThumbnail.
//
// До v0.89.16 постеры ошибочно качались через extractMediaFileId, который
// возвращает file_id САМОГО видео (десятки МБ). См. ловушка #10 в
// .memory-bank/mistakes/tdlib-video-player.md.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { extractThumbnailFileId } from '../../main/native/backends/tdlibMedia.js'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'

describe('extractThumbnailFileId (v0.89.16)', () => {
  it('messageVideo → video.thumbnail.file.id', () => {
    const content = {
      '@type': 'messageVideo',
      video: {
        video: { id: 999, size: 45000000 },
        thumbnail: { format: { '@type': 'thumbnailFormatJpeg' }, width: 320, height: 240, file: { id: 42 } },
        minithumbnail: { data: 'BASE64==' },
      },
    }
    expect(extractThumbnailFileId(content)).toBe(42)
  })

  it('messageAnimation → animation.thumbnail.file.id', () => {
    const content = {
      '@type': 'messageAnimation',
      animation: { animation: { id: 100 }, thumbnail: { file: { id: 7 } } },
    }
    expect(extractThumbnailFileId(content)).toBe(7)
  })

  it('messageDocument → document.thumbnail.file.id', () => {
    const content = {
      '@type': 'messageDocument',
      document: { document: { id: 200 }, thumbnail: { file: { id: 13 } } },
    }
    expect(extractThumbnailFileId(content)).toBe(13)
  })

  it('messageVideoNote → video_note.thumbnail.file.id', () => {
    const content = {
      '@type': 'messageVideoNote',
      video_note: { video: { id: 300 }, thumbnail: { file: { id: 21 } } },
    }
    expect(extractThumbnailFileId(content)).toBe(21)
  })

  it('messageAudio → audio.album_cover_thumbnail.file.id', () => {
    const content = {
      '@type': 'messageAudio',
      audio: { audio: { id: 400 }, album_cover_thumbnail: { file: { id: 33 } } },
    }
    expect(extractThumbnailFileId(content)).toBe(33)
  })

  it('messagePhoto → file_id наименьшего размера (для превью)', () => {
    const content = {
      '@type': 'messagePhoto',
      photo: {
        sizes: [
          { type: 'm', width: 800, height: 600, photo: { id: 2 } },
          { type: 's', width: 100, height: 75, photo: { id: 1 } },
          { type: 'x', width: 1280, height: 960, photo: { id: 3 } },
        ],
      },
    }
    expect(extractThumbnailFileId(content)).toBe(1) // меньший size (100x75)
  })

  it('messageVideo БЕЗ thumbnail → null (старое сообщение, нет превью)', () => {
    const content = { '@type': 'messageVideo', video: { video: { id: 999 } } }
    expect(extractThumbnailFileId(content)).toBe(null)
  })

  it('messageVideo с thumbnail без file.id → null', () => {
    const content = {
      '@type': 'messageVideo',
      video: { video: { id: 999 }, thumbnail: { width: 320, height: 240 } },
    }
    expect(extractThumbnailFileId(content)).toBe(null)
  })

  it('messageText → null (текст не имеет превью)', () => {
    expect(extractThumbnailFileId({ '@type': 'messageText' })).toBe(null)
  })

  it('messageVoiceNote → null (голосовое не имеет визуального превью)', () => {
    expect(extractThumbnailFileId({
      '@type': 'messageVoiceNote',
      voice_note: { voice: { id: 5 } },
    })).toBe(null)
  })

  it('messageSticker → null (стикеры не качают через этот канал)', () => {
    expect(extractThumbnailFileId({
      '@type': 'messageSticker',
      sticker: { sticker: { id: 1 }, thumbnail: { file: { id: 99 } } },
    })).toBe(null)
  })

  it('messagePhoto без sizes → null', () => {
    expect(extractThumbnailFileId({ '@type': 'messagePhoto', photo: {} })).toBe(null)
    expect(extractThumbnailFileId({ '@type': 'messagePhoto', photo: { sizes: [] } })).toBe(null)
  })

  it('null/undefined content → null', () => {
    expect(extractThumbnailFileId(null)).toBe(null)
    expect(extractThumbnailFileId(undefined)).toBe(null)
    expect(extractThumbnailFileId({})).toBe(null)
  })

  it('возвращает 0 как валидный id (TDLib может присвоить 0)', () => {
    // TDLib id всегда >= 1 на практике, но extractor не должен фильтровать 0
    // через `||` — иначе file_id=0 будет конвертирован в null. Используем `??`.
    const content = {
      '@type': 'messageVideo',
      video: { video: { id: 1 }, thumbnail: { file: { id: 0 } } },
    }
    expect(extractThumbnailFileId(content)).toBe(0)
  })
})

describe('backend.media.downloadThumbnail (v0.89.16)', () => {
  function makeMockClient() {
    const client = new EventEmitter()
    client.invoke = vi.fn(() => Promise.resolve({ '@type': 'ok' }))
    client.close = vi.fn(() => Promise.resolve())
    return client
  }
  function makeBackend() {
    const mockClient = makeMockClient()
    const manager = new TdlibClientManager({ clientFactory: () => mockClient })
    manager.createAccount('tg_a', {})
    const backend = createTdlibBackend({
      manager, tdlibParameters: {},
      userDataDir: 'C:\\nonexistent\\path', // stabilizeForPlayback вернёт null,
                                            // backend упадёт на tdlibPathToCcMediaUrl fallback
    })
    return { backend, mockClient }
  }

  it('качает thumbnail.file.id, НЕ video.video.id', async () => {
    const { backend, mockClient } = makeBackend()
    // getMessage возвращает video с thumbnail
    mockClient.invoke.mockImplementationOnce(() => Promise.resolve({
      '@type': 'message', id: 5,
      content: {
        '@type': 'messageVideo',
        video: {
          video: { id: 999 },
          thumbnail: { file: { id: 77 } },
        },
      },
    }))
    // downloadFile → invoke downloadFile resolves with completed file
    mockClient.invoke.mockImplementationOnce((req) => {
      expect(req['@type']).toBe('downloadFile')
      expect(req.file_id).toBe(77) // ← thumbnail, не 999
      return Promise.resolve({
        '@type': 'file', id: 77,
        local: { is_downloading_completed: true, path: '/tmp/thumb.jpg' },
      })
    })
    const r = await backend.media.downloadThumbnail({ chatId: 'tg_a:1', msgId: 5 })
    expect(r.ok).toBe(true)
  })

  it('у сообщения нет thumbnail → ok:false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockImplementationOnce(() => Promise.resolve({
      '@type': 'message', id: 5,
      content: { '@type': 'messageVideo', video: { video: { id: 999 } } }, // без thumbnail
    }))
    const r = await backend.media.downloadThumbnail({ chatId: 'tg_a:1', msgId: 5 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no thumbnail')
  })

  it('getMessage падает → ok:false с error', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce(new Error('MESSAGE_ID_INVALID'))
    const r = await backend.media.downloadThumbnail({ chatId: 'tg_a:1', msgId: 999 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('MESSAGE_ID_INVALID')
  })

  it('priority = 8 (ниже video=24, выше default=1)', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockImplementationOnce(() => Promise.resolve({
      '@type': 'message', id: 5,
      content: { '@type': 'messageVideo', video: { thumbnail: { file: { id: 88 } } } },
    }))
    mockClient.invoke.mockImplementationOnce((req) => {
      expect(req.priority).toBe(8)
      return Promise.resolve({ '@type': 'file', id: 88, local: { is_downloading_completed: true, path: '/x' } })
    })
    await backend.media.downloadThumbnail({ chatId: 'tg_a:1', msgId: 5 })
  })
})
