// v0.95.43: тесты для tdlibAlbum.sendMessageAlbum.

import { describe, it, expect, vi } from 'vitest'
import { sendMessageAlbum, _internal } from '../../main/native/backends/tdlibAlbum.js'

function makeClient(returnValue = { messages: [{ id: 1 }, { id: 2 }] }) {
  return {
    invoke: vi.fn(async () => returnValue),
  }
}

describe('tdlibAlbum.buildContent (v0.95.43)', () => {
  const { buildContent } = _internal

  it('jpg → inputMessagePhoto', () => {
    const c = buildContent('/path/to/photo.jpg')
    expect(c['@type']).toBe('inputMessagePhoto')
    expect(c.photo['@type']).toBe('inputFileLocal')
    expect(c.photo.path).toBe('/path/to/photo.jpg')
  })

  it('jpeg/png/webp тоже photo', () => {
    expect(buildContent('a.jpeg')['@type']).toBe('inputMessagePhoto')
    expect(buildContent('a.PNG')['@type']).toBe('inputMessagePhoto')
    expect(buildContent('a.webp')['@type']).toBe('inputMessagePhoto')
  })

  it('mp4/mov/webm → inputMessageVideo', () => {
    expect(buildContent('clip.mp4')['@type']).toBe('inputMessageVideo')
    expect(buildContent('clip.mov')['@type']).toBe('inputMessageVideo')
    expect(buildContent('clip.webm')['@type']).toBe('inputMessageVideo')
  })

  it('mp3/m4a/ogg → inputMessageAudio', () => {
    expect(buildContent('song.mp3')['@type']).toBe('inputMessageAudio')
    expect(buildContent('voice.ogg')['@type']).toBe('inputMessageAudio')
  })

  it('pdf/zip/doc → inputMessageDocument', () => {
    expect(buildContent('file.pdf')['@type']).toBe('inputMessageDocument')
    expect(buildContent('archive.zip')['@type']).toBe('inputMessageDocument')
    expect(buildContent('text.docx')['@type']).toBe('inputMessageDocument')
  })

  it('caption передаётся в formattedText', () => {
    const c = buildContent('photo.jpg', 'My caption')
    expect(c.caption).toEqual({
      '@type': 'formattedText',
      text: 'My caption',
      entities: [],
    })
  })

  it('без caption — поле caption отсутствует', () => {
    const c = buildContent('photo.jpg')
    expect(c.caption).toBeUndefined()
  })

  // v1.2.207 (#1): «Без сжатия» — jpg тоже уходит документом (Telegram не сжимает).
  it('asDocument=true → jpg как inputMessageDocument (без сжатия)', () => {
    const c = buildContent('/path/photo.jpg', null, true)
    expect(c['@type']).toBe('inputMessageDocument')
    expect(c.document.path).toBe('/path/photo.jpg')
  })
  it('asDocument=false → jpg остаётся photo (как раньше)', () => {
    expect(buildContent('photo.jpg', null, false)['@type']).toBe('inputMessagePhoto')
  })
})

describe('tdlibAlbum.sendMessageAlbum (v0.95.43)', () => {
  it('одиночный батч (1-10 файлов) → 1 invoke', async () => {
    const client = makeClient({ messages: [{ id: '101' }, { id: '102' }] })
    const files = [
      { path: '/a.jpg' },
      { path: '/b.jpg' },
    ]
    const r = await sendMessageAlbum(client, -1001, files)
    expect(r.ok).toBe(true)
    expect(r.messageIds).toEqual(['101', '102'])
    expect(client.invoke).toHaveBeenCalledTimes(1)
    const call = client.invoke.mock.calls[0][0]
    expect(call['@type']).toBe('sendMessageAlbum')
    expect(call.chat_id).toBe(-1001)
    expect(call.input_message_contents).toHaveLength(2)
  })

  it('11 файлов → split на 2 батча (10 + 1)', async () => {
    const client = makeClient({ messages: [{ id: '1' }] })
    const files = Array.from({ length: 11 }, (_, i) => ({ path: `/f${i}.jpg` }))
    const r = await sendMessageAlbum(client, -1, files)
    expect(r.ok).toBe(true)
    expect(client.invoke).toHaveBeenCalledTimes(2)
    expect(client.invoke.mock.calls[0][0].input_message_contents).toHaveLength(10)
    expect(client.invoke.mock.calls[1][0].input_message_contents).toHaveLength(1)
  })

  it('21 файл → split на 3 батча (10 + 10 + 1)', async () => {
    const client = makeClient({ messages: [{ id: '1' }] })
    const files = Array.from({ length: 21 }, (_, i) => ({ path: `/f${i}.jpg` }))
    await sendMessageAlbum(client, -1, files)
    expect(client.invoke).toHaveBeenCalledTimes(3)
  })

  it('albumCaption — только на первом элементе первого батча', async () => {
    const client = makeClient({ messages: [{ id: '1' }] })
    const files = [{ path: '/a.jpg' }, { path: '/b.jpg' }, { path: '/c.jpg' }]
    await sendMessageAlbum(client, -1, files, { albumCaption: 'Альбом фото' })
    const contents = client.invoke.mock.calls[0][0].input_message_contents
    expect(contents[0].caption.text).toBe('Альбом фото')
    expect(contents[1].caption).toBeUndefined()
    expect(contents[2].caption).toBeUndefined()
  })

  it('replyTo передаётся в первый батч', async () => {
    const client = makeClient({ messages: [{ id: '1' }] })
    await sendMessageAlbum(client, -1, [{ path: '/a.jpg' }], { replyTo: 555 })
    const req = client.invoke.mock.calls[0][0]
    expect(req.reply_to).toEqual({
      '@type': 'inputMessageReplyToMessage',
      message_id: 555,
    })
  })

  it('replyTo НЕ дублируется во втором батче (только первый)', async () => {
    const client = makeClient({ messages: [{ id: '1' }] })
    const files = Array.from({ length: 11 }, (_, i) => ({ path: `/f${i}.jpg` }))
    await sendMessageAlbum(client, -1, files, { replyTo: 555 })
    expect(client.invoke.mock.calls[0][0].reply_to).toBeDefined()
    expect(client.invoke.mock.calls[1][0].reply_to).toBeUndefined()
  })

  it('opts.asDocument → весь альбом документами (без сжатия)', async () => {
    const client = makeClient({ messages: [{ id: '1' }, { id: '2' }] })
    await sendMessageAlbum(client, -1, [{ path: '/a.jpg' }, { path: '/b.png' }], { asDocument: true })
    const contents = client.invoke.mock.calls[0][0].input_message_contents
    expect(contents.every(c => c['@type'] === 'inputMessageDocument')).toBe(true)
  })

  it('пустой массив → error', async () => {
    const client = makeClient()
    const r = await sendMessageAlbum(client, -1, [])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no files')
  })

  it('client без invoke → error', async () => {
    const r = await sendMessageAlbum({}, -1, [{ path: '/a.jpg' }])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('client not ready')
  })

  it('TDLib error → ok:false с code', async () => {
    const client = {
      invoke: vi.fn(async () => { throw { '@type': 'error', code: 420, message: 'FLOOD_WAIT_30' } }),
    }
    const r = await sendMessageAlbum(client, -1, [{ path: '/a.jpg' }])
    expect(r.ok).toBe(false)
    expect(r.code).toBe(420)
    expect(r.error).toContain('FLOOD_WAIT')
  })

  it('обычное исключение → ok:false', async () => {
    const client = {
      invoke: vi.fn(async () => { throw new Error('network') }),
    }
    const r = await sendMessageAlbum(client, -1, [{ path: '/a.jpg' }])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('network')
  })
})
