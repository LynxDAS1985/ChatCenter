// v0.95.7: тесты drag-to-resize для chat-list.
//
// Главные контракты:
// 1. clampChatListWidth — границы [60, 600]
// 2. isChatListCompact — порог < 200
// 3. startResize → setPointerCapture + cursor + transition:none
// 4. onPointerMove → обновление style.width напрямую (без re-render)
// 5. onPointerUp → setState + settings:save
// 6. resetToDefault → 340 + settings:save

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef, useState } from 'react'
import useChatListResize, {
  clampChatListWidth, isChatListCompact,
  CHAT_LIST_MIN_WIDTH, CHAT_LIST_MAX_WIDTH, CHAT_LIST_DEFAULT_WIDTH, CHAT_LIST_COMPACT_THRESHOLD,
} from './useChatListResize.js'

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

describe('isChatListCompact — порог < 160 (v0.95.8: 200→160)', () => {
  it('< COMPACT_THRESHOLD → true', () => {
    expect(isChatListCompact(60)).toBe(true)
    expect(isChatListCompact(100)).toBe(true)
    expect(isChatListCompact(159)).toBe(true)
  })

  it('>= COMPACT_THRESHOLD → false', () => {
    expect(isChatListCompact(CHAT_LIST_COMPACT_THRESHOLD)).toBe(false)
    expect(isChatListCompact(170)).toBe(false)
    expect(isChatListCompact(340)).toBe(false)
    expect(isChatListCompact(600)).toBe(false)
  })

  it('v0.95.8: 161-199 теперь НЕ compact (был < 200, стал < 160)', () => {
    expect(isChatListCompact(161)).toBe(false)
    expect(isChatListCompact(180)).toBe(false)
    expect(isChatListCompact(199)).toBe(false)
  })

  it('NaN → false (safe default — обычный режим)', () => {
    expect(isChatListCompact(NaN)).toBe(false)
    expect(isChatListCompact(undefined)).toBe(false)
  })

  it('CHAT_LIST_COMPACT_THRESHOLD === 160', () => {
    expect(CHAT_LIST_COMPACT_THRESHOLD).toBe(160)
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

  it('v0.95.8: live compact toggle ВО ВРЕМЯ drag — setState при пересечении threshold', () => {
    const { result } = setupHook()
    // Старт с 340px (compact=false)
    act(() => {
      result.current.api.startResize({
        clientX: 500, pointerId: 1,
        currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(),
      })
    })
    expect(result.current.chatListWidth).toBe(CHAT_LIST_DEFAULT_WIDTH)
    // Drag влево на -200 → newW = 140 (< 160 threshold) → setState срабатывает (compact toggle)
    act(() => { result.current.api.onPointerMove({ clientX: 300 }) })
    expect(result.current.chatListWidthRef.current).toBe(140)
    expect(result.current.chatListWidth).toBe(140)  // state ОБНОВЛЁН — compact mode сразу
    // Drag вправо на +20 — обратно в обычный режим (180 >= 160 → НЕ compact)
    act(() => { result.current.api.onPointerMove({ clientX: 340 }) })
    expect(result.current.chatListWidthRef.current).toBe(180)
    expect(result.current.chatListWidth).toBe(180)  // state снова обновлён
  })

  it('v0.95.8: drag БЕЗ пересечения threshold НЕ обновляет state (60fps контракт)', () => {
    const { result } = setupHook()
    // Старт 340, drag к 300 (всё ещё > 160 — нет пересечения)
    act(() => {
      result.current.api.startResize({
        clientX: 500, pointerId: 1,
        currentTarget: { setPointerCapture: vi.fn() }, preventDefault: vi.fn(),
      })
    })
    act(() => { result.current.api.onPointerMove({ clientX: 460 }) })
    expect(result.current.chatListWidthRef.current).toBe(300)
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
