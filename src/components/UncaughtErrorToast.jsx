// v0.89.49 (Совет): toast в правом нижнем углу для uncaught ошибок renderer.
//
// ЗАЧЕМ: до v0.89.48 при тихом краше пилота WebContentsView (renderer-uncaught)
// единственный след оставался в chatcenter.log — юзер не знал что произошло
// и куда смотреть. Теперь при первой uncaught ошибке появляется плашка с
// коротким сообщением + подсказкой «откройте лог в Настройках».
//
// КОНТРАКТ:
//   useConsoleErrorLogger.js эмитит событие `cc-uncaught-error` через
//   window.dispatchEvent(new CustomEvent('cc-uncaught-error', { detail: msg })).
//   Этот компонент слушает событие и показывает первые 200 символов сообщения.
//
// ПОВЕДЕНИЕ:
//   - Показывается на 12 секунд, потом скрывается.
//   - Можно закрыть вручную крестиком.
//   - Если за 12 сек прилетела вторая ошибка — таймер сбрасывается.
//   - Состояние не persistent — обновление страницы скрывает toast.

import { useEffect, useState, useRef } from 'react'

export default function UncaughtErrorToast() {
  const [message, setMessage] = useState(null)
  const hideTimerRef = useRef(null)

  useEffect(() => {
    const onError = (ev) => {
      const detail = ev?.detail
      const text = typeof detail === 'string' ? detail : (detail?.message || 'Неизвестная ошибка')
      setMessage(text.slice(0, 200))
      // Сброс предыдущего таймера — каждая новая ошибка продлевает показ.
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setMessage(null), 12000)
    }
    window.addEventListener('cc-uncaught-error', onError)
    return () => {
      window.removeEventListener('cc-uncaught-error', onError)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  if (!message) return null
  return (
    <div
      role="alert"
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 999998,
        maxWidth: 420, padding: '12px 14px',
        backgroundColor: 'rgba(220, 38, 38, 0.95)',
        color: '#fff', borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        fontSize: 13, lineHeight: 1.4,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}
    >
      <div style={{ fontSize: 18, lineHeight: 1 }}>⚠️</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Произошла ошибка в окне</div>
        <div style={{ opacity: 0.95, wordBreak: 'break-word' }}>{message}</div>
        <div style={{ opacity: 0.7, marginTop: 6, fontSize: 11 }}>
          Подробности: <b>Настройки → Диагностика → Загрузить лог ошибок</b>
        </div>
      </div>
      <button
        onClick={() => setMessage(null)}
        style={{
          background: 'transparent', border: 'none', color: '#fff',
          cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
          opacity: 0.85,
        }}
        title="Закрыть"
      >✕</button>
    </div>
  )
}
