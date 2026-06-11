// v1.1.9: тесты pure helpers вынесенных из tdlibBackend.js.

import { describe, it, expect } from 'vitest'
import {
  SEARCH_FILTER_MAP,
  mapSearchFilter,
  parseChatId,
} from './tdlibBackendHelpers.js'

describe('SEARCH_FILTER_MAP', () => {
  it('содержит все ожидаемые ключи', () => {
    const keys = ['photo', 'video', 'photo-video', 'document', 'audio', 'voice',
      'video-note', 'url', 'mention', 'pinned', 'unread-mention', 'empty']
    for (const k of keys) {
      expect(SEARCH_FILTER_MAP[k]).toBeTruthy()
    }
  })

  it('все значения начинаются с searchMessagesFilter', () => {
    for (const v of Object.values(SEARCH_FILTER_MAP)) {
      expect(v.startsWith('searchMessagesFilter')).toBe(true)
    }
  })
})

describe('mapSearchFilter', () => {
  it('null/undefined/empty → searchMessagesFilterEmpty', () => {
    expect(mapSearchFilter(null)).toEqual({ '@type': 'searchMessagesFilterEmpty' })
    expect(mapSearchFilter(undefined)).toEqual({ '@type': 'searchMessagesFilterEmpty' })
    expect(mapSearchFilter('')).toEqual({ '@type': 'searchMessagesFilterEmpty' })
    expect(mapSearchFilter('empty')).toEqual({ '@type': 'searchMessagesFilterEmpty' })
  })

  it('photo → searchMessagesFilterPhoto', () => {
    expect(mapSearchFilter('photo')).toEqual({ '@type': 'searchMessagesFilterPhoto' })
  })

  it('unread-mention → searchMessagesFilterUnreadMention', () => {
    expect(mapSearchFilter('unread-mention')).toEqual({ '@type': 'searchMessagesFilterUnreadMention' })
  })

  it('unknown filter → searchMessagesFilterEmpty (fallback)', () => {
    expect(mapSearchFilter('not-a-filter')).toEqual({ '@type': 'searchMessagesFilterEmpty' })
  })
})

describe('parseChatId', () => {
  it('правильный формат accountId:rawId', () => {
    expect(parseChatId('tg_123:456')).toEqual({ accountId: 'tg_123', rawId: 456 })
  })

  it('rawId конвертируется в число', () => {
    expect(parseChatId('a:42').rawId).toBe(42)
    expect(typeof parseChatId('a:42').rawId).toBe('number')
  })

  it('отрицательный rawId (channel) поддерживается', () => {
    expect(parseChatId('tg_x:-100123').rawId).toBe(-100123)
  })

  it('без двоеточия → { accountId: null, rawId: null }', () => {
    expect(parseChatId('foo')).toEqual({ accountId: null, rawId: null })
  })

  it('null/undefined/пусто → { null, null }', () => {
    expect(parseChatId(null)).toEqual({ accountId: null, rawId: null })
    expect(parseChatId(undefined)).toEqual({ accountId: null, rawId: null })
    expect(parseChatId('')).toEqual({ accountId: null, rawId: null })
  })

  it('двоеточие в id чата (формально невозможно но безопасно)', () => {
    // Только первое двоеточие — разделитель
    expect(parseChatId('a:b:c')).toEqual({ accountId: 'a', rawId: NaN })
  })
})
