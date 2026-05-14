// useTabContextMenu.js — Context menu logic.
// v0.87.133: heavy tabContextMenuDiag is disabled and no longer imported during startup.
import { useState, useCallback } from 'react'
import { markHealthPending } from '../utils/connectionHealth.js'

/**
 * @param {Object} deps
 * @param {React.MutableRefObject} deps.webviewRefs
 * @param {React.MutableRefObject} deps.messengersRef
 * @param {React.MutableRefObject} deps.settingsRef
 * @param {React.MutableRefObject} deps.pipelineTraceRef
 * @param {Array} deps.messengers
 * @param {Object} deps.settings
 * @param {Function} deps.setConnectionHealth
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
  setConnectionHealth, setNotifLogModal, setNotifLogTab, setEditingMessenger, setSettings,
  askRemoveMessenger, traceNotif, handleNewMessage,
}) {
  const [contextMenuTab, setContextMenuTab] = useState(null) // { id, x, y }

  const handleTabContextAction_diag = useCallback((action, mid, wv) => {
    setNotifLogModal(prev => prev ? {
      ...prev,
      [`${action === 'diagDOM' ? 'domScan' : action}Data`]: {
        disabled: true,
        reason: 'A2.1: manual WebView diagnostics disabled to keep startup graph lighter',
        action,
        messengerId: mid,
        hasWebview: !!wv,
      },
    } : prev)
  }, [setNotifLogModal])

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
      const m = messengersRef.current.find(x => x.id === id)
      setConnectionHealth?.(prev => ({
        ...prev,
        [id]: markHealthPending(prev[id], {
          id,
          type: 'webview',
          label: m?.name || id,
          url: m?.url || '',
          details: 'Ручная перезагрузка вкладки',
        }),
      }))
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
