// v1.2.165: drag-to-resize левого рейла аккаунтов. Эталон — useChatListResize.js
// (Pointer Events, setPointerCapture). Отличия: макс. ширина = текущая 76px (по просьбе
// пользователя — только сузить, не расширить); значки/аватарки масштабируются от ширины,
// поэтому setRailWidth зовём на каждый шаг (рейл маленький, 2–5 аватарок → дёшево).
// Persistence — localStorage (ключ cc-native-rail-width), как pinned/фильтр аккаунтов.
import { useCallback } from 'react'

export const RAIL_MAX_WIDTH = 76           // = текущая ширина (максимум, зафиксирован)
export const RAIL_MIN_WIDTH = 44           // минимум — влезает уменьшенный кружок
export const RAIL_DEFAULT_WIDTH = 76
export const RAIL_LABEL_HIDE_THRESHOLD = 64 // уже этого — прячем подписи-имена (только кружки)
const KEY = 'cc-native-rail-width'

export function clampRailWidth(w) {
  if (!Number.isFinite(w)) return RAIL_DEFAULT_WIDTH
  return Math.max(RAIL_MIN_WIDTH, Math.min(RAIL_MAX_WIDTH, w))
}
export function isRailNarrow(w) { return Number.isFinite(w) && w < RAIL_LABEL_HIDE_THRESHOLD }
export function loadRailWidth() {
  try { return clampRailWidth(parseInt(localStorage.getItem(KEY), 10)) } catch (_) { return RAIL_DEFAULT_WIDTH }
}
export function saveRailWidth(w) {
  try { localStorage.setItem(KEY, String(clampRailWidth(w))) } catch (_) {}
}

export default function useAccountRailResize({ isResizingRef, resizeStartRef, railWidthRef, setRailWidth, setIsResizing }) {
  const onPointerMove = useCallback((e) => {
    if (!isResizingRef.current) return
    const newW = clampRailWidth(resizeStartRef.current.w + (e.clientX - resizeStartRef.current.x))
    railWidthRef.current = newW
    setRailWidth(newW) // масштаб значков считается из ширины → нужен ре-рендер на каждый шаг
  }, [isResizingRef, resizeStartRef, railWidthRef, setRailWidth])

  const onPointerUp = useCallback((e) => {
    if (!isResizingRef.current) return
    isResizingRef.current = false
    setIsResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    saveRailWidth(railWidthRef.current)
    try { e.currentTarget?.releasePointerCapture?.(e.pointerId) } catch (_) {}
  }, [isResizingRef, railWidthRef, setIsResizing])

  const startResize = useCallback((e) => {
    isResizingRef.current = true
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, w: railWidthRef.current }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [isResizingRef, resizeStartRef, railWidthRef, setIsResizing])

  const resetToDefault = useCallback(() => {
    railWidthRef.current = RAIL_DEFAULT_WIDTH
    setRailWidth(RAIL_DEFAULT_WIDTH)
    saveRailWidth(RAIL_DEFAULT_WIDTH)
  }, [railWidthRef, setRailWidth])

  return { startResize, onPointerMove, onPointerUp, resetToDefault }
}
