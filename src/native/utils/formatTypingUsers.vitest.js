// v0.95.31: тесты formatTypingUsers.

import { describe, it, expect } from 'vitest'
import { formatTypingUsers } from './formatTypingUsers.js'

const NOW = 1717200000000  // фиксированный момент

describe('formatTypingUsers (v0.95.31)', () => {
  it('null/undefined → null', () => {
    expect(formatTypingUsers(null)).toBeNull()
    expect(formatTypingUsers(undefined)).toBeNull()
  })

  it('пустой объект → null', () => {
    expect(formatTypingUsers({}, { nowMs: NOW })).toBeNull()
  })

  it('1 юзер → "Иван печатает..."', () => {
    const map = { '111': { senderName: 'Иван', at: NOW - 1000 } }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('Иван печатает...')
  })

  it('2 юзера → "Иван и Маша печатают..."', () => {
    const map = {
      '111': { senderName: 'Иван', at: NOW - 500 },
      '222': { senderName: 'Маша', at: NOW - 1000 },
    }
    const result = formatTypingUsers(map, { nowMs: NOW })
    expect(result).toContain('Иван')
    expect(result).toContain('Маша')
    expect(result).toContain(' и ')
    expect(result).toContain('печатают')
  })

  it('3 юзера → "Иван, Маша и Петя печатают..."', () => {
    const map = {
      '111': { senderName: 'Иван', at: NOW },
      '222': { senderName: 'Маша', at: NOW },
      '333': { senderName: 'Петя', at: NOW },
    }
    const result = formatTypingUsers(map, { nowMs: NOW })
    expect(result).toContain('Иван')
    expect(result).toContain('Маша')
    expect(result).toContain('Петя')
    expect(result).toContain('печатают')
  })

  it('4+ юзера → "N человек печатают..."', () => {
    const map = {
      '1': { senderName: 'A', at: NOW },
      '2': { senderName: 'B', at: NOW },
      '3': { senderName: 'C', at: NOW },
      '4': { senderName: 'D', at: NOW },
      '5': { senderName: 'E', at: NOW },
    }
    const result = formatTypingUsers(map, { nowMs: NOW })
    expect(result).toBe('5 человек печатают...')
  })

  it('пустое имя → "Кто-то печатает..."', () => {
    const map = { '111': { senderName: '', at: NOW } }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('Кто-то печатает...')
  })

  it('истёкшие записи (>6.5с) игнорируются', () => {
    const map = {
      '111': { senderName: 'Иван', at: NOW - 7000 },  // истёк
      '222': { senderName: 'Маша', at: NOW - 1000 },  // активен
    }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('Маша печатает...')
  })

  it('все истёкли → null', () => {
    const map = {
      '111': { senderName: 'Иван', at: NOW - 10000 },
      '222': { senderName: 'Маша', at: NOW - 8000 },
    }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBeNull()
  })

  it('запись без at (новая, без таймстампа) → активна', () => {
    const map = { '111': { senderName: 'Иван' } }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('Иван печатает...')
  })

  it('запись null/undefined → пропускается', () => {
    const map = {
      '111': null,
      '222': { senderName: 'Маша', at: NOW },
      '333': undefined,
    }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('Маша печатает...')
  })
})
