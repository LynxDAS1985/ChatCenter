// v0.95.22: регрессионная защита overlay-архитектуры форум-панели.
//
// До v0.95.22: форум-панель = early return → размонтировал react-window List
// → при возврате scroll списка чатов сбрасывался наверх.
//
// С v0.95.22: форум-панель — overlay через position:absolute поверх wrapper.
// List ВСЕГДА в DOM, scroll сохраняется (паттерн Telegram Web K / Desktop).
//
// Эти тесты падают если кто-то вернёт early return → catch регрессии в CI.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const FILE = 'src/native/components/InboxChatListSidebar.jsx'
const code = fs.readFileSync(FILE, 'utf8')

describe('InboxChatListSidebar overlay-архитектура (v0.95.22)', () => {
  it('НЕТ early-return для форум-панели (`if (forumChat) { return`)', () => {
    // Регрессия v0.95.21 — early return заставлял React размонтировать List
    // при свитче форум-панели. Если кто-то вернёт этот паттерн — тест упадёт.
    const earlyReturnRegex = /if\s*\(\s*forumChat\s*\)\s*\{\s*\n\s*return\s*\(/
    expect(earlyReturnRegex.test(code)).toBe(false)
  })

  it('wrapper имеет position:relative для абсолютного позиционирования overlay', () => {
    // wrapper — обёртка над списком чатов и форум-overlay.
    // Без position:relative форум с position:absolute уйдёт за viewport.
    expect(code).toMatch(/position:\s*['"]relative['"]/)
  })

  it('форум-overlay рендерится с position:absolute + inset:0', () => {
    // Это и есть overlay-подход — растягивается по всему wrapper'у.
    expect(code).toMatch(/position:\s*['"]absolute['"]\s*,\s*inset:\s*0/)
  })

  it('форум-overlay внутри conditional рендера {forumChat && (...)}', () => {
    // Гарантия что overlay появляется/исчезает, но WRAPPER остаётся в DOM.
    expect(code).toMatch(/\{forumChat\s*&&\s*\(/)
  })

  it('форум-overlay имеет tabIndex={-1} для autofocus (Escape pattern)', () => {
    // Escape через focus-pattern: tabIndex=-1 + autofocus делает div фокусируемым,
    // onKeyDown ловит Escape ТОЛЬКО когда фокус на форум-overlay.
    // Без этого Escape конфликтовал бы с AccountContextMenu/AddMessengerModal/SettingsPanel.
    expect(code).toMatch(/tabIndex=\{-1\}/)
  })

  it('форум-overlay ловит Escape через onKeyDown (не глобальный window.addEventListener)', () => {
    // Локальный обработчик на самом overlay — Escape работает только когда фокус
    // на форум-панели. Глобальный обработчик создал бы конфликт с другими Escape-handlers.
    expect(code).toMatch(/onKeyDown=\{[^}]*Escape[^}]*closeForumTopics/)
  })

  it('есть useEffect для autofocus форум-overlay при открытии', () => {
    // useEffect зависимый от forumChat?.id вызывает forumPanelRef.current.focus()
    // когда форум появляется. Без autofocus Escape не сработает.
    expect(code).toMatch(/forumPanelRef\.current\.focus/)
  })

  it('forumPanelRef объявлен через useRef', () => {
    expect(code).toMatch(/forumPanelRef\s*=\s*useRef\(/)
  })

  it('форум-overlay использует CSS-классы native-forum-topic-panel + --closing', () => {
    // Slide-in/out анимация из styles-animations.css работает с overlay
    // (CSS transform translateX(100%) → 0).
    expect(code).toMatch(/native-forum-topic-panel/)
    expect(code).toMatch(/native-forum-topic-panel--closing/)
  })

  it('форум-overlay имеет outline:none (фокус задан программно, без визуального ring)', () => {
    // Стандарт UX для focusable overlay — скрыть default browser outline,
    // так как фокус управляется программно (autofocus при mount).
    expect(code).toMatch(/outline:\s*['"]none['"]/)
  })

  it('кнопка × имеет title="Закрыть темы (Esc)" — подсказка про Escape', () => {
    // UX-подсказка юзеру что Escape тоже работает.
    expect(code).toMatch(/title="Закрыть темы \(Esc\)"/)
  })
})
