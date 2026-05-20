// v0.87.82: вынесено из App.jsx — patch console.error для записи в renderer log
// + listener show-log-modal для открытия LogModal по запросу из main.
// v0.89.48 (Совет 3): глобальные error handlers — раньше при тихом крахе пилота
// WebContentsView в логе ничего не было, я не мог диагностировать. Теперь любой
// необработанный exception/rejection в renderer пишется в chatcenter.log.

import { useEffect } from 'react'

function sendToLog(level, message) {
  try { window.api?.send('app:log', { level, message }) } catch {}
}

export default function useConsoleErrorLogger({ setLogContent, setShowLogModal }) {
  useEffect(() => {
    const origError = console.error.bind(console)
    const patchedError = (...args) => {
      origError(...args)
      sendToLog('ERROR', args.map(a => typeof a === 'string' ? a : String(a)).join(' '))
    }
    console.error = patchedError

    // v0.89.48: window.onerror — любая uncaught синхронная ошибка в renderer.
    const onError = (event) => {
      const msg = event?.error?.stack || event?.message || String(event)
      sendToLog('ERROR', '[renderer-uncaught] ' + msg)
    }
    // v0.89.48: unhandled Promise rejection — async ошибки без .catch().
    const onRejection = (event) => {
      const reason = event?.reason
      const msg = reason?.stack || (typeof reason === 'string' ? reason : JSON.stringify(reason))
      sendToLog('ERROR', '[renderer-unhandled-rejection] ' + msg)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

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
    return () => {
      if (unsub) unsub()
      console.error = origError
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
}
