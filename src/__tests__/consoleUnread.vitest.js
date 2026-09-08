// v1.2.415: страж приёма счётчика значка через console-канал (__CC_UNREAD__).
// ВК-webview НЕ шлёт ipc-message (значок не кормился через preload 'unread-count' для custom-ВК).
// Фикс: хук vk.hook.js шлёт бейдж «Мессенджер N» через console.log('__CC_UNREAD__N'), а consoleMessageHandler
// ставит это число в unreadCounts[messengerId] (значок рейла). Эти тесты проверяют приёмную сторону.

import { describe, it, expect } from 'vitest'
import { createConsoleMessageHandler } from '../utils/consoleMessageHandler.js'

function makeHandler(setUnreadCounts) {
  // parseConsoleMessage → null: сообщение __CC_UNREAD__ не относится к __CC_ACCOUNT__/__CC_OZON_COUNT__.
  return createConsoleMessageHandler({ parseConsoleMessage: () => null, setUnreadCounts })('el', 'custom_vk')
}

describe('consoleMessageHandler — __CC_UNREAD__ → значок рейла (v1.2.415)', () => {
  it('__CC_UNREAD__2 → ставит 2 для мессенджера', () => {
    let state = {}
    makeHandler(fn => { state = fn(state) })({ message: '__CC_UNREAD__2', level: 'info' })
    expect(state.custom_vk).toBe(2)
  })

  it('__CC_UNREAD__0 → ставит 0 (пользователь прочитал)', () => {
    let state = { custom_vk: 2 }
    makeHandler(fn => { state = fn(state) })({ message: '__CC_UNREAD__0', level: 'info' })
    expect(state.custom_vk).toBe(0)
  })

  it('то же значение → prev не пересоздаётся (без лишних ре-рендеров)', () => {
    const prev = { custom_vk: 2 }
    let result
    makeHandler(fn => { result = fn(prev) })({ message: '__CC_UNREAD__2', level: 'info' })
    expect(result).toBe(prev)
  })

  it('мусорное число (__CC_UNREAD__abc) → значок не трогаем', () => {
    let called = false
    makeHandler(() => { called = true })({ message: '__CC_UNREAD__abc', level: 'info' })
    expect(called).toBe(false)
  })
})
