// useIPCListeners.js — IPC event listeners extracted from App.jsx
import { useEffect, useCallback } from 'react'
import { devLog, devError } from '../utils/devLog.js'
import { playNotificationSound } from '../utils/sound.js'
import { buildChatNavigateScript } from '../utils/navigateToChat.js'

/**
 * IPC listeners: window-state, messenger:badge, notify:clicked, notify:mark-read,
 * renderer logging, visibility-change mark-read flush.
 */
export default function useIPCListeners({
  webviewRefs, settingsRef, activeIdRef, messengersRef, windowFocusedRef,
  lastSoundTsRef, pendingMarkReadsRef, pipelineTraceRef,
  traceNotif,
  setActiveId, setUnreadCounts, setStatusBarMsg,
  setLogContent, setShowLogModal,
}) {
  // ── v0.84.2: Renderer logging + show-log-modal IPC ──
  useEffect(() => {
    const origError = console.error.bind(console)
    const patchedError = (...args) => {
      origError(...args)
      try { window.api?.send('app:log', { level: 'ERROR', message: args.map(a => typeof a === 'string' ? a : String(a)).join(' ') }) } catch {}
    }
    console.error = patchedError
    let unsub
    const setup = () => {
      if (!window.api?.on) return
      unsub = window.api?.on('show-log-modal', () => {
        window.api?.invoke('app:read-log').then(content => {
          setLogContent(content || 'Лог пуст')
          setShowLogModal(true)
        })
      })
    }
    if (window.api?.on) setup()
    else setTimeout(setup, 1000)
    return () => { if (unsub) unsub(); console.error = origError }
  }, [])

  // ── IPC window-state ──
  useEffect(() => {
    return window.api?.on('window-state', (state) => {
      windowFocusedRef.current = state.focused
    })
  }, [])

  // ── Badge events from ChatMonitor ──
  useEffect(() => {
    return window.api?.on('messenger:badge', ({ id, count }) => {
      setUnreadCounts(prev => {
        const prev_count = prev[id] || 0
        if (count > prev_count && settingsRef.current.soundEnabled !== false) {
          const messengerMuted = !!(settingsRef.current.mutedMessengers || {})[id]
          const lastSnd = lastSoundTsRef.current[id] || 0
          const sinceLast = Date.now() - lastSnd
          if (!messengerMuted && sinceLast > 3000) {
            const m = messengersRef.current.find(x => x.id === id)
            playNotificationSound(m?.color)
            lastSoundTsRef.current[id] = Date.now()
            traceNotif('sound', 'pass', id, `badge +${count - prev_count}`, 'звук badge')
          } else if (!messengerMuted) {
            traceNotif('sound', 'block', id, `badge +${count - prev_count}`, `dedup badge ${sinceLast}мс назад`)
          }
        }
        return { ...prev, [id]: count }
      })
    })
  }, [])

  // ── Notify clicked (Messenger Ribbon) ──
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
            devLog(`[GoChat] attempt=${attempt} ok=${ok} method=${method}`, result)
            if (ok) {
              setStatusBarMsg(`>> "${senderName}" (${method})`)
            } else if (attempt >= 2 || activeIdRef.current !== messengerId) {
              setStatusBarMsg(`>> "${senderName}" - не найден в sidebar`)
            } else {
              setTimeout(() => tryNavigate(attempt + 1), 1500)
            }
          }).catch(err => { devError('[GoChat] executeJS error:', err.message) })
        }
        setTimeout(() => tryNavigate(0), 800)
      }
    })
  }, [])

  // ── Mark-read from ribbon ──
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
}
