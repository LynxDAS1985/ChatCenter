import { useEffect, useRef, useState } from 'react'
import { diagnosticsTargetTitle } from '../utils/diagnosticsTargets.js'

const css = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1000001, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modal: { width: 'min(1060px, 96vw)', maxHeight: '92vh', overflow: 'hidden', borderRadius: 12, background: 'var(--cc-surface)', color: 'var(--cc-text)', border: '1px solid var(--cc-border)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column' },
  header: { padding: '14px 16px', borderBottom: '1px solid var(--cc-border)', display: 'flex', alignItems: 'center', gap: 10 },
  body: { padding: 16, overflow: 'auto', display: 'grid', gap: 12 },
  card: { borderRadius: 10, border: '1px solid var(--cc-border)', background: 'var(--cc-hover)', padding: 12 },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  button: { borderRadius: 9, border: '1px solid var(--cc-border)', background: 'rgba(255,255,255,0.06)', color: 'var(--cc-text)', padding: '8px 10px', cursor: 'pointer', fontSize: 13 },
  primary: { borderRadius: 9, border: '1px solid rgba(56,189,248,0.5)', background: 'rgba(56,189,248,0.14)', color: '#7dd3fc', padding: '8px 10px', cursor: 'pointer', fontSize: 13 },
  danger: { borderRadius: 9, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.08)', color: '#fca5a5', padding: '8px 10px', cursor: 'pointer', fontSize: 13 },
  status: { borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  muted: { color: 'var(--cc-text-dimmer)', fontSize: 12 },
  mono: { whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 11, lineHeight: 1.55 },
  targetBtn: { width: '100%', textAlign: 'left', borderRadius: 9, border: '1px solid var(--cc-border)', background: 'rgba(255,255,255,0.05)', color: 'var(--cc-text)', padding: '9px 10px', cursor: 'pointer', display: 'grid', gap: 3 },
}

const severityColor = (v) => v === 'critical' ? '#f87171' : v === 'warning' ? '#fbbf24' : '#7dd3fc'
const hoverStyle = { transform: 'translateY(-1px)', filter: 'brightness(1.14)' }
const activeStyle = { transform: 'translateY(1px)', filter: 'brightness(0.92)' }

function ActionButton({ kind = 'button', active = false, disabled = false, minWidth, onClick, children, title }) {
  const [state, setState] = useState('')
  const base = active || kind === 'primary' ? css.primary : kind === 'danger' ? css.danger : css.button
  const extra = disabled ? { opacity: 0.55, cursor: 'not-allowed' } : state === 'down' ? activeStyle : state ? hoverStyle : {}
  return <button type="button" title={title} disabled={disabled} onClick={onClick} onMouseEnter={() => setState('hover')} onMouseLeave={() => setState('')} onMouseDown={() => setState('down')} onMouseUp={() => setState('hover')} onFocus={() => setState('hover')} onBlur={() => setState('')} style={{ ...base, ...extra, minWidth, transition: 'transform 120ms ease, filter 120ms ease, background 120ms ease' }}>{children}</button>
}

export default function SystemDiagnosticsModal({ onClose, onMinimize, runtimeContext, onRunDeepCheck, diagnosticsTargets = [], selectedTarget, diagnosticsSession, diagnosticsActions }) {
  const [report, setReport] = useState(null)
  const [message, setMessage] = useState('')
  const [selectedTargetId, setSelectedTargetId] = useState(selectedTarget?.id || '')
  const contextRef = useRef(runtimeContext || {})
  const runDeepRef = useRef(onRunDeepCheck)
  const session = diagnosticsSession || {}
  const sessionEvents = session.events || []
  const savedSessionEvents = report?.diagnosticsSession?.events || []
  const reportTarget = report?.diagnosticsSession?.target || report?.diagnosticsTarget || null
  const currentTarget = session.target || diagnosticsTargets.find(t => t.id === selectedTargetId) || selectedTarget || reportTarget || diagnosticsTargets[0] || null
  const visibleSessionEvents = sessionEvents.length ? sessionEvents : savedSessionEvents
  const canUseReport = !!report || !!visibleSessionEvents.length || !!session.active
  const sessionStatus = session.active ? (session.paused ? 'пауза' : 'запись') : 'выключена'
  const statusColor = session.active ? (session.paused ? '#fbbf24' : '#34d399') : '#94a3b8'
  const statusHint = session.active
    ? (session.paused ? 'Глубокая WebView-проверка включена всегда. Автообновление остановлено на паузе.' : 'Глубокая WebView-проверка включена всегда. Автообновление включено: диагностика сама собирает снимок каждые 3 секунды.')
    : 'Глубокая WebView-проверка включена всегда. Запись выключена: показан последний сохранённый отчёт, если он есть.'

  useEffect(() => { contextRef.current = runtimeContext || {}; runDeepRef.current = onRunDeepCheck }, [runtimeContext, onRunDeepCheck])
  useEffect(() => {
    if (!session.active && selectedTarget?.id && !selectedTargetId) setSelectedTargetId(selectedTarget.id)
  }, [selectedTarget?.id, selectedTargetId, session.active])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const saved = await window.api?.invoke('app:diagnostics-read-report')
        if (!alive || !saved?.ok || !saved.report) return
        setReport(saved.report)
        const count = saved.report?.diagnosticsSession?.events?.length || 0
        setMessage(count ? `Последний сохранённый отчёт загружен: ${count} событий` : `Последний сохранённый отчёт загружен: ${saved.path}`)
      } catch (_) {}
    })()
    return () => { alive = false }
  }, [])

  const copyForAi = async () => { try { if (sessionEvents.length || session.active) await diagnosticsActions?.copy?.(); else await navigator.clipboard.writeText(JSON.stringify(report || {}, null, 2)); setMessage('Отчёт скопирован для ИИ') } catch { setMessage('Не удалось скопировать отчёт') } }
  const saveForAi = async () => {
    try {
      if (sessionEvents.length || session.active) { await diagnosticsActions?.save?.(); setMessage('Сессия сохранена для ИИ'); return }
      if (report) { const saved = await window.api?.invoke('app:diagnostics-save-report', report); setMessage(saved?.ok ? `Текущий отчёт сохранён: ${saved.path}` : `Отчёт не сохранён: ${saved?.error || 'нет ответа IPC'}`) }
    } catch (e) { setMessage(`Не удалось сохранить отчёт: ${e.message}`) }
  }
  const clearScreen = () => { setReport(null); diagnosticsActions?.clear?.(); setMessage('Экран и буфер диагностики очищены. chatcenter.log и ai-errors.log не тронуты.') }
  const chooseTarget = (target) => {
    if (session.active) return
    setSelectedTargetId(target.id)
    diagnosticsActions?.setTarget?.(target)
  }
  const startSelected = () => diagnosticsActions?.start?.(currentTarget)
  const summary = report?.summary || {}, problems = report?.problems || [], chains = report?.chains || []
  const recentErrors = report?.recent?.errors || [], maxFallbackEvents = report?.maxFallbackEvents || []

  return (
    <div style={css.overlay} onClick={onClose}><div style={css.modal} onClick={e => e.stopPropagation()}>
      <div style={css.header}><b style={{ fontSize: 17 }}>Диагностика системы</b><span style={{ ...css.muted, marginRight: 'auto' }}>цепочки, логи, подключения, WebView</span>{(session.active || sessionEvents.length > 0) && <ActionButton minWidth={116} onClick={onMinimize || onClose}>Свернуть в фон</ActionButton>}<ActionButton minWidth={38} onClick={onClose} title="Закрыть только большое окно. Если запись включена, она продолжится в маленькой панели.">×</ActionButton></div>
      <div style={css.body}>
        <div style={{ ...css.card, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Что диагностируем</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {(diagnosticsTargets || []).map(target => {
              const active = currentTarget?.id === target.id
              return (
                <button
                  key={target.id}
                  type="button"
                  disabled={!!session.active}
                  onClick={() => chooseTarget(target)}
                  style={{
                    ...css.targetBtn,
                    borderColor: active ? 'rgba(56,189,248,0.65)' : 'var(--cc-border)',
                    background: active ? 'rgba(56,189,248,0.13)' : 'rgba(255,255,255,0.05)',
                    opacity: session.active && !active ? 0.55 : 1,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: target.color || '#38bdf8', flex: '0 0 auto' }} />
                    <b>{target.tabTitle}</b>
                    <span style={css.muted}>{target.messengerLabel} · {target.runtimeLabel}</span>
                  </span>
                  <span style={css.muted}>{target.url || 'Наша API-разработка'}</span>
                </button>
              )
            })}
          </div>
          <div style={{ ...css.muted, color: '#93c5fd' }}>
            Отчёт будет сохранён только по выбранной вкладке: {diagnosticsTargetTitle(currentTarget)}.
          </div>
          <div style={{ fontWeight: 700 }}>Фоновая диагностическая сессия</div>
          <div style={css.status}><b style={{ color: statusColor }}>Статус: {sessionStatus}</b><span>Буфер: {sessionEvents.length} событий</span><span style={css.muted}>{statusHint}</span></div>
          <div style={css.row}>{!session.active && <ActionButton kind="primary" onClick={startSelected}>Включить запись выбранной вкладки</ActionButton>}{session.active && !session.paused && <ActionButton onClick={diagnosticsActions?.pause}>Пауза</ActionButton>}{session.active && session.paused && <ActionButton kind="primary" onClick={diagnosticsActions?.resume}>Продолжить</ActionButton>}{session.active && <ActionButton kind="danger" onClick={diagnosticsActions?.stop}>Отключить и сохранить</ActionButton>}<ActionButton onClick={saveForAi} disabled={!canUseReport} minWidth={132}>Сохранить для ИИ</ActionButton><ActionButton onClick={copyForAi} disabled={!canUseReport} minWidth={132}>Скопировать для ИИ</ActionButton><ActionButton kind="danger" onClick={clearScreen} minWidth={154}>Очистить экран, не логи</ActionButton></div>
          <div style={{ ...css.muted, color: session.lastError ? '#f87171' : '#93c5fd' }}>{message || session.lastError || session.lastSavedPath || 'Свернуть в фон — только прячет большое окно, запись продолжится. В маленькой панели "Стоп" сохраняет и оставляет отчёт на экране, "Стоп и закрыть" сохраняет и убирает диагностику полностью.'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>{[['ошибок в логе', summary.errors], ['предупреждений', summary.warnings], ['цепочек событий', summary.chains], ['мессенджеров', summary.messengers]].map(([label, value]) => <div key={label} style={css.card}><b>{value || 0}</b><div style={css.muted}>{label}</div></div>)}</div>
        <Section title="Что сейчас подозрительно">{problems.length ? problems.map((p, i) => <div key={`${p.title}-${i}`} style={{ borderTop: i ? '1px solid var(--cc-border)' : 0, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}><div style={{ color: severityColor(p.severity), fontWeight: 700 }}>{p.title}</div><div style={{ ...css.mono, marginTop: 5 }}>{p.detail || 'деталей нет'}</div><div style={{ ...css.muted, marginTop: 5 }}>Что делать: {p.advice}</div></div>) : <div style={css.muted}>Явных проблем по текущему отчёту нет.</div>}</Section>
        <Section title="MAX fallback анализ">{maxFallbackEvents.length ? maxFallbackEvents.slice(-100).map((e, i) => <MaxFallbackEvent key={`${e.ts}-${i}`} event={e} index={i} />) : <div style={css.muted}>MAX fallback событий в текущем отчёте нет.</div>}</Section>
        <Section title="Цепочки событий">{chains.length ? chains.slice(-200).map((c, i) => <div key={c.id || i} style={{ borderTop: i ? '1px solid var(--cc-border)' : 0, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}><div><b>{c.title}</b> <span style={css.muted}>{c.ts} · {c.type}</span></div><div style={css.mono}>{c.detail}</div></div>) : <div style={css.muted}>Включите фоновую запись, чтобы накопить новые события. Если запись уже останавливали, здесь показывается последний сохранённый отчёт.</div>}</Section>
        <Section title="Live-лента сессии">{visibleSessionEvents.length ? visibleSessionEvents.slice(-120).reverse().map((e, i) => <div key={e.id || i} style={{ borderTop: i ? '1px solid var(--cc-border)' : 0, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}><div style={{ color: severityColor(e.severity), fontWeight: 700 }}>{e.title || e.kind}</div><div style={css.mono}>{e.text || e.detail || 'нет деталей'}</div></div>) : <div style={css.muted}>Фоновая сессия выключена или пока не накопила событий.</div>}</Section>
        <Section title="Файл для ИИ"><div style={css.mono}>{report?.paths?.reportPath || session.lastSavedPath || 'Путь появится после сохранения отчёта или остановки сессии'}</div><div style={{ ...css.muted, marginTop: 6 }}>Другой ИИ может открыть JSON-отчёт и восстановить цепочку: источник события, ribbon, звук, avatar, dedup и ошибки. Если текущая запись закрыта, здесь показывается последний сохранённый отчёт.</div></Section>
        <Section title="Последние ошибки">{recentErrors.length ? <div style={css.mono}>{recentErrors.join('\n')}</div> : <div style={css.muted}>Ошибок в последних строках нет.</div>}</Section>
      </div>
    </div></div>
  )
}

function Section({ title, children }) { return <div style={css.card}><div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>{children}</div> }
function MaxFallbackEvent({ event: e, index }) {
  const candidates = e.candidates?.length ? `\nкандидаты:\n${e.candidates.map(c => `- ${c.sender || 'нет'}: ${c.body}`).join('\n')}` : ''
  const warn = e.suspiciousActive ? '\nВНИМАНИЕ: active fallback похож на служебный текст, не на реальное сообщение.' : ''
  return <div style={{ borderTop: index ? '1px solid var(--cc-border)' : 0, paddingTop: index ? 8 : 0, marginTop: index ? 8 : 0 }}><div><b>{e.source || 'MAX fallback'}</b> <span style={css.muted}>title +{e.titleDelta || 0} · кандидатов {e.candidateCount || 0} · ribbon {e.ribbonOk ? 'да' : 'нет'} · звук {e.soundOk ? 'да' : 'нет'} · dedup {e.dedupBlocked ? 'блок' : 'нет'}</span></div><div style={css.mono}>выбрано: {e.sender || 'нет отправителя'} → {e.text || 'нет текста'}{e.dedupDetail ? `\n${e.dedupDetail}` : ''}{candidates}{warn}</div></div>
}
