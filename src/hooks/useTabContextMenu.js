// useTabContextMenu.js — Context menu logic + diagnostic scripts
import { useState, useCallback } from 'react'
import { detectMessengerType, ACCOUNT_SCRIPTS, DOM_SCAN_SCRIPTS, DIAG_FULL_SCRIPTS } from '../utils/messengerConfigs.js'
import { devError } from '../utils/devLog.js'

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

  // Diagnostic scripts execution
  const handleTabContextAction_diag = useCallback((action, mid, wv) => {
    if (!wv || !mid) return
    const mInfo = messengersRef.current.find(x => x.id === mid)
    const mType = detectMessengerType(mInfo?.url || '')

    if (action === 'diagDOM') {
      const script = DOM_SCAN_SCRIPTS[mType] || DOM_SCAN_SCRIPTS.unknown
      wv.executeJavaScript(script)
        .then(res => {
          try {
            const data = JSON.parse(res)
            setNotifLogModal(prev => prev ? { ...prev, domScanData: data } : prev)
            navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {})
          } catch {}
        }).catch(err => {
          devError('[DOM-скан] ошибка:', err)
          setNotifLogModal(prev => prev ? { ...prev, domScanData: { error: err.message || String(err), type: mType } } : prev)
        })
    } else if (action === 'diagFull') {
      wv.executeJavaScript(DIAG_FULL_SCRIPTS.common)
        .then(json => {
          try {
            const data = JSON.parse(json)
            setNotifLogModal(prev => prev ? { ...prev, diagFullData: data } : prev)
            navigator.clipboard.writeText(json).catch(() => {})
          } catch {}
        }).catch(err => {
          setNotifLogModal(prev => prev ? { ...prev, diagFullData: { error: err.message || String(err) } } : prev)
        })
    } else if (action === 'diagAccount') {
      const script = ACCOUNT_SCRIPTS[mType] || ACCOUNT_SCRIPTS.telegram
      wv.executeJavaScript(script)
        .then(name => {
          const data = { type: mType, name: name || 'не найдено', script: mType }
          setNotifLogModal(prev => prev ? { ...prev, diagAccountData: data } : prev)
          navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {})
        }).catch(err => {
          setNotifLogModal(prev => prev ? { ...prev, diagAccountData: { error: err.message || String(err), type: mType } } : prev)
        })
    }
  }, []) // eslint-disable-line

  // Pin/unpin tab
  const togglePinTab = useCallback((id) => {
    const cur = settingsRef.current.pinnedTabs || {}
    const next = { ...cur }
    if (next[id]) { delete next[id] } else { next[id] = true }
    const updated = { ...settingsRef.current, pinnedTabs: next }
    settingsRef.current = updated
    setSettings(updated)
    window.api?.invoke('settings:save', updated).catch(() => {})
  }, []) // eslint-disable-line

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
  }, [contextMenuTab, messengers]) // eslint-disable-line

  return { handleTabContextAction, handleTabContextAction_diag, contextMenuTab, setContextMenuTab, togglePinTab }
}
