// v0.87.82: вынесено из App.jsx — patch console.error для записи в renderer log
// + listener show-log-modal для открытия LogModal по запросу из main.

import { useEffect } from 'react'

export default function useConsoleErrorLogger({ setLogContent, setShowLogModal }) {
  useEffect(() => {
    const origError = console.error.bind(console)
    const patchedError = (...args) => {
      origError(...args)
      try {
        window.api?.send('app:log', {
          level: 'ERROR',
          message: args.map(a => typeof a === 'string' ? a : String(a)).join(' '),
        })
      } catch {}
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
}
