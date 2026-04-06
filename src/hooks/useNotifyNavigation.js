// v0.85.1: Хук навигации по уведомлениям — notify:clicked + mark-read
import { useEffect, useCallback } from 'react'

export default function useNotifyNavigation({
  webviewRefs, activeIdRef, windowFocusedRef, pendingMarkReadsRef,
  settingsRef, messengersRef, lastSoundTsRef,
  setActiveId, setStatusBarMsg, setUnreadCounts,
  buildChatNavigateScript, playNotificationSound,
  traceNotif, devLog, devError,
  notifCountRef, lastRibbonTsRef, notifSenderTsRef,
}) {
  const executeMarkRead = useCallback(({ messengerId, senderName, chatTag }) => {
    const el = webviewRefs.current[messengerId]
    if (!el) { traceNotif('mark-read', 'warn', messengerId, senderName || '', 'webview ref не найден'); return }
    const url = el.getURL?.() || ''
    const script = buildChatNavigateScript(url, senderName, chatTag)
    if (script) {
      el.executeJavaScript(script).then(result => {
        const ok = result === true || (result && result.ok)
        traceNotif('mark-read', ok ? 'pass' : 'warn', messengerId, senderName || '', `ok=${ok} method=${result?.method || ''} ${result?.log || ''}`)
      }).catch(err => {
        traceNotif('mark-read', 'warn', messengerId, senderName || '', `ошибка: ${err.message}`)
      })
    } else {
      traceNotif('mark-read', 'warn', messengerId, senderName || '', `нет скрипта для url=${url.slice(0,50)}`)
    }
  }, [])

  // notify:clicked — переход к чату
  useEffect(() => {
    return window.api?.on('notify:clicked', ({ messengerId, senderName, chatTag }) => {
      devLog('[GoChat] notify:clicked', { messengerId, senderName, chatTag })
      if (!messengerId) return
      setActiveId(messengerId)
      if (senderName || chatTag) {
        const tryNavigate = (attempt) => {
          if (activeIdRef.current !== messengerId) return
          const el = webviewRefs.current[messengerId]
          if (!el) return
          const url = el.getURL?.() || ''
          const script = buildChatNavigateScript(url, senderName, chatTag)
          if (!script) return
          el.executeJavaScript(script).then(result => {
            const ok = result === true || (result && result.ok)
            const method = result?.method || ''
            const log = result?.log || ''
            devLog(`[GoChat] attempt=${attempt} ok=${ok} method=${method}`, result)
            if (ok) {
              setStatusBarMsg(`>> "${senderName}" (${method})`)
              traceNotif('go-chat', 'pass', messengerId, senderName || '', `method=${method} ${log}`)
            } else if (attempt >= 2 || activeIdRef.current !== messengerId) {
              setStatusBarMsg(`>> "${senderName}" - не найден в sidebar`)
              traceNotif('go-chat', 'warn', messengerId, senderName || '', `notFound after ${attempt + 1} attempts | ${log}`)
            } else {
              setTimeout(() => tryNavigate(attempt + 1), 1500)
            }
          }).catch(err => {
            devError('[GoChat] executeJS error:', err.message)
            traceNotif('go-chat', 'error', messengerId, senderName || '', `error: ${err.message}`)
          })
        }
        setTimeout(() => tryNavigate(0), 800)
      }
    })
  }, [])

  // notify:mark-read
  useEffect(() => {
    return window.api?.on('notify:mark-read', ({ messengerId, senderName, chatTag }) => {
      traceNotif('mark-read', 'info', messengerId, senderName || '', `sender="${(senderName||'').slice(0,30)}" tag=${!!chatTag} hidden=${document.hidden}`)
      if (!messengerId) return
      if (document.hidden) {
        pendingMarkReadsRef.current.push({ messengerId, senderName, chatTag })
        traceNotif('mark-read', 'info', messengerId, senderName || '', 'отложено — окно скрыто')
        return
      }
      executeMarkRead({ messengerId, senderName, chatTag })
    })
  }, [executeMarkRead])

  // visibilitychange — обработка отложенных mark-read
  useEffect(() => {
    const handler = () => {
      if (!document.hidden && pendingMarkReadsRef.current.length > 0) {
        const pending = [...pendingMarkReadsRef.current]
        pendingMarkReadsRef.current = []
        traceNotif('mark-read', 'info', '', '', `обработка ${pending.length} отложенных mark-read`)
        pending.forEach(item => { setTimeout(() => executeMarkRead(item), 500) })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [executeMarkRead])

  return { executeMarkRead }
}
