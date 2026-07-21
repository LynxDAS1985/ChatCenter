// v1.2.95: юнит-тест buildNotifAlbum — какое поле album идёт в уведомление.
import { describe, it, expect } from 'vitest'
import { buildNotifAlbum } from '../../../shared/notifAlbum.js'

describe('buildNotifAlbum', () => {
  it('media-group (groupedId) → album c id = groupedId (поведение как раньше)', () => {
    const a = buildNotifAlbum({ id: 5, groupedId: 777, mediaType: 'photo', strippedThumb: 'data:t', text: 'подпись' }, 'tg_1:2')
    expect(a).toEqual({ id: '777', chatId: 'tg_1:2', tileThumb: 'data:t', tileMessageId: '5', tileText: 'подпись' })
  })

  it('ОДИНОЧНОЕ фото с мини-картинкой → album c id = single_<id> (главный фикс v1.2.95)', () => {
    const a = buildNotifAlbum({ id: 42, mediaType: 'photo', strippedThumb: 'data:xxx', text: '1111' }, 'tg_1:9')
    expect(a).toEqual({ id: 'single_42', chatId: 'tg_1:9', tileThumb: 'data:xxx', tileMessageId: '42', tileText: '1111' })
  })

  it('одиночное видео с мини-картинкой → album', () => {
    const a = buildNotifAlbum({ id: 7, mediaType: 'video', strippedThumb: 'data:v' }, 'tg_1:3')
    expect(a && a.id).toBe('single_7')
  })

  it('одиночное фото БЕЗ мини-картинки → null (нечего показать)', () => {
    expect(buildNotifAlbum({ id: 8, mediaType: 'photo', strippedThumb: null }, 'tg_1:3')).toBe(null)
  })

  it('текстовое сообщение → null', () => {
    expect(buildNotifAlbum({ id: 9, mediaType: 'text', text: 'привет' }, 'tg_1:3')).toBe(null)
  })

  it('ссылка-превью (link) → null (не наш случай, ADR-019)', () => {
    expect(buildNotifAlbum({ id: 10, mediaType: 'link', strippedThumb: 'data:l', webPage: {} }, 'tg_1:3')).toBe(null)
  })

  it('одиночное фото без id → null (нельзя построить single_id)', () => {
    expect(buildNotifAlbum({ id: null, mediaType: 'photo', strippedThumb: 'data:x' }, 'tg_1:3')).toBe(null)
  })

  it('null-сообщение → null (не падает)', () => {
    expect(buildNotifAlbum(null, 'tg_1:3')).toBe(null)
  })
})
