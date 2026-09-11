// v0.95.7: тесты drag-to-resize для chat-list.
//
// v1.2.457 (TODO-40): у ширины появился ВТОРОЙ предел — доля окна (40%). Чтобы старые
// проверки математики перетаскивания остались про математику, а не про окно, они гоняются
// в заведомо ШИРОКОМ окне (там жёсткий потолок 600 наступает раньше долевого). Сам долевой
// предел проверяется отдельным блоком внизу файла.
//
// Главные контракты:
// 1. clampChatListWidth — границы [60, 600] + не больше 40% окна
// 2. isChatListCompact — порог < 200
// 3. startResize → setPointerCapture + cursor + transition:none
// 4. onPointerMove → обновление style.width напрямую (без re-render)
// 5. onPointerUp → setState + settings:save
// 6. resetToDefault → 340 + settings:save

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef, useState } from 'react'
import useChatListResize, {
  clampChatListWidth, isChatListCompact, chatListMaxPx,
  CHAT_LIST_MIN_WIDTH, CHAT_LIST_MAX_WIDTH, CHAT_LIST_DEFAULT_WIDTH, CHAT_LIST_COMPACT_THRESHOLD,
  CHAT_LIST_MAX_WINDOW_SHARE,
} from './useChatListResize.js'

// Широкое окно: 40% от 1600 = 640 > 600, значит долевой предел не мешает проверкам
// математики перетаскивания — работает прежний жёсткий потолок 600.
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

function setupHook() {
  return renderHook(() => {
    const isResizingRef = useRef(false)
    const resizeStartRef = useRef({ x: 0, w: CHAT_LIST_DEFAULT_WIDTH })
    const chatListWidthRef = useRef(CHAT_LIST_DEFAULT_WIDTH)
    const chatListRef = useRef({ style: { width: '340px', transition: '' } })
    const settingsRef = useRef({ chatListWidth: 340, other: 'preserved' })
    const [isResizing, setIsResizing] = useState(false)
    const [chatListWidth, setChatListWidth] = useState(CHAT_LIST_DEFAULT_WIDTH)
    const api = useChatListResize({
      isResizingRef, resizeStartRef, chatListWidthRef, chatListRef, settingsRef,
      setIsResizing, setChatListWidth,
    })
    return { api, isResizingRef, chatListWidthRef, chatListRef, settingsRef,
      isResizing, chatListWidth }
  })
}

describe('useChatListResize — startResize / move / up', () => {
  beforeEach(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    globalThis.window.api = { invoke: vi.fn(() => Promise.resolve({ ok: true })) }
  })

  it('startResize ставит refs + cursor + setPointerCapture', () => {
    const { result } = setupHook()
    const setPointerCapture = vi.fn()
    const event = {
      clientX: 100,
      pointerId: 1,
      currentTarget: { setPointerCapture },
      preventDefault: vi.fn(),
    }
    act(() => { result.current.api.startResize(event) })
    expect(result.current.isResizingRef.current).toBe(true)
    expect(setPointerCapture).toHaveBeenCalledWith(1)
    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')
    expect(result.current.chatListRef.current.style.transition).toBe('none')
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('onPointerMove обновляет ref + style.width (не setState)', () => {
    const { result } = setupHook()
    act(() => {
      result.current.api.startResize({
        clientX: 100, pointerId: 1,
        currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(),
      })
    })
    // Drag вправо на +60 → ширина 340 → 400
    act(() => { result.current.api.onPointerMove({ clientX: 160 }) })
    expect(result.current.chatListWidthRef.current).toBe(400)
    expect(result.current.chatListRef.current.style.width).toBe('400px')
    // chatListWidth (state) НЕ обновляется во время drag — для 60fps
    expect(result.current.chatListWidth).toBe(CHAT_LIST_DEFAULT_WIDTH)
  })

  it('onPointerMove клампит к MAX/MIN', () => {
    const { result } = setupHook()
    act(() => {
      result.current.api.startResize({
        clientX: 100, pointerId: 1,
        currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(),
      })
    })
    // Drag сильно вправо → clamp до MAX
    act(() => { result.current.api.onPointerMove({ clientX: 9999 }) })
    expect(result.current.chatListWidthRef.current).toBe(CHAT_LIST_MAX_WIDTH)
    // Drag сильно влево → clamp до MIN
    act(() => { result.current.api.onPointerMove({ clientX: -9999 }) })
    expect(result.current.chatListWidthRef.current).toBe(CHAT_LIST_MIN_WIDTH)
  })

  it('onPointerUp → setState + settings:save с обновлённым chatListWidth + other prop preserved', () => {
    const invokeSpy = vi.fn(() => Promise.resolve({ ok: true }))
    globalThis.window.api = { invoke: invokeSpy }
    const { result } = setupHook()
    act(() => {
      result.current.api.startResize({
        clientX: 100, pointerId: 1,
        currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(),
      })
    })
    act(() => { result.current.api.onPointerMove({ clientX: 200 }) })
    const releasePointerCapture = vi.fn()
    act(() => {
      result.current.api.onPointerUp({
        pointerId: 1,
        currentTarget: { releasePointerCapture },
      })
    })
    expect(result.current.isResizingRef.current).toBe(false)
    expect(result.current.chatListWidth).toBe(440)  // 340 + 100 delta
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
    expect(invokeSpy).toHaveBeenCalledWith('settings:save',
      expect.objectContaining({ chatListWidth: 440, other: 'preserved' }))
    expect(releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('resetToDefault → 340 + settings:save', () => {
    const invokeSpy = vi.fn(() => Promise.resolve({ ok: true }))
    globalThis.window.api = { invoke: invokeSpy }
    const { result } = setupHook()
    // Сначала меняем ширину
    act(() => {
      result.current.api.startResize({
        clientX: 100, pointerId: 1,
        currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(),
      })
    })
    act(() => { result.current.api.onPointerMove({ clientX: 200 }) })
    act(() => {
      result.current.api.onPointerUp({
        pointerId: 1, currentTarget: { releasePointerCapture: vi.fn() },
      })
    })
    invokeSpy.mockClear()
    // Reset
    act(() => { result.current.api.resetToDefault() })
    expect(result.current.chatListWidth).toBe(CHAT_LIST_DEFAULT_WIDTH)
    expect(result.current.chatListWidthRef.current).toBe(CHAT_LIST_DEFAULT_WIDTH)
    expect(result.current.chatListRef.current.style.width).toBe(`${CHAT_LIST_DEFAULT_WIDTH}px`)
    expect(invokeSpy).toHaveBeenCalledWith('settings:save',
      expect.objectContaining({ chatListWidth: CHAT_LIST_DEFAULT_WIDTH }))
  })

  it('onPointerMove до startResize — no-op (guard isResizingRef.current)', () => {
    const { result } = setupHook()
    act(() => { result.current.api.onPointerMove({ clientX: 9999 }) })
    expect(result.current.chatListWidthRef.current).toBe(CHAT_LIST_DEFAULT_WIDTH)
  })

  it('v0.95.9: live compact toggle ВО ВРЕМЯ drag — setState при пересечении threshold 128', () => {
    const { result } = setupHook()
    // Старт с 340px (compact=false)
    act(() => {
      result.current.api.startResize({
        clientX: 500, pointerId: 1,
        currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(),
      })
    })
    expect(result.current.chatListWidth).toBe(CHAT_LIST_DEFAULT_WIDTH)
    // Drag влево на -240 → newW = 100 (< 128 threshold) → setState срабатывает (compact toggle)
    act(() => { result.current.api.onPointerMove({ clientX: 260 }) })
    expect(result.current.chatListWidthRef.current).toBe(100)
    expect(result.current.chatListWidth).toBe(100)  // state ОБНОВЛЁН — compact mode сразу
    // Drag вправо на +40 — обратно в обычный режим (140 >= 128 → НЕ compact)
    act(() => { result.current.api.onPointerMove({ clientX: 300 }) })
    expect(result.current.chatListWidthRef.current).toBe(140)
    expect(result.current.chatListWidth).toBe(140)  // state снова обновлён
  })

  it('v0.95.9: drag БЕЗ пересечения threshold 128 НЕ обновляет state (60fps контракт)', () => {
    const { result } = setupHook()
    // Старт 340, drag к 200 (всё ещё > 128 — нет пересечения)
    act(() => {
      result.current.api.startResize({
        clientX: 500, pointerId: 1,
        currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(),
      })
    })
    act(() => { result.current.api.onPointerMove({ clientX: 360 }) })
    expect(result.current.chatListWidthRef.current).toBe(200)
    // state НЕ обновлён — нет пересечения threshold
    expect(result.current.chatListWidth).toBe(CHAT_LIST_DEFAULT_WIDTH)
  })

  it('onPointerUp до startResize — no-op (guard)', () => {
    const invokeSpy = vi.fn(() => Promise.resolve({ ok: true }))
    globalThis.window.api = { invoke: invokeSpy }
    const { result } = setupHook()
    act(() => {
      result.current.api.onPointerUp({
        pointerId: 1, currentTarget: { releasePointerCapture: vi.fn() },
      })
    })
    expect(invokeSpy).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// v1.2.457 (TODO-40): ширина списка чатов считается с размером окна.
// Ограничиваем САМО ЧИСЛО, а не вёрстку: «узкий вид» списка включается по этому же
// числу, и потолок из вёрстки рассогласовал бы их (панель узкая, строки широкие).
// ─────────────────────────────────────────────────────────────────────────────
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
