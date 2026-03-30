// useKeyboardShortcuts.js — Ctrl+ hotkeys for App.jsx
import { useEffect } from 'react'

/**
 * @param {Object} deps
 * @param {React.MutableRefObject} deps.messengersRef
 * @param {React.MutableRefObject} deps.activeIdRef
 * @param {React.MutableRefObject} deps.settingsRef
 * @param {React.MutableRefObject} deps.zoomLevelsRef
 * @param {Function} deps.setShowAddModal
 * @param {Function} deps.setShowSettings
 * @param {Function} deps.setActiveId
 * @param {Function} deps.toggleSearch
 * @param {Function} deps.askRemoveMessenger
 * @param {Function} deps.saveZoomLevels
 * @param {Function} deps.animateZoom
 * @param {Function} deps.setZoomLevels
 * @param {React.MutableRefObject} deps.searchInputRef
 */
export default function useKeyboardShortcuts({
  messengersRef, activeIdRef, settingsRef, zoomLevelsRef,
  setShowAddModal, setShowSettings, setActiveId, toggleSearch,
  askRemoveMessenger, saveZoomLevels, animateZoom, setZoomLevels,
  searchInputRef,
}) {
  useEffect(() => {
    const handler = (e) => {
      if (!e.ctrlKey) return
      const ms = messengersRef.current
      const aid = activeIdRef.current

      if (e.key >= '1' && e.key <= '9') {
        const m = ms[parseInt(e.key) - 1]
        if (m) { setActiveId(m.id); e.preventDefault() }
      } else if ((e.key === 't' || e.key === 'T') && !e.shiftKey) {
        setShowAddModal(true); e.preventDefault()
      } else if (e.key === 'w' || e.key === 'W') {
        if (aid && !(settingsRef.current.pinnedTabs || {})[aid]) { askRemoveMessenger(aid); e.preventDefault() }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleSearch(); e.preventDefault()
      } else if (e.key === ',') {
        setShowSettings(true); e.preventDefault()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const idx = ms.findIndex(m => m.id === aid)
        const len = ms.length
        if (len < 2) return
        const next = e.shiftKey ? (idx - 1 + len) % len : (idx + 1) % len
        setActiveId(ms[next].id)
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        const clamped = Math.min(200, Math.round((cur + 10) / 5) * 5)
        setZoomLevels(prev => { const next = { ...prev, [aid]: clamped }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, clamped)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        const clamped = Math.max(25, Math.round((cur - 10) / 5) * 5)
        setZoomLevels(prev => { const next = { ...prev, [aid]: clamped }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, clamped)
      } else if (e.key === '0') {
        e.preventDefault()
        const cur = zoomLevelsRef.current[aid] || 100
        setZoomLevels(prev => { const next = { ...prev, [aid]: 100 }; saveZoomLevels(next); return next })
        animateZoom(aid, cur, 100)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line
}
