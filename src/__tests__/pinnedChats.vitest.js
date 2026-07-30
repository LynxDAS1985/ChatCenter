// v1.2.138: тесты локальных закреплений чатов (pinnedChats.js).
// Проверяем чистые функции (toggle/isPinned/sort) и цикл load/save через localStorage.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadPinnedIds, savePinnedIds, togglePinnedId, isPinnedId, sortWithPinnedFirst,
  filterSortChats,
} from '../native/store/pinnedChats.js'

describe('pinnedChats — чистые функции', () => {
  it('togglePinnedId добавляет чат в начало и не мутирует вход', () => {
    const before = ['a', 'b']
    const after = togglePinnedId(before, 'c')
    expect(after).toEqual(['c', 'a', 'b'])
    expect(before).toEqual(['a', 'b']) // вход не тронут
  })

  it('togglePinnedId убирает уже закреплённый', () => {
    expect(togglePinnedId(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('togglePinnedId с пустым chatId возвращает список как есть', () => {
    expect(togglePinnedId(['a'], '')).toEqual(['a'])
  })

  it('isPinnedId работает и с массивом, и с Set', () => {
    expect(isPinnedId(['a', 'b'], 'a')).toBe(true)
    expect(isPinnedId(['a', 'b'], 'z')).toBe(false)
    expect(isPinnedId(new Set(['a', 'b']), 'b')).toBe(true)
    expect(isPinnedId(['a'], '')).toBe(false)
  })

  it('sortWithPinnedFirst: закреплённые наверх, внутри — по времени (свежие выше)', () => {
    const chats = [
      { id: 'a', lastMessageTs: 100 },
      { id: 'b', lastMessageTs: 300 }, // закреплён
      { id: 'c', lastMessageTs: 200 },
      { id: 'd', lastMessageTs: 50 },  // закреплён
    ]
    const out = sortWithPinnedFirst(chats, new Set(['b', 'd']))
    expect(out.map(c => c.id)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('sortWithPinnedFirst не мутирует исходный массив', () => {
    const chats = [{ id: 'a', lastMessageTs: 1 }, { id: 'b', lastMessageTs: 2 }]
    const copy = [...chats]
    sortWithPinnedFirst(chats, new Set())
    expect(chats).toEqual(copy)
  })

  it('sortWithPinnedFirst без закреплённых = обычная сортировка по времени', () => {
    const chats = [
      { id: 'a', lastMessageTs: 100 },
      { id: 'b', lastMessageTs: 300 },
      { id: 'c', lastMessageTs: 200 },
    ]
    const out = sortWithPinnedFirst(chats, new Set())
    expect(out.map(c => c.id)).toEqual(['b', 'c', 'a'])
  })

  it('sortWithPinnedFirst с МАССИВОМ: закреплённые в порядке закрепления (не по времени) — TODO-18', () => {
    const chats = [
      { id: 'a', lastMessageTs: 100 },
      { id: 'b', lastMessageTs: 300 }, // закреплён вторым
      { id: 'c', lastMessageTs: 200 },
      { id: 'd', lastMessageTs: 50 },  // закреплён первым
    ]
    // порядок закрепления: сначала d, потом b — несмотря на то, что у b время больше
    const out = sortWithPinnedFirst(chats, ['d', 'b'])
    expect(out.map(c => c.id)).toEqual(['d', 'b', 'c', 'a'])
  })
})

describe('filterSortChats — конвейер списка (TODO-19)', () => {
  const chats = [
    { id: 'tg_1:a', accountId: 'tg_1', title: 'Анна', lastMessage: 'привет', lastMessageTs: 100 },
    { id: 'tg_1:b', accountId: 'tg_1', title: 'Борис', lastMessage: 'счёт', lastMessageTs: 300 },
    { id: 'tg_2:c', accountId: 'tg_2', title: 'Виктор', lastMessage: 'заказ', lastMessageTs: 200 },
  ]

  it('закреплённые наверх (в порядке закрепления), остальные по времени', () => {
    const out = filterSortChats(chats, { filter: 'all', query: '', pinnedIds: ['tg_2:c'] })
    expect(out.map(c => c.id)).toEqual(['tg_2:c', 'tg_1:b', 'tg_1:a'])
  })

  it('фильтр по аккаунту', () => {
    const out = filterSortChats(chats, { filter: 'tg_1', query: '', pinnedIds: [] })
    expect(out.map(c => c.id)).toEqual(['tg_1:b', 'tg_1:a'])
  })

  it('поиск по title и по тексту последнего сообщения', () => {
    expect(filterSortChats(chats, { query: 'анна' }).map(c => c.id)).toEqual(['tg_1:a'])
    expect(filterSortChats(chats, { query: 'заказ' }).map(c => c.id)).toEqual(['tg_2:c'])
  })

  it('пустой/битый вход не падает', () => {
    expect(filterSortChats(null, null)).toEqual([])
    expect(filterSortChats(undefined)).toEqual([])
  })
})

describe('pinnedChats — localStorage', () => {
  beforeEach(() => { localStorage.clear() })

  it('load пустого хранилища = []', () => {
    expect(loadPinnedIds()).toEqual([])
  })

  it('save → load возвращает тот же список', () => {
    savePinnedIds(['x', 'y'])
    expect(loadPinnedIds()).toEqual(['x', 'y'])
  })

  it('битый JSON в хранилище → []', () => {
    localStorage.setItem('cc-native-pinned-chats', '{не json')
    expect(loadPinnedIds()).toEqual([])
  })

  it('нестроковый мусор фильтруется', () => {
    localStorage.setItem('cc-native-pinned-chats', JSON.stringify(['ok', 5, null, '']))
    expect(loadPinnedIds()).toEqual(['ok'])
  })
})
