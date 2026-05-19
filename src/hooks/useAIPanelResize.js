// useAIPanelResize.js — AI panel resize logic (drag handle).
// v0.89.38: переведено с устаревших mouse events на Pointer Events API (W3C 2018+).
// Документация: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
//
// setPointerCapture гарантирует доставку всех pointer-событий на divider до
// pointerup — поддержка mouse/touch/pen в едином API.
//
// Важно для Electron: события мыши НЕ пересекают границу <webview>
// (https://www.electronjs.org/docs/latest/api/webview-tag — webview = OOP iframe).
// Поэтому в App.jsx дополнительно показывается глобальный fixed overlay над
// всеми webview во время resize — без него pointerup мог застрять в webview.
import { useCallback } from 'react'

/**
 * @param {Object} deps
 * @param {React.MutableRefObject} deps.isResizingRef
 * @param {React.MutableRefObject} deps.resizeStartRef
 * @param {React.MutableRefObject} deps.aiWidthRef
 * @param {React.MutableRefObject} deps.aiPanelRef
 * @param {React.MutableRefObject} deps.settingsRef
 * @param {Function} deps.setIsResizing
 * @param {Function} deps.setAiWidth
 * @param {Function} deps.setSettings
 */
export default function useAIPanelResize({
  isResizingRef, resizeStartRef, aiWidthRef, aiPanelRef, settingsRef,
  setIsResizing, setAiWidth, setSettings,
}) {
  const onPointerMove = useCallback((e) => {
    if (!isResizingRef.current) return
    const delta = resizeStartRef.current.x - e.clientX
    const newW = Math.max(240, Math.min(600, resizeStartRef.current.w + delta))
    aiWidthRef.current = newW
    if (aiPanelRef.current) {
      aiPanelRef.current.style.width = `${newW}px`
      const inner = aiPanelRef.current.firstChild
      if (inner) { inner.style.width = `${newW}px`; inner.style.minWidth = `${newW}px` }
    }
  }, [isResizingRef, resizeStartRef, aiWidthRef, aiPanelRef])

  const onPointerUp = useCallback((e) => {
    if (!isResizingRef.current) return
    isResizingRef.current = false
    setIsResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    const newW = aiWidthRef.current
    setAiWidth(newW)
    const updated = { ...settingsRef.current, aiSidebarWidth: newW }
    setSettings(updated)
    window.api?.invoke('settings:save', updated).catch(() => {})
    if (aiPanelRef.current) aiPanelRef.current.style.transition = ''
    // releasePointerCapture не обязателен: pointerup автоматически освобождает
    // capture (см. MDN setPointerCapture). Но для надёжности (lostpointercapture)
    // защищаемся try/catch — если capture уже снят, метод бросает.
    try { e.currentTarget?.releasePointerCapture?.(e.pointerId) } catch (_) {}
  }, [isResizingRef, aiWidthRef, aiPanelRef, settingsRef, setIsResizing, setAiWidth, setSettings])

  const startResize = useCallback((e) => {
    isResizingRef.current = true
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, w: aiWidthRef.current }
    // W3C стандарт: захватываем pointer на divider — события гарантированно
    // приходят на этот элемент до pointerup (в пределах одного документа).
    // Для Electron webview граница не пересекается — это закрывает глобальный
    // overlay в App.jsx (см. data-cc-resize-overlay).
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    if (aiPanelRef.current) aiPanelRef.current.style.transition = 'none'
    e.preventDefault()
  }, [isResizingRef, resizeStartRef, aiWidthRef, aiPanelRef, setIsResizing])

  return { startResize, onPointerMove, onPointerUp }
}
