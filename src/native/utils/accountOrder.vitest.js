// v0.95.31: тесты accountOrder.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadAccountOrder, saveAccountOrder, applyAccountOrder, moveAccount,
} from './accountOrder.js'

describe('accountOrder (v0.95.31)', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch (_) {}
  })

  it('loadAccountOrder — пусто в storage → []', () => {
    expect(loadAccountOrder()).toEqual([])
  })

  it('saveAccountOrder + loadAccountOrder round-trip', () => {
    saveAccountOrder(['a', 'b', 'c'])
    expect(loadAccountOrder()).toEqual(['a', 'b', 'c'])
  })

  it('loadAccountOrder — мусор в storage → []', () => {
    try { localStorage.setItem('cc-account-order', 'not-json{{') } catch (_) {}
    expect(loadAccountOrder()).toEqual([])
  })

  it('saveAccountOrder — не-массив игнорируется', () => {
    saveAccountOrder(null)
    saveAccountOrder('string')
    saveAccountOrder(42)
    expect(loadAccountOrder()).toEqual([])
  })

  it('saveAccountOrder — фильтрует не-строки', () => {
    saveAccountOrder(['a', 42, null, 'b', { x: 1 }, 'c'])
    expect(loadAccountOrder()).toEqual(['a', 'b', 'c'])
  })

  it('applyAccountOrder — пустой order → исходный массив (копия)', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const result = applyAccountOrder(accounts, [])
    expect(result).toEqual(accounts)
    expect(result).not.toBe(accounts)
  })

  it('applyAccountOrder — переставляет аккаунты по order', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const result = applyAccountOrder(accounts, ['c', 'a', 'b'])
    expect(result.map(a => a.id)).toEqual(['c', 'a', 'b'])
  })

  it('applyAccountOrder — новые аккаунты (не в order) идут В КОНЕЦ', () => {
    const accounts = [
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'NEW' },
    ]
    const result = applyAccountOrder(accounts, ['c', 'a', 'b'])
    expect(result.map(a => a.id)).toEqual(['c', 'a', 'b', 'NEW'])
  })

  it('applyAccountOrder — устаревшие id в order (удалённые аккаунты) игнорируются', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }]
    const result = applyAccountOrder(accounts, ['REMOVED-X', 'a', 'REMOVED-Y', 'b'])
    expect(result.map(a => a.id)).toEqual(['a', 'b'])
  })

  it('moveAccount — перемещает с 0 → 2', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const result = moveAccount(accounts, 0, 2)
    expect(result).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moveAccount — перемещает с 3 → 0', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const result = moveAccount(accounts, 3, 0)
    expect(result).toEqual(['d', 'a', 'b', 'c'])
  })

  it('moveAccount — fromIndex === toIndex → без изменений', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveAccount(accounts, 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('moveAccount — clamp out-of-bounds индексы', () => {
    const accounts = [{ id: 'a' }, { id: 'b' }]
    expect(moveAccount(accounts, -5, 99)).toEqual(['b', 'a'])
  })

  it('moveAccount — пустой массив → []', () => {
    expect(moveAccount([], 0, 0)).toEqual([])
  })
})
