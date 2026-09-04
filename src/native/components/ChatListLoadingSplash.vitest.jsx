// v1.2.393: страж заставки первой загрузки списка чатов (ChatListLoadingSplash).
// Ловит регрессии: (1) заставка перестала показываться/пропала из сайдбара;
// (2) сломался счётчик «Загружено N из TOTAL»; (3) отвалилась проводка флага в InboxMode.
// Тесты падают, если кто-то уберёт заставку или её подключение — вернётся «мигание» списка.

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import fs from 'node:fs'
import ChatListLoadingSplash from './ChatListLoadingSplash.jsx'

beforeEach(() => { try { localStorage.clear() } catch { /* нет хранилища в среде теста — ок */ } })
afterEach(() => { cleanup(); try { localStorage.clear() } catch { /* нет хранилища — ок */ } })

describe('ChatListLoadingSplash — поведение', () => {
  it('show=true → показывает заставку с именем чата и счётчиком', () => {
    render(<ChatListLoadingSplash show={true} store={{ chats: [{ title: 'Макс', avatar: '' }], accounts: [] }} />)
    expect(screen.getByText(/Загружаем/)).toBeTruthy()
    expect(screen.getByText('Макс')).toBeTruthy()
    expect(screen.getByText(/Загружено \d+ из 1/)).toBeTruthy() // v1.2.403: число теперь анимируется (растёт от 0), поэтому \d+
  })

  it('show=false → ничего не рендерит (заставки нет в DOM)', () => {
    const { container } = render(<ChatListLoadingSplash show={false} store={{ chats: [], accounts: [] }} />)
    expect(container.querySelector('.native-chatload')).toBeNull()
  })

  it('знает общее число из прошлого запуска (localStorage) → «из 692»', () => {
    try { localStorage.setItem('cc_chat_total_hint', '692') } catch { /* ок */ }
    render(<ChatListLoadingSplash show={true} store={{ chats: [{ title: 'Чат', avatar: '' }], accounts: [] }} />)
    expect(screen.getByText(/из 692/)).toBeTruthy()
  })

  it('нет аккаунтов/чатов, общее число неизвестно → счётчик показывает «Собираем чаты…»', () => {
    render(<ChatListLoadingSplash show={true} store={{ chats: [], accounts: [] }} />)
    expect(screen.getByText(/Собираем чаты/)).toBeTruthy() // строка-счётчик без «из N» (первый запуск)
  })

  it('фикс #1: «итог» сохраняется ТОЛЬКО при завершении загрузки (loadDone), а не при скрытии из-за поиска', () => {
    const store = { chats: [{ title: 'A' }, { title: 'B' }], accounts: [] }
    // Показана, загрузка НЕ завершена (loadDone=false) → в память ничего не записано
    const { rerender } = render(<ChatListLoadingSplash show={true} loadDone={false} store={store} />)
    expect(localStorage.getItem('cc_chat_total_hint')).toBeNull()
    // Скрытие ИЗ-ЗА поиска (show=false, но loadDone всё ещё false) → «итог» НЕ должен записаться
    rerender(<ChatListLoadingSplash show={false} loadDone={false} store={store} />)
    expect(localStorage.getItem('cc_chat_total_hint')).toBeNull()
    // Реальное завершение загрузки (loadDone=true) → записан итог = число чатов
    rerender(<ChatListLoadingSplash show={false} loadDone={true} store={store} />)
    expect(localStorage.getItem('cc_chat_total_hint')).toBe('2')
  })

  it('фикс #2: заставка при затухании не перехватывает клики (pointer-events:none в CSS)', () => {
    const css = fs.readFileSync('src/native/styles-chatlist-loading.css', 'utf8')
    expect(css).toMatch(/native-chatload--leaving[^}]*pointer-events:\s*none/)
  })
})

describe('ChatListLoadingSplash — проводка (source guard, v1.2.401)', () => {
  const sidebar = fs.readFileSync('src/native/components/InboxChatListSidebar.jsx', 'utf8')
  const inbox = fs.readFileSync('src/native/modes/InboxMode.jsx', 'utf8')

  it('InboxMode импортирует и рендерит заставку на ВСЮ область (не в панели списка)', () => {
    expect(inbox).toMatch(/import ChatListLoadingSplash/)
    expect(inbox).toMatch(/<ChatListLoadingSplash/)
    expect(inbox).toMatch(/chatsFirstLoadDone/)
    expect(inbox).toMatch(/loadDone=\{chatsFirstLoadDone\}/)
  })

  it('InboxChatListSidebar БОЛЬШЕ НЕ рендерит заставку (перенесена в InboxMode)', () => {
    // Регрессия: если заставку вернут в панель списка — снова получится «в три экрана».
    expect(sidebar).not.toMatch(/ChatListLoadingSplash/)
  })
})

describe('ChatListLoadingSplash — фаза «скелет» + шапка (source guard, v1.2.406/407)', () => {
  // Страж «единого экрана»: ЦентрЧатов сверху → кружки → СКЕЛЕТ списка → реальный список.
  // Ловит регрессию: кто-то убрал фазу скелета (вернётся резкий «прыжок» к списку) или шапку
  // (пропадёт единый вид со стартовой заставкой index.html). Детерминированно, без таймеров.
  const jsx = fs.readFileSync('src/native/components/ChatListLoadingSplash.jsx', 'utf8')
  const css = fs.readFileSync('src/native/styles-chatlist-loading.css', 'utf8')

  it('есть промежуточная фаза СКЕЛЕТА перед реальным списком', () => {
    expect(jsx).toMatch(/setPhase\(['"]skeleton['"]\)/)        // переход в скелет
    expect(jsx).toMatch(/phase === ['"]skeleton['"]/)          // ветка рендера скелета
    expect(jsx).toMatch(/native-chatload-skel/)                // сами строки-скелеты
  })

  it('есть шапка «ЦентрЧатов» (единый вид со стартовой заставкой)', () => {
    expect(jsx).toMatch(/native-chatload-brand/)
    expect(jsx).toMatch(/ЦентрЧатов/)
  })

  it('CSS: у скелета есть бегущий блик (shimmer) и стиль шапки', () => {
    expect(css).toMatch(/@keyframes native-chatload-shim/)
    expect(css).toMatch(/\.native-chatload-brand\s*\{/)
    expect(css).toMatch(/\.native-chatload-sk\b/)
  })
})
