// v1.2.318: тест чистого решения дедупа уведомлений (main/handlers/notifDedupDecision.js).
// Главное — воспроизведение бага «двойное VK-уведомление» и защита нативного Telegram.
import { describe, it, expect } from 'vitest'
import { decideNotifDedup, normalizeScopePart } from '../../main/handlers/notifDedupDecision.js'

describe('notifDedupDecision (v1.2.318)', () => {
  it('первое уведомление — не дубль, запоминает ключи', () => {
    const map = new Map()
    const r = decideNotifDedup({ dedupScope: 'mid:1', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Ёу мэээээн', body: 'Ёу мэээээн', now: 1000, dedupMap: map })
    expect(r.duplicate).toBe(false)
    expect(r.keysToSet.length).toBe(2) // scope-ключ + web-ключ
  })

  it('БАГ ВК: второй детектор с ДРУГИМ messageId/chatTag → распознан как дубль', () => {
    const map = new Map()
    // Детектор 1 (наблюдатель списка): scope без messageId
    const r1 = decideNotifDedup({ dedupScope: 'vk:sender:vk-list\\:abc123:alejandro', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Ёу мэээээн', body: 'Ёу мэээээн', now: 1000, dedupMap: map })
    expect(r1.duplicate).toBe(false)
    for (const k of r1.keysToSet) map.set(k, 1000)
    // Детектор 2 (открытый чат): scope с messageId=отпечаток — РАЗНЫЙ scope, но тот же отправитель+текст
    const r2 = decideNotifDedup({ dedupScope: 'mid:fp999', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Ёу мэээээн', body: 'Ёу мэээээн', now: 1400, dedupMap: map })
    expect(r2.duplicate).toBe(true) // раньше показывалось ДВА раза — теперь склеено
  })

  it('НАТИВНЫЙ Telegram (native_cc): два одинаковых сообщения с разными messageId — оба показываются', () => {
    const map = new Map()
    const r1 = decideNotifDedup({ dedupScope: 'mid:100', messengerId: 'native_cc', senderName: 'Иван', title: '', normalizedBody: 'ок', body: 'ок', now: 1000, dedupMap: map })
    expect(r1.duplicate).toBe(false)
    for (const k of r1.keysToSet) map.set(k, 1000)
    expect(r1.keysToSet.length).toBe(1) // для native web-ключ НЕ добавляется
    const r2 = decideNotifDedup({ dedupScope: 'mid:101', messengerId: 'native_cc', senderName: 'Иван', title: '', normalizedBody: 'ок', body: 'ок', now: 1200, dedupMap: map })
    expect(r2.duplicate).toBe(false) // второй «ок» показывается — не глушим нативное
  })

  it('MAX (v1.2.319): два ОДИНАКОВЫХ сообщения с разным max-sidebar messageId — оба показываются', () => {
    // Регресс v1.2.55: MAX кодирует событие в messageId (max-sidebar:sender:unread), чтобы
    // одинаковые по тексту сообщения подряд НЕ склеивались. Кросс-ключ не должен их глушить.
    const map = new Map()
    const r1 = decideNotifDedup({ dedupScope: 'mid:max-sidebar:ivan:3', messengerId: 'max', senderName: 'Иван', title: '', normalizedBody: 'ок', body: 'ок', messageId: 'max-sidebar:ivan:3', now: 1000, dedupMap: map })
    expect(r1.duplicate).toBe(false)
    expect(r1.keysToSet.length).toBe(1) // для MAX кросс-ключ НЕ добавляется
    for (const k of r1.keysToSet) map.set(k, 1000)
    const r2 = decideNotifDedup({ dedupScope: 'mid:max-sidebar:ivan:4', messengerId: 'max', senderName: 'Иван', title: '', normalizedBody: 'ок', body: 'ок', messageId: 'max-sidebar:ivan:4', now: 1500, dedupMap: map })
    expect(r2.duplicate).toBe(false) // второй «ок» показывается — v1.2.55 не сломан
  })

  it('веб (не MAX): VK с отпечатком-messageId ВСЁ РАВНО склеивается кросс-ключом', () => {
    // Убеждаемся, что исключение MAX не отключило склейку для VK (у VK messageId — отпечаток).
    const map = new Map()
    const r1 = decideNotifDedup({ dedupScope: 'vk:sender:c:alejandro', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Ёу', body: 'Ёу', messageId: '', now: 1000, dedupMap: map })
    for (const k of r1.keysToSet) map.set(k, 1000)
    const r2 = decideNotifDedup({ dedupScope: 'mid:fp777', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Ёу', body: 'Ёу', messageId: 'fp777', now: 1300, dedupMap: map })
    expect(r2.duplicate).toBe(true) // отпечаток не начинается с max-sidebar: → склейка работает
  })

  it('веб: разный текст того же отправителя — не дубль', () => {
    const map = new Map()
    const r1 = decideNotifDedup({ dedupScope: 'mid:1', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Ёу мэээээн', body: 'Ёу', now: 1000, dedupMap: map })
    for (const k of r1.keysToSet) map.set(k, 1000)
    const r2 = decideNotifDedup({ dedupScope: 'mid:2', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Я к 11 приеду', body: 'Я к 11 приеду', now: 1300, dedupMap: map })
    expect(r2.duplicate).toBe(false)
  })

  it('веб: тот же дубль ПОСЛЕ окна TTL — снова показывается', () => {
    const map = new Map()
    const r1 = decideNotifDedup({ dedupScope: 'mid:1', messengerId: 'vk', senderName: 'A', title: '', normalizedBody: 'привет', body: 'привет', now: 1000, dedupMap: map })
    for (const k of r1.keysToSet) map.set(k, 1000)
    const r2 = decideNotifDedup({ dedupScope: 'mid:2', messengerId: 'vk', senderName: 'A', title: '', normalizedBody: 'привет', body: 'привет', now: 1000 + 9000, dedupMap: map, ttlMs: 8000 })
    expect(r2.duplicate).toBe(false) // 9с > 8с TTL — уже не дубль
  })

  it('normalizeScopePart: схлопывает пробелы и регистр', () => {
    expect(normalizeScopePart('  Alejandro   Venzzo ')).toBe('alejandro venzzo')
  })
})
