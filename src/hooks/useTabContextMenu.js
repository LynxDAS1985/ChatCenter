// useTabContextMenu.js — Context menu logic + diagnostic scripts
// v0.87.103: диагностика (handleTabContextAction_diag) вынесена в tabContextMenuDiag.js
import { useState, useCallback } from 'react'
import { runTabDiag } from './tabContextMenuDiag.js'

/**
 * @param {Object} deps
 * @param {React.MutableRefObject} deps.webviewRefs
 * @param {React.MutableRefObject} deps.messengersRef
 * @param {React.MutableRefObject} deps.settingsRef
 * @param {React.MutableRefObject} deps.pipelineTraceRef
 * @param {Array} deps.messengers
 * @param {Object} deps.settings
 * @param {Function} deps.setMonitorStatus
 * @param {Function} deps.setNotifLogModal
 * @param {Function} deps.setNotifLogTab
 * @param {Function} deps.setEditingMessenger
 * @param {Function} deps.setSettings
 * @param {Function} deps.askRemoveMessenger
 * @param {Function} deps.traceNotif
 * @param {Function} deps.handleNewMessage
 */
export default function useTabContextMenu({
  webviewRefs, messengersRef, settingsRef, pipelineTraceRef,
  messengers, settings,
  setMonitorStatus, setNotifLogModal, setNotifLogTab, setEditingMessenger, setSettings,
  askRemoveMessenger, traceNotif, handleNewMessage,
}) {
  const [contextMenuTab, setContextMenuTab] = useState(null) // { id, x, y }

  // v0.87.103: тонкая обёртка над runTabDiag
  const handleTabContextAction_diag = useCallback((action, mid, wv) => {
    runTabDiag(action, mid, wv, { messengersRef, setNotifLogModal })
  }, [])

  // Pin/unpin tab
  const togglePinTab = useCallback((id) => {
    const cur = settingsRef.current.pinnedTabs || {}
    const next = { ...cur }
    if (next[id]) { delete next[id] } else { next[id] = true }
    const updated = { ...settingsRef.current, pinnedTabs: next }
    settingsRef.current = updated
    setSettings(updated)
    window.api?.invoke('settings:save', updated).catch(() => {})
  }, [])

  const handleTabContextAction = useCallback((action) => {
    const id = contextMenuTab?.id
    setContextMenuTab(null)
    if (!id) return
    const wv = webviewRefs.current[id]
    if (action === 'reload') {
      if (wv) { try { wv.reload() } catch {} }
      setMonitorStatus(prev => ({ ...prev, [id]: 'loading' }))
    } else if (action === 'diag') {
      if (wv) { try { wv.send('run-diagnostics') } catch {} }
    } else if (action === 'notifLog') {
      if (wv) {
        const trace = pipelineTraceRef.current.filter(e => !e.mid || e.mid === id)
        wv.executeJavaScript(`(function() { return JSON.stringify(window.__cc_notif_log || []); })()`)
          .then(json => {
            try {
              const log = JSON.parse(json)
              const mInfo = messengers.find(x => x.id === id)
              setNotifLogModal({ messengerId: id, name: mInfo?.name || id, log, trace })
              setNotifLogTab('log')
            } catch {}
          })
          .catch(() => {
            setNotifLogModal({ messengerId: id, name: id, log: [], trace })
            setNotifLogTab('log')
          })
      }
    } else if (action === 'copyUrl') {
      const m = messengers.find(x => x.id === id)
      if (m?.url) navigator.clipboard.writeText(m.url).catch(() => {})
    } else if (action === 'edit') {
      const m = messengersRef.current.find(x => x.id === id)
      if (m) setEditingMessenger({ ...m })
    } else if (action === 'pin') {
      togglePinTab(id)
    } else if (action === 'close') {
      askRemoveMessenger(id)
    }
  }, [contextMenuTab, messengers])

  return { handleTabContextAction, handleTabContextAction_diag, contextMenuTab, setContextMenuTab, togglePinTab }
}
