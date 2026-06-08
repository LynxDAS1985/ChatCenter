// v0.96.0 (Phase 0 M0.1): тесты для NotificationSource module.
// См. .memory-bank/ai-agent-plan/phases/phase-0-foundation.md

import { describe, it, expect } from 'vitest'
import {
  createNotificationSource,
  validateNotificationSource,
  sourceKey,
  SOURCE_REQUIRED_FIELDS,
} from './notificationSource.js'

const MIN_INPUT = {
  messengerId: 'native_cc',
  accountId: 'tg_611696632',
  chatId: '-1001229486988',
  messageId: '38375784448',
}

describe('createNotificationSource — обязательные поля', () => {
  it('создание с минимальными полями работает', () => {
    const s = createNotificationSource(MIN_INPUT)
    expect(s.messengerId).toBe('native_cc')
    expect(s.accountId).toBe('tg_611696632')
    expect(s.chatId).toBe('-1001229486988')
    expect(s.messageId).toBe('38375784448')
    // Defaults для опциональных
    expect(s.threadId).toBe(null)
    expect(s.mediaType).toBe(null)
  })

  it('создание с полным набором полей', () => {
    const full = {
      ...MIN_INPUT,
      threadId: 'topic_42',
      senderId: 'user_123',
      senderName: 'Иван',
      chatTitle: 'Магазин',
      timestamp: 1717843080000,
      textPreview: 'Здравствуйте',
      mediaType: 'photo',
      replyToId: 'msg_xyz',
      isOutgoing: false,
    }
    const s = createNotificationSource(full)
    expect(s.senderName).toBe('Иван')
    expect(s.chatTitle).toBe('Магазин')
    expect(s.threadId).toBe('topic_42')
    expect(s.mediaType).toBe('photo')
    expect(s.isOutgoing).toBe(false)
  })

  for (const field of SOURCE_REQUIRED_FIELDS) {
    it(`создание без ${field} → ошибка`, () => {
      const input = { ...MIN_INPUT }
      delete input[field]
      expect(() => createNotificationSource(input)).toThrow(/missing required field/)
    })
  }
})

describe('createNotificationSource — нормализация и обрезка', () => {
  it('id поля приводятся к string', () => {
    const s = createNotificationSource({
      messengerId: 'native_cc',
      accountId: 123,           // число
      chatId: -1001,            // отрицательное число
      messageId: 38375784448,   // big int
    })
    expect(typeof s.accountId).toBe('string')
    expect(typeof s.chatId).toBe('string')
    expect(typeof s.messageId).toBe('string')
    expect(s.chatId).toBe('-1001')
    expect(s.messageId).toBe('38375784448')
  })

  it('textPreview > 200 символов → обрезается', () => {
    const longText = 'А'.repeat(500)
    const s = createNotificationSource({ ...MIN_INPUT, textPreview: longText })
    expect(s.textPreview.length).toBe(200)
  })

  it('textPreview короткий → не меняется', () => {
    const s = createNotificationSource({ ...MIN_INPUT, textPreview: 'короткий' })
    expect(s.textPreview).toBe('короткий')
  })

  it('неизвестные поля игнорируются (whitelist)', () => {
    const s = createNotificationSource({ ...MIN_INPUT, secretField: 'leak', __proto__: { evil: true } })
    expect(s.secretField).toBeUndefined()
    expect(s.evil).toBeUndefined()
  })
})

describe('createNotificationSource — invariant (Object.freeze)', () => {
  it('изменение поля ломается (strict mode)', () => {
    const s = createNotificationSource(MIN_INPUT)
    // В strict mode Object.freeze бросает TypeError при попытке записи.
    // В test env (jsdom/happy-dom) — Vitest по умолчанию strict.
    expect(() => { s.messengerId = 'hacked' }).toThrow()
  })
})

describe('createNotificationSource — input валидация', () => {
  it('null input → ошибка', () => {
    expect(() => createNotificationSource(null)).toThrow(/input must be an object/)
  })

  it('undefined input → ошибка', () => {
    expect(() => createNotificationSource(undefined)).toThrow(/input must be an object/)
  })

  it('строка вместо объекта → ошибка', () => {
    expect(() => createNotificationSource('not an object')).toThrow(/input must be an object/)
  })

  it('пустая строка в обязательном поле → ошибка', () => {
    expect(() => createNotificationSource({ ...MIN_INPUT, chatId: '' })).toThrow(/missing required field: chatId/)
  })
})

describe('validateNotificationSource', () => {
  it('валидный source → { valid: true, errors: [] }', () => {
    const s = createNotificationSource(MIN_INPUT)
    const r = validateNotificationSource(s)
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('невалидный source (без chatId) → { valid: false }', () => {
    const r = validateNotificationSource({ messengerId: 'x', accountId: 'y', messageId: 'z' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('missing required field: chatId')
  })

  it('null → { valid: false }', () => {
    const r = validateNotificationSource(null)
    expect(r.valid).toBe(false)
  })
})

describe('sourceKey', () => {
  it('возвращает уникальный ключ', () => {
    const s = createNotificationSource(MIN_INPUT)
    const key = sourceKey(s)
    expect(key).toBe('native_cc|tg_611696632|-1001229486988|38375784448')
  })

  it('null → пустая строка', () => {
    expect(sourceKey(null)).toBe('')
  })

  it('разные source → разные ключи', () => {
    const s1 = createNotificationSource(MIN_INPUT)
    const s2 = createNotificationSource({ ...MIN_INPUT, messageId: 'other' })
    expect(sourceKey(s1)).not.toBe(sourceKey(s2))
  })
})
