// v0.95.24: тесты shouldTriggerInitialBackfill.
//
// Главные контракты:
// 1. Малый результат (1-29 при threshold=30) + не force + не hasOverride → true
// 2. Достаточный результат (>= threshold) → false (нет смысла грузить ещё)
// 3. force=true → false (jump-to-end, replace, НЕ trigger backfill)
// 4. hasOverride=true → false (явный aroundId override)
// 5. got=0 → false (TDLib пустой ответ, backfill тоже вернёт пусто)
// 6. NaN/undefined → false (защита)

import { describe, it, expect } from 'vitest'
import { shouldTriggerInitialBackfill } from './initialBackfillGate.js'

describe('shouldTriggerInitialBackfill — backfill при первом открытии (v0.95.24)', () => {
  it('малый результат (got=3, реальный сценарий «Страховая Компания») → true', () => {
    expect(shouldTriggerInitialBackfill({ got: 3, force: false, hasOverride: false })).toBe(true)
  })

  it('got=1 → true (один cached, нужно догрузить)', () => {
    expect(shouldTriggerInitialBackfill({ got: 1, force: false, hasOverride: false })).toBe(true)
  })

  it('got=29 (на границе threshold=30) → true', () => {
    expect(shouldTriggerInitialBackfill({ got: 29, force: false, hasOverride: false })).toBe(true)
  })

  it('got=30 (точно threshold) → false (уже достаточно)', () => {
    expect(shouldTriggerInitialBackfill({ got: 30, force: false, hasOverride: false })).toBe(false)
  })

  it('got=50 (полный limit) → false', () => {
    expect(shouldTriggerInitialBackfill({ got: 50, force: false, hasOverride: false })).toBe(false)
  })

  it('got=0 (пустой ответ) → false (backfill тоже вернёт пусто)', () => {
    expect(shouldTriggerInitialBackfill({ got: 0, force: false, hasOverride: false })).toBe(false)
  })

  it('force=true → false (jump-to-end ветка использует другую логику)', () => {
    expect(shouldTriggerInitialBackfill({ got: 3, force: true, hasOverride: false })).toBe(false)
  })

  it('hasOverride=true (явный aroundId) → false', () => {
    expect(shouldTriggerInitialBackfill({ got: 3, force: false, hasOverride: true })).toBe(false)
  })

  it('кастомный threshold=10 + got=8 → true', () => {
    expect(shouldTriggerInitialBackfill({ got: 8, force: false, hasOverride: false, threshold: 10 })).toBe(true)
  })

  it('кастомный threshold=10 + got=10 → false', () => {
    expect(shouldTriggerInitialBackfill({ got: 10, force: false, hasOverride: false, threshold: 10 })).toBe(false)
  })

  it('got=NaN → false (защита)', () => {
    expect(shouldTriggerInitialBackfill({ got: NaN, force: false, hasOverride: false })).toBe(false)
  })

  it('got=undefined → false', () => {
    expect(shouldTriggerInitialBackfill({ got: undefined, force: false, hasOverride: false })).toBe(false)
  })

  it('пустые аргументы → false', () => {
    expect(shouldTriggerInitialBackfill()).toBe(false)
    expect(shouldTriggerInitialBackfill({})).toBe(false)
  })

  it('реальный сценарий из лога: count=3 first/last близкие → true', () => {
    // Лог: [get-msgs] count=3 first=690255560704 last=690257657856 hasMore=false
    // → юзер видит 3 сообщения вместо ожидаемой истории
    expect(shouldTriggerInitialBackfill({ got: 3, force: false, hasOverride: false })).toBe(true)
  })
})
