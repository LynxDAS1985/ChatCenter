// v0.87.31: render-smoke + snapshot для MediaAlbum / AlbumBubble.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { AlbumBubble } from './MediaAlbum.jsx'

// v0.87.33: мокаем IntersectionObserver чтобы сразу сработал isIntersecting
let observerCallback = null
beforeEach(() => {
  globalThis.window.api = { invoke: vi.fn(), on: vi.fn(), send: vi.fn() }
  observerCallback = null
  globalThis.IntersectionObserver = class {
    constructor(cb) { observerCallback = cb }
    observe(el) {
      // Имитируем intersection через микрозадачу
      setTimeout(() => observerCallback?.([{ isIntersecting: true, target: el }]), 0)
    }
    disconnect() {}
    unobserve() {}
  }
})

function makeAlbum(count, opts = {}) {
  const msgs = Array.from({ length: count }, (_, i) => ({
    id: String(100 + i), chatId: 'c1',
    senderId: 's1', senderName: 'Канал',
    text: i === 0 ? (opts.caption || '') : '',
    timestamp: 1712000000000 + i * 100,
    isOutgoing: opts.isOutgoing || false,
    mediaType: 'photo',
    mediaWidth: 800, mediaHeight: 600,
    strippedThumb: 'data:image/jpeg;base64,AAAA',
    groupedId: 'g1',
  }))
  return {
    type: 'album', id: 'album-g1', groupedId: 'g1',
    msgs,
    senderId: 's1', senderName: 'Канал',
    isOutgoing: opts.isOutgoing || false,
    timestamp: msgs[0].timestamp,
    text: opts.caption || '',
    replyToId: null,
    isRead: true, isEdited: false,
    entities: [],
  }
}

describe('AlbumBubble render', () => {
  it('1 фото в альбоме', () => {
    const album = makeAlbum(1)
    const { container } = render(
      <AlbumBubble album={album} chatId="c1" downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    expect(container).toBeTruthy()
    cleanup()
  })

  it('2 фото — сетка 2x1', () => {
    const album = makeAlbum(2)
    const { container } = render(
      <AlbumBubble album={album} chatId="c1" downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    expect(container).toBeTruthy()
    cleanup()
  })

  it('3 фото — L-форма', () => {
    const album = makeAlbum(3)
    const { container } = render(
      <AlbumBubble album={album} chatId="c1" downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    expect(container).toBeTruthy()
    cleanup()
  })

  it('7 фото — показывает ВСЕ 7 тайлов (v0.87.31: без «+N» ограничения)', () => {
    const album = makeAlbum(7)
    const { container } = render(
      <AlbumBubble album={album} chatId="c1" downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    // Ищем background-image: url("data:...") — каждый тайл имеет stripped thumb
    const bgMatches = container.innerHTML.match(/data:image\/jpeg;base64,AAAA/g) || []
    expect(bgMatches.length).toBe(7)
    cleanup()
  })

  it('альбом с подписью', () => {
    const album = makeAlbum(4, { caption: 'Новый альбом' })
    const { container } = render(
      <AlbumBubble album={album} chatId="c1" downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    expect(container.textContent).toContain('Новый альбом')
    cleanup()
  })

  it('snapshot: альбом 4 фото', () => {
    const album = makeAlbum(4)
    const { container } = render(
      <AlbumBubble album={album} chatId="c1" downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    expect(container.innerHTML).toMatchSnapshot()
    cleanup()
  })

  // v0.87.33: регрессионный тест для счётчика непрочитанных — IntersectionObserver
  // должен вызывать onVisible для КАЖДОГО msg альбома, не только firstMsg
  it('RF 0.87.33: onVisible вызывается для всех 5 msgs альбома (счётчик unread)', async () => {
    const album = makeAlbum(5)
    const onVisible = vi.fn()
    render(
      <AlbumBubble album={album} chatId="c1" onVisible={onVisible}
        downloadMedia={() => Promise.resolve({ ok: false })} />
    )
    await new Promise(r => setTimeout(r, 5))
    expect(onVisible.mock.calls.length).toBe(5)
    const calledIds = onVisible.mock.calls.map(c => c[0].id)
    expect(calledIds).toEqual(album.msgs.map(m => m.id))
    cleanup()
  })

  // v0.87.33: для video используется thumb=true (чтобы не качать полное видео ~100МБ)
  it('RF 0.87.33: video тайл вызывает downloadMedia с thumb=true', async () => {
    const videoAlbum = {
      ...makeAlbum(1),
      msgs: [{
        id: '200', chatId: 'c1', senderId: 's', senderName: 'X',
        text: '', timestamp: 1712000000000, isOutgoing: false,
        mediaType: 'video', mediaWidth: 1280, mediaHeight: 720,
        strippedThumb: 'data:image/jpeg;base64,AAAA', groupedId: 'g2',
      }],
    }
    const downloadMedia = vi.fn(() => Promise.resolve({ ok: false }))
    render(
      <AlbumBubble album={videoAlbum} chatId="c1" downloadMedia={downloadMedia} />
    )
    await new Promise(r => setTimeout(r, 5))
    // Третий аргумент downloadMedia(chatId, msgId, thumb) — должен быть true для video
    expect(downloadMedia.mock.calls[0]?.[2]).toBe(true)
    cleanup()
  })

  // v0.87.33: для photo thumb=false (качаем полное)
  it('RF 0.87.33: photo тайл вызывает downloadMedia с thumb=false', async () => {
    const album = makeAlbum(1)
    const downloadMedia = vi.fn(() => Promise.resolve({ ok: false }))
    render(
      <AlbumBubble album={album} chatId="c1" downloadMedia={downloadMedia} />
    )
    await new Promise(r => setTimeout(r, 5))
    expect(downloadMedia.mock.calls[0]?.[2]).toBe(false)
    cleanup()
  })
})
