// v0.95.7: drag-to-resize для разделителя chat-list ↔ окно чата.
//
// Эталон — useAIPanelResize.js (Pointer Events API, W3C 2018+, setPointerCapture).
// Документация: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
//
// Direct DOM mutation на style.width во время drag — НЕТ re-render React'а на
// каждый pointermove → 60fps без просадки. setState + settings:save только на
// pointerup (финальная фиксация).
//
// Diapason: 60px (узкий compact с одними аватарками) — 600px (полный список).
// При width < 200px chat-list переключается в compact mode (см. ChatListItem).
//
// Persistence: settings.chatListWidth через IPC settings:save (тот же канал,
// что aiSidebarWidth).
//
// Double-click на handle → reset к default (340px).

import { useCallback } from 'react'

export const CHAT_LIST_MIN_WIDTH = 60
export const CHAT_LIST_MAX_WIDTH = 600
export const CHAT_LIST_DEFAULT_WIDTH = 340
// v0.95.8: порог 200 → 160 по запросу юзера (слишком рано схлопывалось в значки).
// Compact включается когда юзер сжал до ~160px — раньше было ~200px.
export const CHAT_LIST_COMPACT_THRESHOLD = 160

export function clampChatListWidth(w) {
  if (!Number.isFinite(w)) return CHAT_LIST_DEFAULT_WIDTH
  return Math.max(CHAT_LIST_MIN_WIDTH, Math.min(CHAT_LIST_MAX_WIDTH, w))
}

export function isChatListCompact(width) {
  return Number.isFinite(width) && width < CHAT_LIST_COMPACT_THRESHOLD
}

export default function useChatListResize({
  isResizingRef, resizeStartRef, chatListWidthRef, chatListRef, settingsRef,
  setIsResizing, setChatListWidth,
}) {
  const onPointerMove = useCallback((e) => {
    if (!isResizingRef.current) return
    // Drag вправо — увеличиваем ширину (handle на правом краю chat-list'а).
    const delta = e.clientX - resizeStartRef.current.x
    const newW = clampChatListWidth(resizeStartRef.current.w + delta)
    const prevW = chatListWidthRef.current
    chatListWidthRef.current = newW
    if (chatListRef.current) {
      chatListRef.current.style.width = `${newW}px`
    }
    // v0.95.8: live compact toggle ВО ВРЕМЯ drag. setState только при пересечении
    // threshold (не каждый pixel) — 60fps сохраняется, React re-render лишь 1 раз
    // когда compact ON или OFF переключается. Юзер видит переход сразу, не после
    // отпускания мыши.
    const wasCompact = isChatListCompact(prevW)
    const isCompact = isChatListCompact(newW)
    if (wasCompact !== isCompact) {
      setChatListWidth(newW)
    }
  }, [isResizingRef, resizeStartRef, chatListWidthRef, chatListRef, setChatListWidth])

  const onPointerUp = useCallback((e) => {
    if (!isResizingRef.current) return
    isResizingRef.current = false
    setIsResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    const newW = chatListWidthRef.current
    setChatListWidth(newW)
    if (settingsRef?.current) {
      const updated = { ...settingsRef.current, chatListWidth: newW }
      settingsRef.current = updated
      try { window.api?.invoke('settings:save', updated) } catch (_) {}
    }
    if (chatListRef.current) chatListRef.current.style.transition = ''
    try { e.currentTarget?.releasePointerCapture?.(e.pointerId) } catch (_) {}
  }, [isResizingRef, chatListWidthRef, chatListRef, settingsRef, setIsResizing, setChatListWidth])

  const startResize = useCallback((e) => {
    isResizingRef.current = true
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, w: chatListWidthRef.current }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    if (chatListRef.current) chatListRef.current.style.transition = 'none'
    e.preventDefault()
  }, [isResizingRef, resizeStartRef, chatListWidthRef, chatListRef, setIsResizing])

  const resetToDefault = useCallback(() => {
    chatListWidthRef.current = CHAT_LIST_DEFAULT_WIDTH
    setChatListWidth(CHAT_LIST_DEFAULT_WIDTH)
    if (chatListRef.current) chatListRef.current.style.width = `${CHAT_LIST_DEFAULT_WIDTH}px`
    if (settingsRef?.current) {
      const updated = { ...settingsRef.current, chatListWidth: CHAT_LIST_DEFAULT_WIDTH }
      settingsRef.current = updated
      try { window.api?.invoke('settings:save', updated) } catch (_) {}
    }
  }, [chatListWidthRef, chatListRef, settingsRef, setChatListWidth])

  return { startResize, onPointerMove, onPointerUp, resetToDefault }
}
