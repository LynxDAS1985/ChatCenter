import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeSystemDiagnostics } from '../utils/systemDiagnostics.js'

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
  muted: { color: 'var(--cc-text-dimmer)', fontSize: 12 },
  mono: { whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 11, lineHeight: 1.55 },
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
function ToggleButton({ value, onChange, label, title }) {
  return <ActionButton active={value} onClick={() => onChange(!value)} title={title}>{label}: {value ? 'вкл' : 'выкл'}</ActionButton>
}

export default function SystemDiagnosticsModal({ onClose, runtimeContext, onRunDeepCheck, diagnosticsSession, diagnosticsActions }) {
  const [snapshot, setSnapshot] = useState(null), [report, setReport] = useState(null), [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false), [deepWebview, setDeepWebview] = useState(false), [message, setMessage] = useState('')
  const contextRef = useRef(runtimeContext || {}), deepRef = useRef(false), runDeepRef = useRef(onRunDeepCheck)
  useEffect(() => { contextRef.current = runtimeContext || {}; deepRef.current = deepWebview; runDeepRef.current = onRunDeepCheck }, [runtimeContext, deepWebview, onRunDeepCheck])

  const load = useCallback(async (opts = {}) => {
    setLoading(true); setMessage('')
    try {
      if ((opts.deep || deepRef.current) && runDeepRef.current) await Promise.resolve(runDeepRef.current())
      const data = await window.api?.invoke('app:diagnostics-snapshot')
      const nextReport = analyzeSystemDiagnostics({ snapshot: data || {}, runtimeContext: contextRef.current })
      const saved = await window.api?.invoke('app:diagnostics-save-report', nextReport)
      if (saved?.ok) { nextReport.paths = { ...(nextReport.paths || {}), reportPath: saved.path }; setMessage(`Отчёт сохранён: ${saved.path}`) }
      else if (saved?.error) setMessage(`Отчёт не сохранён: ${saved.error}`)
      setSnapshot(data); setReport(nextReport)
    } catch (e) {
      setReport({ createdAt: new Date().toISOString(), summary: { errors: 1, warnings: 0, chains: 0 }, problems: [{ severity: 'critical', title: 'Диагностика не запустилась', detail: e.message, advice: 'Проверить IPC app:diagnostics-snapshot/app:diagnostics-save-report.', source: 'SystemDiagnosticsModal' }], chains: [], recent: { errors: [], warnings: [] } })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!autoRefresh) return undefined; const timer = setInterval(() => load(), 3000); return () => clearInterval(timer) }, [autoRefresh, load])

  const copyReport = async () => { try { await navigator.clipboard.writeText(JSON.stringify(report || {}, null, 2)); setMessage('Отчёт скопирован в буфер обмена') } catch { setMessage('Не удалось скопировать отчёт') } }
  const clearScreen = () => { setSnapshot(null); setReport(null); diagnosticsActions?.clear?.(); setMessage('Экран и буфер диагностики очищены. Файлы логов не тронуты.') }
  const summary = report?.summary || {}, problems = report?.problems || [], chains = report?.chains || [], recentErrors = report?.recent?.errors || [], maxFallbackEvents = report?.maxFallbackEvents || []
  const session = diagnosticsSession || {}
  const sessionEvents = session.events || []
  const sessionStatus = session.active ? (session.paused ? 'пауза' : 'запись') : 'остановлена'

  return (
    <div style={css.overlay} onClick={onClose}><div style={css.modal} onClick={e => e.stopPropagation()}>
      <div style={css.header}><b style={{ fontSize: 17 }}>Диагностика системы</b><span style={{ ...css.muted, marginRight: 'auto' }}>цепочки, логи, подключения, WebView</span><ActionButton kind="primary" minWidth={112} onClick={() => load({ deep: true })} disabled={loading}>{loading ? 'Проверка...' : 'Обновить'}</ActionButton><ActionButton minWidth={38} onClick={onClose}>×</ActionButton></div>
      <div style={css.body}>
        <div style={{ ...css.card, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Фоновая диагностическая сессия</div>
          <div style={css.row}>
            {!session.active && <ActionButton kind="primary" onClick={diagnosticsActions?.start}>Начать запись</ActionButton>}
            {session.active && !session.paused && <ActionButton onClick={diagnosticsActions?.pause}>Пауза</ActionButton>}
            {session.active && session.paused && <ActionButton kind="primary" onClick={diagnosticsActions?.resume}>Продолжить</ActionButton>}
            {session.active && <ActionButton kind="danger" onClick={diagnosticsActions?.stop}>Стоп и сохранить</ActionButton>}
            <ActionButton active={!!session.deepWebview} onClick={diagnosticsActions?.toggleDeep}>Глубокая WebView: {session.deepWebview ? 'вкл' : 'выкл'}</ActionButton>
            <ActionButton onClick={diagnosticsActions?.save}>Сохранить сессию</ActionButton>
            <ActionButton onClick={diagnosticsActions?.copy}>Скопировать сессию</ActionButton>
          </div>
          <div style={css.muted}>
            Статус: {sessionStatus}. Буфер: {sessionEvents.length} событий. Большую модалку можно закрыть: маленькая панель останется и запись продолжится.
          </div>
          <div style={{ ...css.muted, color: session.lastError ? '#f87171' : '#93c5fd' }}>
            {session.lastError || session.lastSavedPath || 'Отчёт сессии сохраняется вручную или автоматически при остановке.'}
          </div>
        </div>
        <div style={{ ...css.card, display: 'grid', gap: 10, minHeight: 116 }}><div style={css.row}><ToggleButton value={autoRefresh} onChange={setAutoRefresh} label="Автообновление 3 сек" title="Когда включено, окно само обновляет снимок каждые 3 секунды." /><ToggleButton value={deepWebview} onChange={setDeepWebview} label="Глубокая WebView проверка" title="Когда включено, следующее обновление дополнительно проверяет WebView-подключения." /><ActionButton onClick={copyReport} disabled={!report} minWidth={132}>Копировать отчёт</ActionButton><ActionButton kind="danger" onClick={clearScreen} minWidth={118}>Очистить экран</ActionButton></div><div style={css.muted}>Обычное обновление читает логи и состояние приложения. Глубокая WebView проверка дополнительно опрашивает вкладки; включайте её только когда ищем проблему с мессенджерами.</div><div style={{ ...css.muted, color: '#93c5fd', minHeight: 18 }}>{message || 'Отчёт сохраняется в файл для разбора ИИ после каждого обновления.'}</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>{[['ошибок в логе', summary.errors], ['предупреждений', summary.warnings], ['цепочек событий', summary.chains], ['мессенджеров', summary.messengers]].map(([label, value]) => <div key={label} style={css.card}><b>{value || 0}</b><div style={css.muted}>{label}</div></div>)}</div>
        <Section title="Что сейчас подозрительно">{problems.length ? problems.map((p, i) => <div key={`${p.title}-${i}`} style={{ borderTop: i ? '1px solid var(--cc-border)' : 0, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}><div style={{ color: severityColor(p.severity), fontWeight: 700 }}>{p.title}</div><div style={{ ...css.mono, marginTop: 5 }}>{p.detail || 'деталей нет'}</div><div style={{ ...css.muted, marginTop: 5 }}>Что делать: {p.advice}</div></div>) : <div style={css.muted}>Явных проблем по текущему снимку нет.</div>}</Section>
        <Section title="MAX fallback анализ">{maxFallbackEvents.length ? maxFallbackEvents.slice(-100).map((e, i) => <MaxFallbackEvent key={`${e.ts}-${i}`} event={e} index={i} />) : <div style={css.muted}>MAX fallback событий в текущем снимке нет.</div>}</Section>
        <Section title="Цепочки событий">{chains.length ? chains.slice(-200).map((c, i) => <div key={c.id || i} style={{ borderTop: i ? '1px solid var(--cc-border)' : 0, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}><div><b>{c.title}</b> <span style={css.muted}>{c.ts} · {c.type}</span></div><div style={css.mono}>{c.detail}</div></div>) : <div style={css.muted}>Пока нет событий уведомлений/WebView/native в последних строках лога.</div>}</Section>
        <Section title="Live-лента сессии">{sessionEvents.length ? sessionEvents.slice(-120).reverse().map((e, i) => <div key={e.id || i} style={{ borderTop: i ? '1px solid var(--cc-border)' : 0, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}><div style={{ color: severityColor(e.severity), fontWeight: 700 }}>{e.title || e.kind}</div><div style={css.mono}>{e.text || e.detail || 'нет деталей'}</div></div>) : <div style={css.muted}>Фоновая сессия пока не накопила событий.</div>}</Section>
        <Section title="Файл для ИИ"><div style={css.mono}>{report?.paths?.reportPath || snapshot?.paths?.reportPath || 'Отчёт появится после обновления диагностики'}</div><div style={{ ...css.muted, marginTop: 6 }}>Когда диагностика открыта или обновлена, приложение сохраняет JSON-отчёт сюда. Его можно читать без ручного копирования текста из интерфейса.</div></Section>
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
