// v1.2.232: тест «Заметки о клиенте» (localStorage-хранилище).
import { describe, it, expect, beforeEach } from 'vitest'
import { getContactNote, setContactNote } from './contactNotes.js'

beforeEach(() => { try { localStorage.clear() } catch (_) {} })

describe('contactNotes', () => {
  it('пустая заметка по умолчанию', () => {
    expect(getContactNote('tg_1:42')).toBe('')
  })

  it('сохраняет и читает по chatId', () => {
    setContactNote('tg_1:42', 'VIP · заказ №5')
    expect(getContactNote('tg_1:42')).toBe('VIP · заказ №5')
  })

  it('заметки разных чатов не путаются', () => {
    setContactNote('tg_1:42', 'первый')
    setContactNote('tg_1:99', 'второй')
    expect(getContactNote('tg_1:42')).toBe('первый')
    expect(getContactNote('tg_1:99')).toBe('второй')
  })

  it('пустая/пробельная заметка стирает запись', () => {
    setContactNote('tg_1:42', 'что-то')
    setContactNote('tg_1:42', '   ')
    expect(getContactNote('tg_1:42')).toBe('')
  })

  it('нет chatId → безопасно', () => {
    expect(getContactNote('')).toBe('')
    expect(() => setContactNote('', 'x')).not.toThrow()
  })
})
