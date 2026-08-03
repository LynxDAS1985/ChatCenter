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

  it('v1.2.170: 1 юзер с действием — конкретный глагол', () => {
    expect(formatTypingUsers({ '1': { senderName: 'Иван', at: NOW - 100, action: 'voice' } }, { nowMs: NOW }))
      .toBe('Иван записывает голосовое...')
    expect(formatTypingUsers({ '1': { senderName: 'Маша', at: NOW - 100, action: 'photo' } }, { nowMs: NOW }))
      .toBe('Маша отправляет фото...')
    expect(formatTypingUsers({ '1': { senderName: 'Пётр', at: NOW - 100, action: 'video_note' } }, { nowMs: NOW }))
      .toBe('Пётр записывает видеосообщение...')
  })

  it('v1.2.170: неизвестный/пустой action → "печатает..." (откат)', () => {
    expect(formatTypingUsers({ '1': { senderName: 'Иван', at: NOW - 100, action: 'zzz' } }, { nowMs: NOW }))
      .toBe('Иван печатает...')
    expect(formatTypingUsers({ '1': { senderName: 'Иван', at: NOW - 100 } }, { nowMs: NOW }))
      .toBe('Иван печатает...') // нет поля action → старое поведение
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

  it('v1.2.171: 2 юзера с ОДНИМ действием → общий глагол во мн.ч.', () => {
    const map = {
      '1': { senderName: 'Иван', at: NOW, action: 'voice' },
      '2': { senderName: 'Маша', at: NOW, action: 'voice' },
    }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('Иван и Маша записывают голосовое...')
  })

  it('v1.2.171: 2 юзера с РАЗНЫМИ действиями → откат "печатают..."', () => {
    const map = {
      '1': { senderName: 'Иван', at: NOW, action: 'voice' },
      '2': { senderName: 'Маша', at: NOW, action: 'photo' },
    }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('Иван и Маша печатают...')
  })

  it('v1.2.171: 3 юзера с одним действием (фото) → общий глагол', () => {
    const map = {
      '1': { senderName: 'A', at: NOW, action: 'photo' },
      '2': { senderName: 'B', at: NOW, action: 'photo' },
      '3': { senderName: 'C', at: NOW, action: 'photo' },
    }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('A, B и C отправляют фото...')
  })

  it('v1.2.171: 4+ юзера с одним действием → "N человек отправляют фото..."', () => {
    const map = {
      '1': { senderName: 'A', at: NOW, action: 'photo' },
      '2': { senderName: 'B', at: NOW, action: 'photo' },
      '3': { senderName: 'C', at: NOW, action: 'photo' },
      '4': { senderName: 'D', at: NOW, action: 'photo' },
    }
    expect(formatTypingUsers(map, { nowMs: NOW })).toBe('4 человек отправляют фото...')
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
