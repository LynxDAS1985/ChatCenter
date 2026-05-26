// v0.87.82: вынесено из App.jsx — patch console.error для записи в renderer log
// + listener show-log-modal для открытия LogModal по запросу из main.
// v0.89.48 (Совет 3): глобальные error handlers — раньше при тихом крахе пилота
// WebContentsView в логе ничего не было, я не мог диагностировать. Теперь любой
// необработанный exception/rejection в renderer пишется в chatcenter.log.

import { useEffect } from 'react'

function sendToLog(level, message) {
  try { window.api?.send('app:log', { level, message }) } catch {}
}

// v0.89.49 (Совет toast): эмитим событие чтобы <UncaughtErrorToast> мог его
// поймать и показать плашку в правом нижнем углу. Юзер видит ошибку сразу,
// не открывая лог. Отделено от console-патча чтобы не плодить toast'ы на
// каждый console.error — только настоящие uncaught.
function emitUncaughtEvent(message) {
  try { window.dispatchEvent(new CustomEvent('cc-uncaught-error', { detail: message })) } catch {}
}

export default function useConsoleErrorLogger({ setLogContent, setShowLogModal }) {
  useEffect(() => {
    const origError = console.error.bind(console)
    const patchedError = (...args) => {
      origError(...args)
      const msg = args.map(a => typeof a === 'string' ? a : String(a)).join(' ')
      // v0.91.20 ДИАГНОСТИКА: захват stack trace для критических React ошибок
      // («Maximum update depth» / «Warning: Cannot update»). Без stack невозможно
      // найти точный компонент с infinite loop. Срабатывает только при матче строки —
      // не замедляет другие пути. Удалить после фикса корня (TODO-8).
      let stack = ''
      if (msg.includes('Maximum update depth') || msg.includes('Warning: Cannot update')) {
        stack = new Error().stack || ''
      }
      sendToLog('ERROR', msg + (stack ? '\n[CAPTURED STACK]\n' + stack : ''))
    }
    console.error = patchedError

    // v0.92.1: ResizeObserver loop — benign warning из Virtuoso (см. их troubleshooting:
    // https://virtuoso.dev/react-virtuoso/troubleshooting/). Не настоящая ошибка,
    // фильтруем чтобы не показывать toast и не засорять лог.
    const isResizeObserverBenign = (msg) => {
      if (!msg || typeof msg !== 'string') return false
      return msg.includes('ResizeObserver loop completed with undelivered notifications') ||
             msg.includes('ResizeObserver loop limit exceeded')
    }
    // v0.89.48: window.onerror — любая uncaught синхронная ошибка в renderer.
    const onError = (event) => {
      const msg = event?.error?.stack || event?.message || String(event)
      if (isResizeObserverBenign(event?.message) || isResizeObserverBenign(msg)) return
      sendToLog('ERROR', '[renderer-uncaught] ' + msg)
      emitUncaughtEvent(event?.message || msg)
    }
    // v0.89.48: unhandled Promise rejection — async ошибки без .catch().
    const onRejection = (event) => {
      const reason = event?.reason
      const msg = reason?.stack || (typeof reason === 'string' ? reason : JSON.stringify(reason))
      if (isResizeObserverBenign(reason?.message) || isResizeObserverBenign(msg)) return
      sendToLog('ERROR', '[renderer-unhandled-rejection] ' + msg)
      emitUncaughtEvent(reason?.message || String(reason).slice(0, 200))
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
