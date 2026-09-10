// v1.2.448: тесты «непрочитанное по заголовку вкладки» (shared/webviewTitleUnread.js).
//
// ЗАЧЕМ ОНИ ПОЯВИЛИСЬ: до выноса этот путь не был покрыт НИ ОДНИМ тестом, хотя именно он
// давал больше всего повторных поломок: звук-фантомы у МАКС (v1.2.7), обнуление счётчика
// Ozon (v1.2.374), шторм запросов (v1.2.417). Теперь его можно прогонять на подставных
// данных, без запуска приложения.
//
// 🔴 ТРИ ЛОВУШКИ, которые тут сторожим:
//   1) у МАКСа звук по заголовку играть НЕЛЬЗЯ — только после подтверждённой карточки;
//   2) у Ozon заголовок БЕЗ числа НЕ означает «всё прочитано» (числа там нет никогда,
//      счётчик ведёт наш сторож) — обнуление сбрасывало значок в 0;
//   3) список связей, который собирает webviewSetup.js, обязан совпадать с тем, что
//      разбирает модуль: разойдутся — счётчик тихо перестанет работать.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createTitleUnreadHandler } from '../../shared/webviewTitleUnread.js'

// Подставной набор связей: считаем вызовы и храним «состояние экрана».
function makeCtx(over = {}) {
  const calls = { sound: 0, fallback: 0, reset: 0, probe: 0, health: 0 }
  let unread = {}
  const ctx = {
    notifCountRef: { current: {} },
    notifReadyRef: { current: { wa: true, max: true, ozon: true } },
    lastRibbonTsRef: { current: {} },
    notifMidTsRef: { current: {} },
    lastSoundTsRef: { current: {} },
    recentNotifsRef: { current: new Map() },
    senderCacheRef: { current: {} },
    titleUnreadBaselineRef: { current: {} },
    maxTitleFallbackTimers: { current: {} },
    maxTitleFallbackStateRef: { current: { seen: {} } },
    settingsRef: { current: { soundEnabled: true, messengerNotifs: {}, mutedMessengers: {} } },
    messengersRef: { current: [{ id: 'wa', url: 'https://web.whatsapp.com', color: '#25D366' },
                               { id: 'max', url: 'https://web.max.ru', color: '#8B5CF6' },
                               { id: 'ozon', url: 'https://seller.ozon.ru/app/chats', color: '#005BFF' }] },
    activeIdRef: { current: 'wa' },
    windowFocusedRef: { current: true },
    setUnreadCounts: (updater) => { unread = updater(unread) },
    updateHealth: () => { calls.health++ },
    healthLabel: (id) => id,
    healthUrl: (el) => (el && el.getURL ? el.getURL() : ''),
    scheduleHealthProbe: () => { calls.probe++ },
    traceNotif: () => {},
    handleNewMessage: () => {},
    cleanupSenderCache: () => {},
    isOzonWebview: (el, id) => id === 'ozon',
    decideMaxTitleUnread: () => ({ schedule: true, reason: 'ok', prevCount: null }),
    resetMaxTitleUnread: () => { calls.reset++ },
    scheduleMaxTitleFallback: () => { calls.fallback++ },
    playNotificationSound: () => { calls.sound++ },
    markHealthOk: (prev) => prev || {},
    ...over,
  }
  return { ctx, calls, unread: () => unread }
}

const fakeEl = (url) => ({ getURL: () => url })

describe('Число из заголовка вкладки', () => {
  it('«(3) WhatsApp» → счётчик 3, здоровье отмечено, проверка вкладки назначена', () => {
    const { ctx, calls, unread } = makeCtx()
    const handle = createTitleUnreadHandler(ctx).handleTitleUpdated
    handle(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(3) WhatsApp' })
    expect(unread()).toEqual({ wa: 3 })
    expect(calls.health).toBe(1)
    expect(calls.probe).toBe(1)
  })

  it('вид «5 непрочитанных» тоже понимаем', () => {
    const { ctx, unread } = makeCtx()
    createTitleUnreadHandler(ctx).handleTitleUpdated(fakeEl('https://web.whatsapp.com'), 'wa', { title: '5 непрочитанных сообщений' })
    expect(unread()).toEqual({ wa: 5 })
  })

  it('то же число второй раз — счётчик не пересоздаём (лишней перерисовки нет)', () => {
    const { ctx, unread } = makeCtx()
    const handle = createTitleUnreadHandler(ctx).handleTitleUpdated
    handle(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(2) WhatsApp' })
    const first = unread()
    handle(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(2) WhatsApp' })
    expect(unread()).toBe(first)   // тот же объект = React не перерисовывает
  })
})

describe('Звук как запасной путь', () => {
  it('счётчик вырос → звук играет и запасной путь назначен', () => {
    const { ctx, calls } = makeCtx()
    createTitleUnreadHandler(ctx).handleTitleUpdated(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(1) WhatsApp' })
    expect(calls.sound).toBe(1)
    expect(calls.fallback).toBe(1)
  })

  it('🔴 ЛОВУШКА: у МАКСа звук по заголовку НЕ играем (ждём подтверждённую карточку)', () => {
    const { ctx, calls } = makeCtx({ activeIdRef: { current: 'max' } })
    createTitleUnreadHandler(ctx).handleTitleUpdated(fakeEl('https://web.max.ru/'), 'max', { title: '(4) MAX' })
    expect(calls.sound).toBe(0)     // звука быть НЕ должно
    expect(calls.fallback).toBe(1)  // а запасной путь всё равно назначается
  })

  it('звук выключен в настройках → молчим', () => {
    const { ctx, calls } = makeCtx({ settingsRef: { current: { soundEnabled: false, messengerNotifs: {}, mutedMessengers: {} } } })
    createTitleUnreadHandler(ctx).handleTitleUpdated(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(1) WhatsApp' })
    expect(calls.sound).toBe(0)
  })

  it('мессенджер заглушён → молчим', () => {
    const { ctx, calls } = makeCtx({ settingsRef: { current: { soundEnabled: true, messengerNotifs: {}, mutedMessengers: { wa: true } } } })
    createTitleUnreadHandler(ctx).handleTitleUpdated(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(1) WhatsApp' })
    expect(calls.sound).toBe(0)
  })

  it('два срабатывания подряд → звук один раз (защита от частого писка)', () => {
    const { ctx, calls } = makeCtx()
    const handle = createTitleUnreadHandler(ctx).handleTitleUpdated
    handle(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(1) WhatsApp' })
    handle(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(2) WhatsApp' })
    expect(calls.sound).toBe(1)
  })

  it('уведомления вкладки ещё не «прогрелись» → ни звука, ни запасного пути', () => {
    const { ctx, calls } = makeCtx({ notifReadyRef: { current: { wa: false } } })
    createTitleUnreadHandler(ctx).handleTitleUpdated(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(1) WhatsApp' })
    expect(calls.sound).toBe(0)
    expect(calls.fallback).toBe(0)
  })
})

describe('Заголовок БЕЗ числа', () => {
  it('вкладка открыта и в фокусе → «всё прочитано», счётчик в ноль', () => {
    const { ctx, unread } = makeCtx()
    const handle = createTitleUnreadHandler(ctx).handleTitleUpdated
    handle(fakeEl('https://web.whatsapp.com'), 'wa', { title: '(3) WhatsApp' })
    handle(fakeEl('https://web.whatsapp.com'), 'wa', { title: 'WhatsApp' })
    expect(unread()).toEqual({ wa: 0 })
  })

  it('🔴 ЛОВУШКА: у Ozon НЕ обнуляем — числа в заголовке нет никогда, счётчик ведёт наш сторож', () => {
    const { ctx, unread } = makeCtx({ activeIdRef: { current: 'ozon' } })
    const handle = createTitleUnreadHandler(ctx).handleTitleUpdated
    handle(fakeEl('https://seller.ozon.ru/app/chats'), 'ozon', { title: '(7) Ozon' })
    expect(unread()).toEqual({ ozon: 7 })
    handle(fakeEl('https://seller.ozon.ru/app/chats'), 'ozon', { title: 'Ozon Seller' })
    expect(unread()).toEqual({ ozon: 7 })   // осталось 7, а НЕ 0
  })

  it('вкладка не активна или окно не в фокусе → ничего не трогаем', () => {
    const { ctx, unread } = makeCtx({ windowFocusedRef: { current: false } })
    createTitleUnreadHandler(ctx).handleTitleUpdated(fakeEl('https://web.whatsapp.com'), 'wa', { title: 'WhatsApp' })
    expect(unread()).toEqual({})
  })

  it('пустой или отсутствующий заголовок не ломает разбор', () => {
    const { ctx } = makeCtx()
    const handle = createTitleUnreadHandler(ctx).handleTitleUpdated
    expect(() => handle(fakeEl('https://web.whatsapp.com'), 'wa', {})).not.toThrow()
    expect(() => handle(fakeEl('https://web.whatsapp.com'), 'wa', { title: null })).not.toThrow()
  })
})

describe('Проводка: список связей не разошёлся', () => {
  it('🔴 ЛОВУШКА: что собирает webviewSetup.js = что разбирает модуль', () => {
    const setup = readFileSync('src/utils/webviewSetup.js', 'utf8')
    const mod = readFileSync('shared/webviewTitleUnread.js', 'utf8')

    const passed = setup.split('createTitleUnreadHandler({')[1].split('})')[0]
    const taken = mod.split('} = ctx')[0].split('const {')[1]
    const names = (txt) => new Set(txt.replace(/\/\/[^\n]*/g, '').split(',').map(x => x.trim()).filter(Boolean))

    const p = names(passed)
    const t = names(taken)
    const missing = [...t].filter(x => !p.has(x))   // модуль ждёт, а не передали → тихая поломка
    const extra = [...p].filter(x => !t.has(x))     // передали, а не используется → мусор
    expect(missing, 'НЕ передано из webviewSetup: ' + missing.join(', ')).toEqual([])
    expect(extra, 'передано зря (никто не разбирает): ' + extra.join(', ')).toEqual([])
    expect(t.size).toBeGreaterThan(20)
  })


  it('🔴 ЛОВУШКА: модуль отдаёт РОВНО ТО, что приложение реально зовёт', () => {
    // Именно этого теста не хватило в v1.2.448: модуль отдавал функцию, а приложение
    // звало `titleUnread.handleTitleUpdated(...)` → в живом окне сыпалось
    // «is not a function», а тесты были зелёными, потому что звали модуль по-своему.
    // Теперь имя метода БЕРЁТСЯ ИЗ КОДА приложения и проверяется на модуле.
    const { ctx } = makeCtx()
    const api = createTitleUnreadHandler(ctx)
    const setup = readFileSync('src/utils/webviewSetup.js', 'utf8')
    const m = setup.match(/titleUnread\.([A-Za-z0-9_]+)\s*\(/)
    expect(m, 'в webviewSetup.js не найден вызов titleUnread.<метод>(...)').toBeTruthy()
    expect(typeof api[m[1]], 'приложение зовёт titleUnread.' + m[1] + '(), а модуль такого не отдаёт').toBe('function')
  })

  it('webviewSetup.js действительно зовёт вынесенный разбор', () => {
    const setup = readFileSync('src/utils/webviewSetup.js', 'utf8')
    expect(setup).toContain("from '../../shared/webviewTitleUnread.js'")
    expect(setup).toContain('titleUnread.handleTitleUpdated(el, messengerId, e)')
  })
})
