// useWebViewZoom.js — Zoom functions + apply on tab switch
import { useEffect, useCallback } from 'react'

/**
 * @param {Object} deps
 * @param {React.MutableRefObject} deps.webviewRefs
 * @param {React.MutableRefObject} deps.zoomLevelsRef
 * @param {React.MutableRefObject} deps.zoomSaveTimer
 * @param {React.MutableRefObject} deps.settingsRef
 * @param {string|null} deps.activeId
 * @param {Object} deps.zoomLevels
 * @param {Function} deps.setZoomLevels
 */
export default function useWebViewZoom({
  webviewRefs, zoomLevelsRef, zoomSaveTimer, settingsRef,
  activeId, zoomLevels, setZoomLevels,
}) {
  const applyZoom = useCallback((id, pct) => {
    try { webviewRefs.current[id]?.setZoomFactor(pct / 100) } catch {}
  }, []) // eslint-disable-line

  // Smooth zoom animation (ease-out, ~6 frames)
  const animateZoom = useCallback((id, from, to) => {
    if (from === to) { applyZoom(id, to); return }
    const steps = 6
    let step = 0
    const tick = () => {
      step++
      const t = step / steps
      const eased = 1 - Math.pow(1 - t, 2)
      const val = from + (to - from) * eased
      try { webviewRefs.current[id]?.setZoomFactor(val / 100) } catch {}
      if (step < steps) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, []) // eslint-disable-line

  const saveZoomLevels = useCallback((next) => {
    clearTimeout(zoomSaveTimer.current)
    zoomSaveTimer.current = setTimeout(() => {
      const updated = { ...settingsRef.current, zoomLevels: next }
      settingsRef.current = updated
      window.api?.invoke('settings:save', updated).catch(() => {})
    }, 800)
  }, []) // eslint-disable-line

  const changeZoom = useCallback((pct) => {
    if (!activeId) return
    const from = zoomLevelsRef.current[activeId] || 100
    const clamped = Math.max(25, Math.min(200, Math.round(pct / 5) * 5))
    setZoomLevels(prev => {
      const next = { ...prev, [activeId]: clamped }
      saveZoomLevels(next)
      return next
    })
    animateZoom(activeId, from, clamped)
  }, [activeId]) // eslint-disable-line

  // Apply saved zoom when switching tabs
  useEffect(() => {
    if (!activeId) return
    const zoom = zoomLevelsRef.current[activeId] || 100
    const t = setTimeout(() => applyZoom(activeId, zoom), 60)
    return () => clearTimeout(t)
  }, [activeId]) // eslint-disable-line

  return { changeZoom, applyZoom, animateZoom, saveZoomLevels, zoomLevels, setZoomLevels }
}
