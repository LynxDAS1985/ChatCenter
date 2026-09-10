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
    } else if (action === 'refreshAvatar') {
      // v1.2.440: сбрасываем ТОЛЬКО свои служебные ключи кэша фото (приставка __cc_) в хранилище
      // страницы мессенджера. Ключи авторизации сайта НЕ трогаем — иначе выкинет из аккаунта.
      // По доке MDN (Storage.removeItem): «If there is no item associated with the given key, this
      // method will do nothing» → безопасно вызывать для отсутствующих ключей, проверки не нужны.
      // Дальше сборщик аватарок (useWebAccountAvatars, раз в 12с) сам переснимет фото.
      const KEYS = ['__cc_account_avatar_crisp3', '__cc_account_avatar_crisp2', '__cc_account_avatar', '__cc_avatar_tried', '__cc_avatar_diag']
      const js = '(function(){var n=0;' + KEYS.map(k => `try{if(localStorage.getItem('${k}')!==null)n++;localStorage.removeItem('${k}')}catch(e){}`).join('') +
        "try{for(var i=localStorage.length-1;i>=0;i--){var k=localStorage.key(i);if(k&&k.indexOf('__cc_tg_open_tries')===0){localStorage.removeItem(k);n++}}}catch(e){}return n;})()"
      const logAv = (lvl, msg) => { try { window.api?.send?.('app:log', { level: lvl, message: msg }) } catch (_) {} }
      // v1.2.441 (находка №1): после сброса говорим значку «забудь старое фото» — иначе ключи
      // удалены, а на значке прежнее фото → команда выглядит нерабочей. Слушатель: shared/webAvatarGate.js
      const forgetAvatar = () => { try { window.dispatchEvent(new CustomEvent('cc-avatar-reset', { detail: id })) } catch (_) {} }
      if (wv && typeof wv.executeJavaScript === 'function') {
        wv.executeJavaScript(js)
          .then(n => { forgetAvatar(); logAv('INFO', `[web-avatar] сброс фото аккаунта по команде пользователя: ${id}, удалено ключей=${n}, значок очищен — фото переснимется в течение ~12с`) })
          .catch(e => logAv('WARN', `[web-avatar] сброс фото не удался: ${id}: ${(e && e.message) || e} — значок НЕ трогали`))
      } else {
        logAv('WARN', `[web-avatar] сброс фото невозможен: ${id} — страница не готова`)
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
