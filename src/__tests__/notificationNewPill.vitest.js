// v1.2.227: тест чистой логики пузыря «↓ N новых» — счёт по РЕАЛЬНОМУ положению карточек.
// @vitest-environment happy-dom
//
// Модуль notificationNewPill.js — независимый (сам следит за списком через MutationObserver).
// Наблюдатель/DOM без запуска приложения не проверить, но чистое решение «сколько карточек ниже
// видимой области» (ccNewPillBelowCount) вынесено на window.__ccNewPill.belowCount и покрыто здесь.
// Без #container внутренний IIFE модуля тихо выходит (guard), а belowCount ставится ДО него.
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(async () => {
  await import('../../main/notificationNewPill.js')
})

describe('ccNewPillBelowCount — карточки ниже видимой области (v1.2.227)', () => {
  const fn = () => window.__ccNewPill.belowCount
  it('прокручен вверх → считает карточки ниже кромки', () => {
    // окно 250px, прокрутка 0; карточки на 0/100/200/300/400 → ниже кромки (250) = 300,400 → 2
    expect(fn()([0, 100, 200, 300, 400], 0, 250)).toBe(2)
  })
  it('прокручен к низу → ничего ниже (0)', () => {
    expect(fn()([0, 100, 200, 300, 400], 250, 250)).toBe(0)
  })
  it('все карточки помещаются на экране (короткий список) → 0', () => {
    expect(fn()([0, 100], 0, 1000)).toBe(0)
  })
  it('одна высокая карточка, прокручен внутри неё → 0 (других ниже нет)', () => {
    expect(fn()([0], 120, 250)).toBe(0)
  })
  it('пустой список → 0', () => {
    expect(fn()([], 0, 250)).toBe(0)
  })
  it('кривые значения не ломают → 0', () => {
    expect(fn()(undefined, undefined, undefined)).toBe(0)
  })
})
