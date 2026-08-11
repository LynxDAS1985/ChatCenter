// v1.2.222: тест чистой логики пузыря «↓ N новых».
// @vitest-environment happy-dom
//
// Модуль notificationNewPill.js — независимый (сам следит за списком через MutationObserver).
// Наблюдатель/DOM без запуска приложения не проверить, но чистое решение «сколько новых показать»
// (ccNewPillNextCount) вынесено на window.__ccNewPill.nextCount и покрыто здесь.
// Без #container внутренний IIFE модуля тихо выходит (guard), а nextCount ставится ДО него.
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(async () => {
  await import('../../main/notificationNewPill.js')
})

describe('ccNewPillNextCount — счётчик пузыря «↓ N новых» (v1.2.222)', () => {
  const fn = () => window.__ccNewPill.nextCount
  it('юзер у низа → сброс в 0 (пузырь не нужен)', () => {
    expect(fn()(3, 2, true)).toBe(0)
  })
  it('юзер прокрутил вверх → прибавляем пришедшие', () => {
    expect(fn()(3, 2, false)).toBe(5)
  })
  it('с нуля, вверху, пришло одно → 1', () => {
    expect(fn()(0, 1, false)).toBe(1)
  })
  it('ничего не пришло у низа → 0', () => {
    expect(fn()(0, 0, true)).toBe(0)
  })
  it('кривые значения (undefined) не ломают → 0', () => {
    expect(fn()(undefined, undefined, false)).toBe(0)
  })
})
