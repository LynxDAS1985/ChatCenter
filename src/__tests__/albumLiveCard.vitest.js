// v1.2.66→v1.2.74: тесты карточки альбома в уведомлении.
// @vitest-environment jsdom
//
// Покрывают чистую логику notification-helpers.js:
//   - renderAlbumGrid: листание страницами по 4, фикс-высота, ровная неполная страница;
//   - addAlbumTileToHost: накопление ВСЕХ частей альбома (для листания);
//   - applyAlbumSharp: замена мутной плитки на чёткое превью (A1);
//   - подпись из поздней части (Совет 5).
import { describe, it, expect, vi, beforeAll } from 'vitest'

beforeAll(async () => {
  window.notifApi = { openPhoto: vi.fn(), openVideo: vi.fn() }
  await import('../../main/notification-helpers.js')
})

function makeAlbum(n, extra) {
  const thumbs = [], ids = []
  for (let i = 1; i <= n; i++) { thumbs.push('data:thumb' + i); ids.push(String(i)) }
  return Object.assign({ id: 'g1', chatId: 'tg_1:-100', thumbs: thumbs, messageIds: ids, count: n, page: 0, sharpThumbs: {} }, extra || {})
}

// host с уже отрисованным .album-container (как в реальной карточке)
function makeHost(album, dismissMs) {
  const H = window.__ccNotifHelpers
  const el = document.createElement('div')
  el.dataset.id = 'h1'
  const bt = document.createElement('div'); bt.className = 'body-text'
  const span = document.createElement('span'); span.className = 'msg-text-content'; span.textContent = '🖼 Фото'
  bt.appendChild(span); el.appendChild(bt)
  el.appendChild(H.renderAlbumGrid(album))
  return { el, album: album, dismissMs: dismissMs || 0, timer: null }
}

describe('renderAlbumGrid — листание страницами по 4', () => {
  it('4 фото → одна страница, стрелки скрыты, 4 плитки', () => {
    const H = window.__ccNotifHelpers
    const c = H.renderAlbumGrid(makeAlbum(4))
    expect(c.querySelectorAll('.album-tile').length).toBe(4)
    expect(c.querySelector('.album-count').textContent).toBe('1–4 / 4')
    expect(c.querySelectorAll('.album-dots .d').length).toBe(0) // одна страница — точек нет
  })

  it('6 фото → 2 страницы; стрелка вперёд показывает 2 фото и счётчик 5–6 / 6', () => {
    const H = window.__ccNotifHelpers
    const album = makeAlbum(6)
    const c = H.renderAlbumGrid(album)
    expect(c.querySelectorAll('.album-tile').length).toBe(4) // стр.1 = 4
    expect(c.querySelectorAll('.album-dots .d').length).toBe(2)
    c.querySelector('.album-arrow.r').click() // листаем вперёд
    expect(c.querySelectorAll('.album-tile').length).toBe(2) // стр.2 = 2
    expect(c.querySelector('.album-count').textContent).toBe('5–6 / 6')
  })

  it('неполная страница из 2 фото → один ряд (grid-template-rows: 1fr)', () => {
    const H = window.__ccNotifHelpers
    const album = makeAlbum(6); album.page = 1
    const c = H.renderAlbumGrid(album)
    expect(c.querySelector('.album-grid').style.gridTemplateRows).toBe('1fr')
  })

  it('страница из 3 фото → нижняя плитка широкая (без «дырки»)', () => {
    const H = window.__ccNotifHelpers
    const album = makeAlbum(7); album.page = 1 // стр.2 = фото 5,6,7 → 3 плитки
    const c = H.renderAlbumGrid(album)
    const tiles = c.querySelectorAll('.album-tile')
    expect(tiles.length).toBe(3)
    expect(tiles[2].classList.contains('wide')).toBe(true) // 3-я широкая
  })

  it('клик по плитке открывает смотрелку с глобальным индексом', () => {
    const H = window.__ccNotifHelpers
    window.notifApi.openPhoto.mockClear()
    const album = makeAlbum(6); album.page = 1
    const c = H.renderAlbumGrid(album)
    c.querySelectorAll('.album-tile')[0].click() // первое на стр.2 = глобальный индекс 4
    expect(window.notifApi.openPhoto).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'tg_1:-100', index: 4 }))
  })

  it('плитка без чёткого превью — мутная с крутилкой (blur+loading)', () => {
    const H = window.__ccNotifHelpers
    const c = H.renderAlbumGrid(makeAlbum(4))
    const t = c.querySelector('.album-tile')
    expect(t.classList.contains('blur')).toBe(true)
    expect(t.classList.contains('loading')).toBe(true)
  })
})

describe('renderAlbumGrid — одиночное фото (вариант «размытый фон», v1.2.99)', () => {
  it('single_ id → плитка .single с двумя слоями (размытый фон + фото целиком), без общего блюра', () => {
    const H = window.__ccNotifHelpers
    const c = H.renderAlbumGrid({ id: 'single_42', chatId: 'tg_1:9', thumbs: ['data:x'], messageIds: ['42'], count: 1, page: 0, sharpThumbs: {} })
    const tile = c.querySelector('.album-tile')
    expect(tile.classList.contains('single')).toBe(true)
    expect(tile.querySelector('.sp-blur')).toBeTruthy()
    expect(tile.querySelector('.sp-main')).toBeTruthy()
    expect(tile.classList.contains('blur')).toBe(false) // общий блюр тайла не ставится
    expect(tile.classList.contains('loading')).toBe(true) // крутилка до чёткого превью
  })
  it('applyAlbumSharp для одиночного фото обновляет ОБА слоя', () => {
    const H = window.__ccNotifHelpers
    const album = { id: 'single_7', chatId: 'tg_1:3', thumbs: ['data:t'], messageIds: ['7'], count: 1, page: 0, sharpThumbs: {} }
    const host = makeHost(album)
    H.applyAlbumSharp(host, '7', 'cc-media://sharp7')
    const tile = host.el.querySelector('.album-tile[data-mid="7"]')
    expect(tile.querySelector('.sp-main').style.backgroundImage).toContain('cc-media://sharp7')
    expect(tile.querySelector('.sp-blur').style.backgroundImage).toContain('cc-media://sharp7')
  })
  it('видео (isVideo) → плитка с ▶, клик открывает видео-плеер openVideo (v1.2.101)', () => {
    const H = window.__ccNotifHelpers
    window.notifApi.openVideo.mockClear()
    const c = H.renderAlbumGrid({ id: 'single_55', chatId: 'tg_1:2', thumbs: ['data:v'], messageIds: ['55'], count: 1, page: 0, sharpThumbs: {}, isVideo: true })
    const tile = c.querySelector('.album-tile')
    expect(tile.querySelector('.tile-play')).toBeTruthy()
    expect(tile.classList.contains('is-video')).toBe(true) // v1.2.102: курсор-палец, не лупа
    tile.click()
    expect(window.notifApi.openVideo).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'tg_1:2', messageId: '55' }))
  })
  it('крутилка снимается по таймауту, если чёткое превью не пришло (v1.2.100)', () => {
    vi.useFakeTimers()
    const H = window.__ccNotifHelpers
    const c = H.renderAlbumGrid({ id: 'single_99', chatId: 'tg_1:1', thumbs: ['data:x'], messageIds: ['99'], count: 1, page: 0, sharpThumbs: {} })
    const tile = c.querySelector('.album-tile')
    expect(tile.classList.contains('loading')).toBe(true)
    vi.advanceTimersByTime(8000)
    expect(tile.classList.contains('loading')).toBe(false)
    vi.useRealTimers()
  })
})

describe('addAlbumTileToHost — накопление частей альбома', () => {
  it('добавляет части: messageIds/thumbs накапливаются ВСЕ, count растёт', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost(makeAlbum(1))
    for (let i = 2; i <= 6; i++) {
      H.addAlbumTileToHost(host, { album: { tileThumb: 'data:t' + i, tileMessageId: String(i) } }, () => {}, null)
    }
    expect(host.album.messageIds.length).toBe(6)
    expect(host.album.thumbs.length).toBe(6)
    expect(host.album.count).toBe(6)
    // контейнер перерисован — на стр.1 снова 4 плитки, появились точки (2 страницы)
    expect(host.el.querySelectorAll('.album-tile').length).toBe(4)
    expect(host.el.querySelectorAll('.album-dots .d').length).toBe(2)
  })
})

describe('applyAlbumSharp — чёткое превью (A1)', () => {
  it('сохраняет чёткое превью и заменяет мутную плитку', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost(makeAlbum(4))
    H.applyAlbumSharp(host, '1', 'cc-media://sharp1')
    expect(host.album.sharpThumbs['1']).toBe('cc-media://sharp1')
    const tile = host.el.querySelector('.album-tile[data-mid="1"]')
    expect(tile.style.backgroundImage).toContain('cc-media://sharp1')
    expect(tile.classList.contains('blur')).toBe(false)
    expect(tile.classList.contains('loading')).toBe(false)
  })

  it('чёткое превью для плитки с другой страницы сохраняется и применяется при листании', () => {
    const H = window.__ccNotifHelpers
    const album = makeAlbum(6)
    const host = makeHost(album)
    H.applyAlbumSharp(host, '5', 'cc-media://sharp5') // фото 5 — на стр.2
    expect(album.sharpThumbs['5']).toBe('cc-media://sharp5')
    // перелистываем на стр.2 — плитка уже чёткая
    host.el.querySelector('.album-arrow.r').click()
    const tile = host.el.querySelector('.album-tile[data-mid="5"]')
    expect(tile.classList.contains('blur')).toBe(false)
  })
})

describe('подпись из поздней части (Совет 5)', () => {
  it('подпись подставляется, если её ещё не было; повторно не перетирается', () => {
    const H = window.__ccNotifHelpers
    const album = makeAlbum(1); album.hasCaption = false
    const host = makeHost(album)
    H.addAlbumTileToHost(host, { album: { tileMessageId: '2', tileText: 'Подпись поста' } }, () => {}, null)
    expect(host.el.querySelector('.msg-text-content').textContent).toBe('Подпись поста')
    expect(host.album.hasCaption).toBe(true)
    H.addAlbumTileToHost(host, { album: { tileMessageId: '3', tileText: 'Другая' } }, () => {}, null)
    expect(host.el.querySelector('.msg-text-content').textContent).toBe('Подпись поста')
  })
})
