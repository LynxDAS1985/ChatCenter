// v1.2.318: тест чистого решения дедупа уведомлений (main/handlers/notifDedupDecision.js).
// Главное — воспроизведение бага «двойное VK-уведомление» и защита нативного Telegram.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decideNotifDedup, normalizeScopePart, findCardToImproveIcon } from '../../main/handlers/notifDedupDecision.js'

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

// =================================================================================================
// v1.2.474 — ЖАЛОБА 2026-09-17: на ОДНО сообщение МАКСа пришли ДВЕ карточки, причём на одной было
// фото отправителя, а на другой — логотип мессенджера.
//
// Журнал (15:25:04) показал обе копии одного сообщения «Жди оплату»:
//   • быстрый наблюдатель — БЕЗ номера сообщения, метка `sender:…`, фото из нашего кэша (готовая
//     картинка) → карточка с фото;
//   • наблюдатель списка чатов — с событийным номером `max-sidebar:…`, метка `mid:…`, фото только
//     ССЫЛКОЙ → карточка показалась с логотипом.
// Кросс-ключ «мессенджер+отправитель+текст» поймал бы пару, но для MAX он был выключен ЦЕЛИКОМ —
// в том числе на чтение. Первая копия ключ положила, вторая его не посмотрела.
//
// Лечение: копия MAX кросс-ключ СМОТРИТ, но НЕ КЛАДЁТ, и при совпадении СЪЕДАЕТ (одноразово).
// =================================================================================================
describe('MAX: одно сообщение через две двери — одна карточка (v1.2.474)', () => {
  /** Копия из быстрого наблюдателя: номера сообщения нет. */
  const quick = (map, now, body = 'Жди оплату') => decideNotifDedup({
    dedupScope: 'custom_1:sender:цывилько дмитрий николаевич:цывилько дмитрий николаевич',
    messengerId: 'custom_1', senderName: 'Цывилько Дмитрий Николаевич', title: '',
    normalizedBody: body, body, messageId: '', now, dedupMap: map,
  })
  /** Копия из списка чатов: событийный номер max-sidebar. */
  const sidebar = (map, now, unread = 1, body = 'Жди оплату') => decideNotifDedup({
    dedupScope: 'mid:max-sidebar:цывилько дмитрий николаевич:' + unread,
    messengerId: 'custom_1', senderName: 'Цывилько Дмитрий Николаевич', title: '',
    normalizedBody: body, body, messageId: 'max-sidebar:цывилько дмитрий николаевич:' + unread,
    now, dedupMap: map,
  })

  it('[!] ГЛАВНОЕ: вторая копия того же сообщения признана дублем', () => {
    const map = new Map()
    const r1 = quick(map, 1000)
    expect(r1.duplicate).toBe(false)
    for (const k of r1.keysToSet) map.set(k, 1000)
    const r2 = sidebar(map, 1300)
    expect(r2.duplicate, 'вторая карточка появляться не должна').toBe(true)
    expect(r2.reason).toMatch(/другой двери/)
    expect(r2.consumeKey, 'ключ должен быть одноразовым').toBeTruthy()
  })

  it('[!] ЛОВУШКА: после склейки СЛЕДУЮЩЕЕ такое же сообщение снова показывается', () => {
    const map = new Map()
    const r1 = quick(map, 1000)
    for (const k of r1.keysToSet) map.set(k, 1000)
    const r2 = sidebar(map, 1300)
    map.delete(r2.consumeKey)                       // так делает notificationManager
    // второе сообщение с тем же текстом — быструю копию гасит обычный ключ (так было и раньше),
    // а копия из списка чатов ОБЯЗАНА показаться, иначе человек не узнает о новом сообщении
    const r3 = sidebar(map, 6000, 2)
    expect(r3.duplicate, 'второе сообщение обязано показаться').toBe(false)
  })

  it('[!] ЛОВУШКА: копия MAX кросс-ключ НЕ КЛАДЁТ (иначе слиплись бы два одинаковых подряд)', () => {
    const map = new Map()
    const r = sidebar(map, 1000)
    expect(r.duplicate).toBe(false)
    expect(r.keysToSet, 'только свой ключ, без кросс-ключа').toHaveLength(1)
    expect(r.keysToSet[0]).toContain('mid:max-sidebar:')
  })

  it('два ОДИНАКОВЫХ сообщения подряд только из списка чатов — обе карточки (защита v1.2.55 цела)', () => {
    const map = new Map()
    const r1 = sidebar(map, 1000, 1)
    for (const k of r1.keysToSet) map.set(k, 1000)
    const r2 = sidebar(map, 1800, 2)
    expect(r2.duplicate).toBe(false)
  })

  it('ВК не затронут: у него одноразовости нет, кросс-ключ работает как раньше', () => {
    const map = new Map()
    const r1 = decideNotifDedup({ dedupScope: 'vk:sender:c:alejandro', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Ёу', body: 'Ёу', messageId: '', now: 1000, dedupMap: map })
    for (const k of r1.keysToSet) map.set(k, 1000)
    const r2 = decideNotifDedup({ dedupScope: 'mid:fp777', messengerId: 'vk', senderName: 'Alejandro', title: '', normalizedBody: 'Ёу', body: 'Ёу', messageId: 'fp777', now: 1300, dedupMap: map })
    expect(r2.duplicate).toBe(true)
    expect(r2.consumeKey, 'у ВК ключ одноразовым не становится').toBeFalsy()
  })
})

// =================================================================================================
// v1.2.474 — ФОТО НЕ ТЕРЯЕТСЯ. Погашенная копия могла нести фото, которого нет у оставшейся
// карточки (жалоба 2026-09-17: одна карточка с фото, другая с логотипом). Теперь фото досылают
// в уже показанную карточку — эта функция решает, какой именно карточке оно нужно.
// =================================================================================================
describe('findCardToImproveIcon (v1.2.474)', () => {
  const card = (o) => ({ id: '1', messengerId: 'custom_1', senderName: 'Иван', body: 'Жди оплату', ...o })
  const who = { messengerId: 'custom_1', senderName: 'Иван', title: '', body: 'Жди оплату' }

  it('[!] ГЛАВНОЕ: карточка без фото найдена — ей и дошлём', () => {
    expect(findCardToImproveIcon([card({ id: '119' })], who)).toBe('119')
  })

  it('фото уже есть → улучшать нечего', () => {
    expect(findCardToImproveIcon([card({ id: '119', iconDataUrl: 'data:image/png;base64,AAA' })], who)).toBe(null)
  })

  it('берём САМУЮ СВЕЖУЮ подходящую карточку', () => {
    expect(findCardToImproveIcon([card({ id: '10' }), card({ id: '11' })], who)).toBe('11')
  })

  it('[!] ЛОВУШКА: чужого отправителя и чужой мессенджер не трогаем', () => {
    expect(findCardToImproveIcon([card({ id: '5', senderName: 'Пётр' })], who)).toBe(null)
    expect(findCardToImproveIcon([card({ id: '6', messengerId: 'vk' })], who)).toBe(null)
    expect(findCardToImproveIcon([card({ id: '7', body: 'другой текст' })], who)).toBe(null)
  })

  it('пустой список и мусор не роняют', () => {
    expect(findCardToImproveIcon([], who)).toBe(null)
    expect(findCardToImproveIcon(null, who)).toBe(null)
    expect(findCardToImproveIcon([null, undefined], who)).toBe(null)
  })

  it('имя сравнивается без учёта регистра и лишних пробелов', () => {
    expect(findCardToImproveIcon([card({ id: '9', senderName: '  иван  ' })], who)).toBe('9')
  })
})

// v1.2.474: проводка. Чистое решение бесполезно, если менеджер уведомлений его не применяет —
// а это невидимо для проверок выше. Страж ловит молчаливое удаление связки.
describe('проводка склейки и досылки фото (v1.2.474)', () => {
  const src = readFileSync('main/handlers/notificationManager.js', 'utf8')

  it('[!] ЛОВУШКА: менеджер съедает одноразовый ключ MAX', () => {
    expect(src).toContain('notifDedupMap.delete(dedupDecision.consumeKey)')
  })

  it('[!] ЛОВУШКА: погашенная копия отдаёт своё фото уже показанной карточке', () => {
    expect(src).toContain('improveIconOnExistingCard({ messengerId, senderName, title, body, iconUrl, iconDataUrl: preDataUrl })')
  })

  it('[!] ЛОВУШКА: загрузка фото по ссылке больше не немая', () => {
    expect(src).toContain('[notif-icon] фото НЕ загрузилось')
    expect(src).toContain('[notif-icon] фото подставлено в карточку')
  })

  it('причина пропуска дубля попадает в журнал', () => {
    expect(src).toContain(" причина=' + (dedupDecision.reason")
  })
})
