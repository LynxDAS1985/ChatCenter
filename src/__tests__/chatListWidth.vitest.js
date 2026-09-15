// chatListWidth.vitest.js — v1.2.460
//
// Чистые расчёты ширины списка чатов: границы [60, 600], потолок «не шире 40 % окна»,
// порог «узкого вида» (одни аватарки). Ни React, ни страницы — только числа.
//
// Раньше эти проверки жили внутри теста перетаскивания
// (src/native/hooks/useChatListResize.vitest.jsx). Разъехались вместе с кодом в v1.2.460:
// расчёты переехали в shared/chatListWidth.js, а в том тесте осталось только перетаскивание.
//
// Соседний по смыслу файл — panelWidthCap.vitest.js (то же самое, но про панель ИИ).
import { describe, it, expect, beforeEach } from 'vitest'
import {
  clampChatListWidth, isChatListCompact, chatListMaxPx,
  CHAT_LIST_MIN_WIDTH, CHAT_LIST_MAX_WIDTH, CHAT_LIST_DEFAULT_WIDTH,
  CHAT_LIST_COMPACT_THRESHOLD, CHAT_LIST_MAX_WINDOW_SHARE,
} from '../../shared/chatListWidth.js'

// Широкое окно: 40 % от 1600 = 640 > 600, значит долевой предел не мешает проверкам
// обычных границ — работает прежний жёсткий потолок 600.
const WIDE = 1600
beforeEach(() => { try { window.innerWidth = WIDE } catch { /* среда не даёт — ок */ } })

describe('clampChatListWidth — границы [60, 600]', () => {
  it('возвращает значение если в диапазоне', () => {
    expect(clampChatListWidth(340)).toBe(340)
    expect(clampChatListWidth(200)).toBe(200)
  })

  it('clamp снизу до MIN_WIDTH', () => {
    expect(clampChatListWidth(30)).toBe(CHAT_LIST_MIN_WIDTH)
    expect(clampChatListWidth(0)).toBe(CHAT_LIST_MIN_WIDTH)
    expect(clampChatListWidth(-100)).toBe(CHAT_LIST_MIN_WIDTH)
  })

  it('clamp сверху до MAX_WIDTH', () => {
    expect(clampChatListWidth(700)).toBe(CHAT_LIST_MAX_WIDTH)
    expect(clampChatListWidth(99999)).toBe(CHAT_LIST_MAX_WIDTH)
  })

  it('NaN / undefined → default', () => {
    expect(clampChatListWidth(NaN)).toBe(CHAT_LIST_DEFAULT_WIDTH)
    expect(clampChatListWidth(undefined)).toBe(CHAT_LIST_DEFAULT_WIDTH)
  })

  it('экстремумы — точные значения', () => {
    expect(clampChatListWidth(CHAT_LIST_MIN_WIDTH)).toBe(CHAT_LIST_MIN_WIDTH)
    expect(clampChatListWidth(CHAT_LIST_MAX_WIDTH)).toBe(CHAT_LIST_MAX_WIDTH)
  })
})

describe('isChatListCompact — порог < 128 (v0.95.9: 200→160→128)', () => {
  it('< COMPACT_THRESHOLD → true', () => {
    expect(isChatListCompact(60)).toBe(true)
    expect(isChatListCompact(100)).toBe(true)
    expect(isChatListCompact(127)).toBe(true)
  })

  it('>= COMPACT_THRESHOLD → false', () => {
    expect(isChatListCompact(CHAT_LIST_COMPACT_THRESHOLD)).toBe(false)
    expect(isChatListCompact(140)).toBe(false)
    expect(isChatListCompact(340)).toBe(false)
    expect(isChatListCompact(600)).toBe(false)
  })

  it('v0.95.9: 128-199 теперь НЕ compact (порог 128, не 160 и не 200)', () => {
    expect(isChatListCompact(128)).toBe(false)
    expect(isChatListCompact(160)).toBe(false)
    expect(isChatListCompact(180)).toBe(false)
    expect(isChatListCompact(199)).toBe(false)
  })

  it('NaN → false (safe default — обычный режим)', () => {
    expect(isChatListCompact(NaN)).toBe(false)
    expect(isChatListCompact(undefined)).toBe(false)
  })

  it('CHAT_LIST_COMPACT_THRESHOLD === 128', () => {
    expect(CHAT_LIST_COMPACT_THRESHOLD).toBe(128)
  })
})

describe('предел ширины списка чатов от размера окна', () => {
  it('в широком окне действует прежний жёсткий потолок 600', () => {
    expect(chatListMaxPx(1600)).toBe(CHAT_LIST_MAX_WIDTH)
    expect(clampChatListWidth(5000, 1600)).toBe(CHAT_LIST_MAX_WIDTH)
  })

  it('в окне поуже предел считается от окна — 40%', () => {
    expect(chatListMaxPx(1000)).toBe(400)
    expect(clampChatListWidth(600, 1000)).toBe(400)
  })

  it('на самом узком возможном окне (900 — меньше Windows не даст) это 360', () => {
    // Факт: minWidth: 900 в main/utils/windowManager.js.
    expect(chatListMaxPx(900)).toBe(360)
  })

  it('🔴 потолок НИКОГДА не загоняет список в «узкий вид» сам по себе', () => {
    // Иначе вышло бы худшее: панель ужалась, а строки внутри остались широкими.
    // 360 (самое узкое окно) заметно больше порога узкого вида (128).
    expect(chatListMaxPx(900)).toBeGreaterThan(CHAT_LIST_COMPACT_THRESHOLD)
    expect(isChatListCompact(chatListMaxPx(900))).toBe(false)
  })

  it('ширина окна неизвестна — ведём себя как раньше (потолок 600)', () => {
    expect(chatListMaxPx(undefined)).toBe(CHAT_LIST_MAX_WIDTH)
    expect(chatListMaxPx(NaN)).toBe(CHAT_LIST_MAX_WIDTH)
    expect(chatListMaxPx(0)).toBe(CHAT_LIST_MAX_WIDTH)
  })

  it('доля окна задана одним числом, а не зашита в формулу', () => {
    expect(CHAT_LIST_MAX_WINDOW_SHARE).toBe(0.4)
    expect(chatListMaxPx(1000)).toBe(Math.floor(1000 * CHAT_LIST_MAX_WINDOW_SHARE))
  })

  it('без явной ширины окна берётся текущее окно', () => {
    window.innerWidth = 1000
    expect(clampChatListWidth(600)).toBe(400)
    window.innerWidth = WIDE
  })

  it('нижняя граница сильнее потолка: узкое окно не делает список уже минимума', () => {
    expect(chatListMaxPx(100)).toBe(CHAT_LIST_MIN_WIDTH)
    expect(clampChatListWidth(300, 100)).toBe(CHAT_LIST_MIN_WIDTH)
  })
})
