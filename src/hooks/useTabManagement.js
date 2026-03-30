// useTabManagement.js — DnD handlers + tab click + reorder
import { useState, useCallback } from 'react'

/**
 * @param {Object} deps
 * @param {React.MutableRefObject} deps.webviewRefs
 * @param {React.MutableRefObject} deps.activeIdRef
 * @param {React.MutableRefObject} deps.dragStartId - ref for drag source id
 * @param {React.MutableRefObject} deps.notifCountRef
 * @param {React.MutableRefObject} deps.windowFocusedRef
 * @param {Function} deps.setActiveId
 * @param {Function} deps.setMessengers
 * @param {Function} deps.setNewMessageIds
 * @param {Function} deps.setUnreadCounts
 * @param {string} deps.searchText
 * @param {boolean} deps.searchVisible
 */
export default function useTabManagement({
  webviewRefs, activeIdRef, dragStartId, notifCountRef, windowFocusedRef,
  setActiveId, setMessengers, setNewMessageIds, setUnreadCounts,
  searchText, searchVisible,
}) {
  const [dragOverId, setDragOverId] = useState(null)

  const handleTabClick = useCallback((id) => {
    setActiveId(id)
    // v0.72.5: Reset fallback Notification count when viewing tab
    notifCountRef.current[id] = 0
    // Remove animation when clicking on tab
    setNewMessageIds(prev => { const n = new Set(prev); n.delete(id); return n })
    if (searchVisible && searchText) {
      setTimeout(() => { webviewRefs.current[id]?.findInPage(searchText) }, 200)
    }
  }, [searchVisible, searchText]) // eslint-disable-line

  const handleDragStart = useCallback((id) => { dragStartId.current = id }, []) // eslint-disable-line
  const handleDragOver = useCallback((id) => { setDragOverId(id) }, [])
  const handleDrop = useCallback((id) => {
    const fromId = dragStartId.current
    if (!fromId || fromId === id) { setDragOverId(null); dragStartId.current = null; return }
    setMessengers(prev => {
      const list = [...prev]
      const fi = list.findIndex(m => m.id === fromId)
      const ti = list.findIndex(m => m.id === id)
      if (fi < 0 || ti < 0) return prev
      const [item] = list.splice(fi, 1)
      list.splice(ti, 0, item)
      return list
    })
    setDragOverId(null)
    dragStartId.current = null
  }, []) // eslint-disable-line
  const handleDragEnd = useCallback(() => { setDragOverId(null); dragStartId.current = null }, []) // eslint-disable-line

  return { handleDragStart, handleDragOver, handleDrop, handleDragEnd, handleTabClick, dragOverId }
}
