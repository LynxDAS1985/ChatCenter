// v1.2.66: тесты «живой карточки» альбома (update-on-arrival, без таймера).
// @vitest-environment jsdom
//
// Проверяем чистую логику дорисовки плитки в notification-helpers.js:
// addAlbumTileToHost накапливает messageIds/thumbs/count и перерисовывает сетку.
// Механизм заменил прежний таймер-буфер (albumNotifyBuffer) — угадывание времени
// убрано, карточка отражает реально пришедшие части. См. TDLib issue #2523.
import { describe, it, expect, vi, beforeAll } from 'vitest'

// notification-helpers.js — не ES-модуль (global script), при импорте вешает
// функции в window.__ccNotifHelpers. Импортируем ради сайд-эффекта.
beforeAll(async () => {
  await import('../../main/notification-helpers.js')
})

function makeHost(hasCaption = false, bodyText = '🖼 Фото') {
  const el = document.createElement('div')
  el.dataset.id = 'h1'
  const grid = document.createElement('div')
  grid.className = 'album-grid'
  el.appendChild(grid)
  // body-text со span (как рисует notification.js при showMessageTime)
  const bt = document.createElement('div')
  bt.className = 'body-text'
  const span = document.createElement('span')
  span.className = 'msg-text-content'
  span.textContent = bodyText
  bt.appendChild(span)
  el.appendChild(bt)
  return {
    el,
    album: { id: 'g1', chatId: 'c1', thumbs: ['data:t0'], messageIds: ['1'], count: 1, hasCaption },
    dismissMs: 0,
    timer: null,
  }
}

describe('addAlbumTileToHost — живая карточка альбома', () => {
  it('добавляет плитку: count++, messageIds и thumbs накапливаются', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost()
    const ok = H.addAlbumTileToHost(host, { album: { tileThumb: 'data:t1', tileMessageId: '2' } }, () => {}, null)
    expect(ok).toBe(true)
    expect(host.album.count).toBe(2)
    expect(host.album.messageIds).toEqual(['1', '2'])
    expect(host.album.thumbs).toEqual(['data:t0', 'data:t1'])
  })

  it('не больше 4 миниатюр в сетке, но messageIds — ВСЕ (для смотрелки)', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost()
    for (let i = 2; i <= 6; i++) {
      H.addAlbumTileToHost(host, { album: { tileThumb: 'data:t' + i, tileMessageId: '' + i } }, () => {}, null)
    }
    expect(host.album.thumbs.length).toBe(4)
    expect(host.album.messageIds.length).toBe(6)
    expect(host.album.count).toBe(6)
  })

  it('сетка перерисовывается (в гриде появляются плитки)', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost()
    H.addAlbumTileToHost(host, { album: { tileThumb: 'data:t1', tileMessageId: '2' } }, () => {}, null)
    const grid = host.el.querySelector('.album-grid')
    expect(grid).toBeTruthy()
    expect(grid.querySelectorAll('.album-tile').length).toBe(2)
  })

  it('перерисовка показывает максимум 4 плитки + бейдж «+N»', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost()
    for (let i = 2; i <= 7; i++) {
      H.addAlbumTileToHost(host, { album: { tileThumb: 'data:t' + i, tileMessageId: '' + i } }, () => {}, null)
    }
    const grid = host.el.querySelector('.album-grid')
    expect(grid.querySelectorAll('.album-tile').length).toBe(4)
    const more = grid.querySelector('.album-more')
    expect(more).toBeTruthy()
    expect(more.textContent).toBe('+3') // всего 7, показано 4 → +3
  })

  it('extendHostLife вызывается через переданный dismissItem-колбэк', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost()
    host.dismissMs = 5000 // чтобы extendHostLife реально перезапустил таймер
    const dismissItem = vi.fn()
    H.addAlbumTileToHost(host, { album: { tileThumb: 'data:t1', tileMessageId: '2' } }, dismissItem, null)
    // таймер выставлен (не null) — жизнь продлена
    expect(host.timer).not.toBeNull()
  })

  it('нет host.album — no-op, возвращает false', () => {
    const H = window.__ccNotifHelpers
    const el = document.createElement('div')
    const ok = H.addAlbumTileToHost({ el, dismissMs: 0 }, { album: { tileMessageId: '2' } }, () => {}, null)
    expect(ok).toBe(false)
  })

  // v1.2.66 (Совет 5): подпись из поздней части альбома
  it('подпись из поздней части подставляется в body, если её ещё не было', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost(false, '🖼 Фото') // подписи нет
    H.addAlbumTileToHost(host, { album: { tileMessageId: '2', tileText: 'Подпись поста' } }, () => {}, null)
    expect(host.el.querySelector('.msg-text-content').textContent).toBe('Подпись поста')
    expect(host.album.hasCaption).toBe(true)
  })

  it('если подпись уже есть — поздняя часть её НЕ перезаписывает', () => {
    const H = window.__ccNotifHelpers
    const host = makeHost(true, 'Первая подпись') // подпись уже показана
    H.addAlbumTileToHost(host, { album: { tileMessageId: '2', tileText: 'Вторая подпись' } }, () => {}, null)
    expect(host.el.querySelector('.msg-text-content').textContent).toBe('Первая подпись')
  })
})
