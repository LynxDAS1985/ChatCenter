// v0.95.20: тесты computeJumpToEndGate — гейт «грузить-потом-скроллить»
// при клике ↓ в чате с пропуском между загруженным окном и сервером.
//
// Главные контракты (регрессионная защита):
// 1. Есть разрыв (gapMessages > 0) + lastMessageId + не идёт загрузка → true (load-first)
// 2. Разрыва нет (gapMessages = 0) → false (direct-scroll, fallback ветка)
// 3. lastMessageId неизвестен → false (нечем целиться при итерации)
// 4. Идёт загрузка → false (не запускаем параллельно)
// 5. gapMessages некорректен (null / NaN / undefined) → false (защита)

import { describe, it, expect } from 'vitest'
import { computeJumpToEndGate } from './jumpToEndGate.js'

describe('computeJumpToEndGate — load-first гейт для кнопки ↓ (v0.95.20)', () => {
  it('есть пропуск (gap=5) + lastMessageId + не грузим → true (load-first)', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 9132048384,
      gapMessages: 5,
      loading: false,
    })).toBe(true)
  })

  it('большой пропуск (gap=1021, реальный лог «Департамент вайб-кодинга») → true', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 45491421184,
      gapMessages: 1021,
      loading: false,
    })).toBe(true)
  })

  it('минимальный пропуск (gap=1) → true (любой разрыв → load-first)', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 100,
      gapMessages: 1,
      loading: false,
    })).toBe(true)
  })

  it('нет пропуска (gap=0, всё уже загружено) → false (direct-scroll)', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 100,
      gapMessages: 0,
      loading: false,
    })).toBe(false)
  })

  it('отрицательный gap (странный случай — DOM впереди chat.last_message) → false', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 100,
      gapMessages: -3,
      loading: false,
    })).toBe(false)
  })

  it('lastMessageId отсутствует (null) → false', () => {
    expect(computeJumpToEndGate({
      lastMessageId: null,
      gapMessages: 50,
      loading: false,
    })).toBe(false)
  })

  it('lastMessageId=0 → false (нечем целиться)', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 0,
      gapMessages: 50,
      loading: false,
    })).toBe(false)
  })

  it('идёт загрузка (loading=true) → false (не дёргаем параллельно)', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 100,
      gapMessages: 50,
      loading: true,
    })).toBe(false)
  })

  it('gapMessages=null (DOM пуст или нет chatLastMessageId) → false', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 100,
      gapMessages: null,
      loading: false,
    })).toBe(false)
  })

  it('gapMessages=NaN → false (защита от кривых данных)', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 100,
      gapMessages: NaN,
      loading: false,
    })).toBe(false)
  })

  it('gapMessages=undefined → false', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 100,
      gapMessages: undefined,
      loading: false,
    })).toBe(false)
  })

  it('пустые аргументы → false (защита)', () => {
    expect(computeJumpToEndGate()).toBe(false)
    expect(computeJumpToEndGate({})).toBe(false)
  })

  it('реальный сценарий v0.95.19: чат с 30 непрочитанными но gap=200 → true (раньше было false при unreadVsLoaded>50)', () => {
    // Раньше с гейтом `unreadVsLoaded > 50` юзер с 30 непрочитанными и большим
    // gap проваливался в direct-scroll — сообщения «появлялись после». Теперь
    // gapMessages > 0 → load-first.
    expect(computeJumpToEndGate({
      lastMessageId: 5633998848,
      gapMessages: 200,
      loading: false,
    })).toBe(true)
  })

  it('реальный сценарий v0.95.19: маленький чат, всё загружено → false (как раньше)', () => {
    expect(computeJumpToEndGate({
      lastMessageId: 5633998848,
      gapMessages: 0,
      loading: false,
    })).toBe(false)
  })
})
