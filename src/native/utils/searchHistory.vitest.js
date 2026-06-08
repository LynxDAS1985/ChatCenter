// v0.95.42: тесты для searchHistory util.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadCurrentSearch, saveCurrentSearch,
  loadSearchHistory, addToHistory, removeFromHistory, clearHistory,
  MAX_HISTORY_SIZE,
} from './searchHistory.js'

describe('searchHistory current query (v0.95.42)', () => {
  beforeEach(() => { try { localStorage.clear() } catch (_) {} })

  it('loadCurrentSearch — пусто в storage → ""', () => {
    expect(loadCurrentSearch()).toBe('')
  })

  it('save+load round-trip', () => {
    saveCurrentSearch('страх')
    expect(loadCurrentSearch()).toBe('страх')
  })

  it('сохранение пустой строки → удаление из storage', () => {
    saveCurrentSearch('страх')
    saveCurrentSearch('')
    expect(loadCurrentSearch()).toBe('')
  })

  it('trim whitespace при save', () => {
    saveCurrentSearch('   страх   ')
    expect(loadCurrentSearch()).toBe('страх')
  })

  it('обрезка query > 200 chars', () => {
    const long = 'a'.repeat(300)
    saveCurrentSearch(long)
    expect(loadCurrentSearch()).toHaveLength(200)
  })

  it('save null/undefined → не падает', () => {
    expect(() => saveCurrentSearch(null)).not.toThrow()
    expect(() => saveCurrentSearch(undefined)).not.toThrow()
    expect(loadCurrentSearch()).toBe('')
  })
})

describe('searchHistory list (v0.95.42)', () => {
  beforeEach(() => { try { localStorage.clear() } catch (_) {} })

  it('loadSearchHistory — пусто → []', () => {
    expect(loadSearchHistory()).toEqual([])
  })

  it('addToHistory — добавляет в начало', () => {
    addToHistory('первый')
    addToHistory('второй')
    expect(loadSearchHistory()).toEqual(['второй', 'первый'])
  })

  it('дедуп — повторный query поднимает наверх (не дублирует)', () => {
    addToHistory('А')
    addToHistory('Б')
    addToHistory('В')
    addToHistory('А')  // повтор — должен подняться наверх, дубля не быть
    expect(loadSearchHistory()).toEqual(['А', 'В', 'Б'])
  })

  it('дедуп case-insensitive', () => {
    addToHistory('Страх')
    addToHistory('страх')
    expect(loadSearchHistory()).toEqual(['страх'])
  })

  it('FIFO clamp до 20 элементов', () => {
    for (let i = 0; i < 30; i++) addToHistory('q' + i)
    const h = loadSearchHistory()
    expect(h.length).toBe(MAX_HISTORY_SIZE)
    // Самые свежие — q29...q10
    expect(h[0]).toBe('q29')
    expect(h[h.length - 1]).toBe('q10')
  })

  it('addToHistory("") → не добавляет пустую', () => {
    addToHistory('')
    addToHistory('   ')
    expect(loadSearchHistory()).toEqual([])
  })

  it('removeFromHistory удаляет конкретную запись', () => {
    addToHistory('А')
    addToHistory('Б')
    addToHistory('В')
    removeFromHistory('Б')
    expect(loadSearchHistory()).toEqual(['В', 'А'])
  })

  it('removeFromHistory case-insensitive', () => {
    addToHistory('Страх')
    removeFromHistory('СТРАХ')
    expect(loadSearchHistory()).toEqual([])
  })

  it('clearHistory очищает всё', () => {
    addToHistory('а')
    addToHistory('б')
    clearHistory()
    expect(loadSearchHistory()).toEqual([])
  })

  it('невалидный JSON в storage → []', () => {
    try { localStorage.setItem('cc-chat-search-history', 'not-json{{') } catch (_) {}
    expect(loadSearchHistory()).toEqual([])
  })

  it('не-массив в storage → []', () => {
    try { localStorage.setItem('cc-chat-search-history', JSON.stringify({ x: 1 })) } catch (_) {}
    expect(loadSearchHistory()).toEqual([])
  })

  it('массив с мусором → фильтруется', () => {
    try { localStorage.setItem('cc-chat-search-history', JSON.stringify(['ok', 42, null, '', 'другой'])) } catch (_) {}
    expect(loadSearchHistory()).toEqual(['ok', 'другой'])
  })
})
