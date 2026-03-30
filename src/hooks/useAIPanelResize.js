// useAIPanelResize.js — AI panel resize logic (drag handle)
import { useEffect, useCallback } from 'react'

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
  useEffect(() => {
    const onMove = (e) => {
      if (!isResizingRef.current) return
      const delta = resizeStartRef.current.x - e.clientX
      const newW = Math.max(240, Math.min(600, resizeStartRef.current.w + delta))
      aiWidthRef.current = newW
      if (aiPanelRef.current) {
        aiPanelRef.current.style.width = `${newW}px`
        const inner = aiPanelRef.current.firstChild
        if (inner) { inner.style.width = `${newW}px`; inner.style.minWidth = `${newW}px` }
      }
    }
    const onUp = () => {
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
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, []) // eslint-disable-line

  const startResize = useCallback((e) => {
    isResizingRef.current = true
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, w: aiWidthRef.current }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    if (aiPanelRef.current) aiPanelRef.current.style.transition = 'none'
    e.preventDefault()
  }, []) // eslint-disable-line

  return { startResize }
}
