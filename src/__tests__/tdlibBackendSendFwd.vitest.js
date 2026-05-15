// v0.89.0 — Stage 4 / Этап 3.13: тесты sendFile + forwardMessage через TDLib.
//
// Вынесено из tdlibBackend.vitest.js (тот достиг лимита 400 строк).
// Покрывает реализацию inputMessagePhoto/Video/Document + forwardMessages.

import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { TdlibClientManager } from '../../main/native/backends/tdlibClient.js'
import { createTdlibBackend } from '../../main/native/backends/tdlibBackend.js'
import { buildTdlibParameters } from '../../main/native/backends/tdlibAuth.js'

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
    tdlibParameters: buildTdlibParameters({ apiId: 1, apiHash: 'h', databaseDirectory: '/tmp' }),
    makeClientParams: () => ({ apiId: 1, apiHash: 'h' }),
  })
  return { mgr, mockClient, backend }
}

describe('sendFile — определение типа по расширению', () => {
  it('photo (.jpg) → inputMessagePhoto с caption', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 100 })
    const r = await backend.messages.sendFile('tg_main:-1001', '/tmp/photo.jpg', 'Подпись')
    expect(r.ok).toBe(true)
    expect(r.messageId).toBe('100')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'sendMessage',
      chat_id: -1001,
      input_message_content: expect.objectContaining({
        '@type': 'inputMessagePhoto',
        photo: expect.objectContaining({ '@type': 'inputFileLocal', path: '/tmp/photo.jpg' }),
        caption: expect.objectContaining({ text: 'Подпись' }),
      }),
    }))
  })

  it('video (.mp4) → inputMessageVideo', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/movie.mp4')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({ '@type': 'inputMessageVideo' }),
    }))
  })

  it('audio (.mp3) → inputMessageAudio', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/song.mp3')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({ '@type': 'inputMessageAudio' }),
    }))
  })

  it('document (.pdf) → inputMessageDocument', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/report.pdf')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({ '@type': 'inputMessageDocument' }),
    }))
  })

  it('webp → inputMessagePhoto', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/sticker.webp')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({ '@type': 'inputMessagePhoto' }),
    }))
  })

  // v0.89.2: GIF теперь идёт как Animation (раньше — Photo, терялась анимация).
  it('gif → inputMessageAnimation (а не Photo) с required полями', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 200 })
    await backend.messages.sendFile('tg_main:-1', '/x/funny.gif', 'caption')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({
        '@type': 'inputMessageAnimation',
        animation: expect.objectContaining({ '@type': 'inputFileLocal', path: '/x/funny.gif' }),
        duration: 0, width: 0, height: 0,
        added_sticker_file_ids: [],
        show_caption_above_media: false,
        has_spoiler: false,
        caption: expect.objectContaining({ text: 'caption' }),
      }),
    }))
  })

  // v0.89.2: HEIC TDLib не поддерживает как Photo — идёт как Document.
  it('heic → inputMessageDocument (TDLib не поддерживает HEIC photo)', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/photo.heic')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({
        '@type': 'inputMessageDocument',
        document: expect.objectContaining({ path: '/x/photo.heic' }),
      }),
    }))
  })

  // v0.89.2: Photo/Video/Audio должны передавать ВСЕ required-поля (по TDLib спеке).
  it('photo передаёт width=0,height=0,added_sticker_file_ids=[],show_caption_above_media=false,has_spoiler=false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/photo.jpg')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({
        '@type': 'inputMessagePhoto',
        added_sticker_file_ids: [],
        width: 0, height: 0,
        show_caption_above_media: false,
        has_spoiler: false,
      }),
    }))
  })

  it('video передаёт supports_streaming=true + required-поля', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/clip.mp4')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({
        '@type': 'inputMessageVideo',
        supports_streaming: true,
        duration: 0, width: 0, height: 0,
        added_sticker_file_ids: [],
      }),
    }))
  })

  it('audio передаёт title="" + performer="" + duration=0', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/track.mp3')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({
        '@type': 'inputMessageAudio',
        duration: 0,
        title: '',
        performer: '',
      }),
    }))
  })

  it('ogg → inputMessageAudio (как и mp3)', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({ '@type': 'message', id: 1 })
    await backend.messages.sendFile('tg_main:-1', '/x/sound.ogg')
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      input_message_content: expect.objectContaining({ '@type': 'inputMessageAudio' }),
    }))
  })

  it('invalid chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.sendFile('no-colon', '/x.jpg')
    expect(r.ok).toBe(false)
  })

  it('пустой filePath → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.sendFile('tg_main:-1', '')
    expect(r.ok).toBe(false)
  })

  it('invoke падает → ok: false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce(new Error('FILE_TOO_LARGE'))
    const r = await backend.messages.sendFile('tg_main:-1', '/x.jpg')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('FILE_TOO_LARGE')
  })

  it('TDLib error объект → ok: false с message', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce({ '@type': 'error', code: 400, message: 'CHAT_INVALID' })
    const r = await backend.messages.sendFile('tg_main:-1', '/x.jpg')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('CHAT_INVALID')
  })
})

describe('forwardMessage — TDLib forwardMessages', () => {
  it('одиночное forwarding внутри аккаунта', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockResolvedValueOnce({})
    const r = await backend.messages.forwardMessage('tg_main:-1', 'tg_main:-2', 100)
    expect(r.ok).toBe(true)
    expect(mockClient.invoke).toHaveBeenCalledWith(expect.objectContaining({
      '@type': 'forwardMessages',
      chat_id: -2,
      from_chat_id: -1,
      message_ids: [100],
    }))
  })

  it('cross-account forward → ok: false', async () => {
    const { backend, mgr } = makeBackend()
    mgr.createAccount('tg_other', { apiId: 1, apiHash: 'h' })
    const r = await backend.messages.forwardMessage('tg_main:-1', 'tg_other:-2', 100)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('cross-account')
  })

  it('invalid source chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.forwardMessage('no-colon', 'tg_main:-2', 100)
    expect(r.ok).toBe(false)
  })

  it('invalid target chatId → ok: false', async () => {
    const { backend } = makeBackend()
    const r = await backend.messages.forwardMessage('tg_main:-1', 'no-colon', 100)
    expect(r.ok).toBe(false)
  })

  it('invoke падает → ok: false', async () => {
    const { backend, mockClient } = makeBackend()
    mockClient.invoke.mockRejectedValueOnce(new Error('MESSAGE_NOT_FOUND'))
    const r = await backend.messages.forwardMessage('tg_main:-1', 'tg_main:-2', 100)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('MESSAGE_NOT_FOUND')
  })
})
