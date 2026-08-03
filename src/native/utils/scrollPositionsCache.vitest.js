// v1.2.186: тесты якоря прокрутки — computeScrollAnchor (взять) + placeAnchor (поставить).
// Тест-ловушка: после догрузки старых сообщений СВЕРХУ (сдвиг вниз) якорь возвращает
// сообщение на то же место экрана → точка «где остановился» держится.

import { describe, it, expect } from 'vitest'
import { computeScrollAnchor, placeAnchor } from './scrollPositionsCache.js'

// Мок-строка сообщения: data-msg-id + позиция top/bottom на экране.
const row = (id, top, height = 40) => ({
  getAttribute: (a) => (a === 'data-msg-id' ? id : null),
  getBoundingClientRect: () => ({ top, bottom: top + height }),
})

describe('computeScrollAnchor (v1.2.186)', () => {
  it('берёт ВЕРХНЕЕ видимое сообщение (первое, чей низ ниже верха окна)', () => {
    const el = {
      getBoundingClientRect: () => ({ top: 100 }),  // верх ленты на 100
      querySelectorAll: () => [
        row('m1', 50),   // низ=90 < 100 → выше окна, пропускаем
        row('m2', 95),   // низ=135 > 100 → верхнее видимое
        row('m3', 200),
      ],
    }
    expect(computeScrollAnchor(el)).toEqual({ anchorMsgId: 'm2', screenTop: -5 }) // 95 − 100
  })

  it('нет сообщений → null', () => {
    expect(computeScrollAnchor({ getBoundingClientRect: () => ({ top: 0 }), querySelectorAll: () => [] })).toBeNull()
    expect(computeScrollAnchor(null)).toBeNull()
  })
})

describe('placeAnchor (v1.2.186)', () => {
  it('ставит сообщение-якорь на заданное смещение screenTop', () => {
    const target = { getBoundingClientRect: () => ({ top: 250 }) }
    const el = {
      scrollTop: 1000,
      getBoundingClientRect: () => ({ top: 100 }),
      querySelector: (sel) => (sel.includes('data-msg-id="m2"') ? target : null),
    }
    // cur = 250 − 100 = 150; хотим screenTop=50 → scrollTop += 150 − 50 = 100
    expect(placeAnchor(el, 'm2', 50)).toBe(true)
    expect(el.scrollTop).toBe(1100)
  })

  it('🪤 ТЕСТ-ЛОВУШКА: после догрузки старых сверху (якорь уехал вниз) — возвращаем на место', () => {
    // Якорь сохраняли на screenTop=100. Сверху добавили старьё → якорь теперь на top=400.
    const target = { getBoundingClientRect: () => ({ top: 400 }) }
    const el = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0 }),
      querySelector: () => target,
    }
    // cur = 400; вернуть на 100 → scrollTop += 400 − 100 = 300 (прокрутили вниз, компенсируя добавленное сверху)
    expect(placeAnchor(el, 'm2', 100)).toBe(true)
    expect(el.scrollTop).toBe(300)
  })

  it('сообщение-якорь не найдено в DOM → false, scrollTop не трогаем', () => {
    const el = { scrollTop: 555, getBoundingClientRect: () => ({ top: 0 }), querySelector: () => null }
    expect(placeAnchor(el, 'gone', 100)).toBe(false)
    expect(el.scrollTop).toBe(555)
  })

  it('нет anchorMsgId → false', () => {
    const el = { scrollTop: 10, querySelector: () => null }
    expect(placeAnchor(el, null, 0)).toBe(false)
    expect(el.scrollTop).toBe(10)
  })
})
