// v0.87.103: вынесено из useTabContextMenu.js — диагностические скрипты для context menu.
// Три действия: diagDOM (DOM-скан), diagFull (полная диагностика), diagAccount (имя аккаунта).
// Каждое выполняет executeJavaScript в WebView и пишет результат в notifLogModal + clipboard.
import { detectMessengerType, ACCOUNT_SCRIPTS, DOM_SCAN_SCRIPTS, DIAG_FULL_SCRIPTS } from '../utils/messengerConfigs.js'
import { devError } from '../utils/devLog.js'

export function runTabDiag(action, mid, wv, deps) {
  const { messengersRef, setNotifLogModal } = deps
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
}
