// NativeConnectionStrip.jsx — v1.2.447
// Полоса «нет связи» над списком чатов «Общего чата». Вся чистая логика (что показывать,
// как называть состояние, тексты журнала) — в shared/connectionStripState.js.
//
// ПОЧЕМУ ПОВЕРХ, А НЕ В РЯД: `.native-main` раскладывает детей В РЯД, поэтому обычный
// ребёнок уехал бы вбок. Полоса рисуется поверх (`position:absolute`) — тот же приём, что
// у закреплённых блоков над прокруткой в этом проекте.
//
// ПОЧЕМУ СЛУШАЕМ ЗДЕСЬ, А НЕ В ХРАНИЛИЩЕ: nativeStoreIpc.js стоит на 642/660 строках,
// а состояние связи нужно только этой полосе. Канал `tg:account-connection` уже был
// (tdlibClient → мост), но его НИКТО не слушал.
import { useEffect, useRef, useState } from 'react'
import { stripVerdict, waitingFor, logStateLine, logRestoredLine, logCheckLine } from '../../../shared/connectionStripState.js'

const log = (level, message) => { try { window.api?.send?.('app:log', { level, message }) } catch (_) {} }

export default function NativeConnectionStrip({ onCheck }) {
  const [states, setStates] = useState({})
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  const [now, setNow] = useState(() => Date.now())
  const [checking, setChecking] = useState(false)
  const sinceRef = useRef(0)

  useEffect(() => {
    const offConn = window.api?.on?.('tg:account-connection', ({ accountId, state } = {}) => {
      if (!accountId) return
      setStates(prev => (prev[accountId] === state ? prev : { ...prev, [accountId]: state }))
      log('INFO', logStateLine(accountId, state))
    })
    const onOff = () => setOnline(false)
    const onOn = () => setOnline(true)
    window.addEventListener('offline', onOff)
    window.addEventListener('online', onOn)
    return () => {
      if (typeof offConn === 'function') offConn()
      window.removeEventListener('offline', onOff)
      window.removeEventListener('online', onOn)
    }
  }, [])

  const problem = stripVerdict({ states, online, since: sinceRef.current, now })

  // Секунды тикают ТОЛЬКО пока есть беда — иначе таймер зря будит отрисовку.
  useEffect(() => {
    if (!problem) {
      if (sinceRef.current) {
        log('INFO', logRestoredLine('все', Math.floor((Date.now() - sinceRef.current) / 1000)))
        sinceRef.current = 0
      }
      return undefined
    }
    if (!sinceRef.current) sinceRef.current = Date.now()
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [!!problem])

  if (!problem) return null

  const check = async () => {
    setChecking(true)
    log('INFO', logCheckLine())
    try { await onCheck?.() } catch (_) {} finally { setChecking(false) }
  }

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
      background: problem.kind === 'offline' ? '#3A1D1D' : '#2A2410',
      borderBottom: '1px solid ' + (problem.kind === 'offline' ? '#7F3A3A' : '#7A6420'),
      color: '#F1F5F9', font: '500 12.5px/1.35 system-ui, sans-serif',
      boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
    }}>
      <span style={{ fontSize: 14 }}>{problem.kind === 'offline' ? '🚫' : '🔄'}</span>
      <span>{problem.title}</span>
      <span style={{ opacity: 0.7 }}>· {problem.hint}</span>
      <span style={{ opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>· {waitingFor(problem.seconds)}</span>
      <button
        onClick={check} disabled={checking}
        style={{
          marginLeft: 'auto', padding: '4px 12px', borderRadius: 7, cursor: checking ? 'default' : 'pointer',
          border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.1)',
          color: '#F1F5F9', font: '600 12px system-ui, sans-serif', opacity: checking ? 0.55 : 1,
        }}
      >{checking ? 'Проверяем…' : 'Проверить сейчас'}</button>
    </div>
  )
}
