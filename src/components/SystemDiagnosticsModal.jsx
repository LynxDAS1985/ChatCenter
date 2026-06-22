import { useCallback, useEffect, useMemo, useState } from 'react'
import { analyzeSystemDiagnostics } from '../utils/systemDiagnostics.js'

const css = {
  overlay: { position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 },
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
function ToggleButton({ value, onChange, children }) {
  return <button type="button" onClick={() => onChange(!value)} style={value ? css.primary : css.button}>{value ? '? ' : ''}{children}</button>
}

export default function SystemDiagnosticsModal({ onClose, runtimeContext, onRunDeepCheck }) {
  const [snapshot, setSnapshot] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [deepWebview, setDeepWebview] = useState(false)
  const [message, setMessage] = useState('')
  const context = useMemo(() => runtimeContext || {}, [runtimeContext])

  const load = useCallback(async (opts = {}) => {
    setLoading(true); setMessage('')
    try {
      if ((opts.deep || deepWebview) && onRunDeepCheck) onRunDeepCheck()
      const data = await window.api?.invoke('app:diagnostics-snapshot')
      const nextReport = analyzeSystemDiagnostics({ snapshot: data || {}, runtimeContext: context })
      const saved = await window.api?.invoke('app:diagnostics-save-report', nextReport)
      if (saved?.ok) { nextReport.paths = { ...(nextReport.paths || {}), reportPath: saved.path }; setMessage(`Отчёт сохранён: ${saved.path}`) }
      else if (saved?.error) setMessage(`Отчёт не сохранён: ${saved.error}`)
      setSnapshot(data); setReport(nextReport)
    } catch (e) {
      setReport({ createdAt: new Date().toISOString(), summary: { errors: 1, warnings: 0, chains: 0 }, problems: [{ severity: 'critical', title: 'Диагностика не запустилась', detail: e.message, advice: 'Проверить IPC app:diagnostics-snapshot/app:diagnostics-save-report.', source: 'SystemDiagnosticsModal' }], chains: [], recent: { errors: [], warnings: [] } })
    } finally { setLoading(false) }
  }, [context, deepWebview, onRunDeepCheck])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!autoRefresh) return undefined; const timer = setInterval(() => load(), 3000); return () => clearInterval(timer) }, [autoRefresh, load])

  const copyReport = async () => { try { await navigator.clipboard.writeText(JSON.stringify(report || {}, null, 2)); setMessage('Отчёт скопирован в буфер обмена') } catch { setMessage('Не удалось скопировать отчёт') } }
  const clearScreen = () => { setSnapshot(null); setReport(null); setMessage('Экран диагностики очищен. Файлы логов не тронуты.') }
  const summary = report?.summary || {}, problems = report?.problems || [], chains = report?.chains || [], recentErrors = report?.recent?.errors || []

  return (
    <div style={css.overlay} onClick={onClose}><div style={css.modal} onClick={e => e.stopPropagation()}>
      <div style={css.header}><b style={{ fontSize: 17 }}>🩺 Диагностика системы</b><span style={{ ...css.muted, marginRight: 'auto' }}>цепочки, логи, подключения, WebView</span><button type="button" onClick={() => load({ deep: true })} disabled={loading} style={css.primary}>{loading ? 'Проверка...' : 'Обновить'}</button><button type="button" onClick={onClose} style={css.button}>×</button></div>
      <div style={css.body}>
        <div style={{ ...css.card, display: 'grid', gap: 10 }}><div style={css.row}><ToggleButton value={autoRefresh} onChange={setAutoRefresh}>Автообновление 3 сек</ToggleButton><ToggleButton value={deepWebview} onChange={setDeepWebview}>Глубокая WebView проверка</ToggleButton><button type="button" onClick={copyReport} disabled={!report} style={css.button}>Копировать отчёт</button><button type="button" onClick={clearScreen} style={css.danger}>Очистить экран</button></div><div style={css.muted}>Глубокая WebView проверка запускается только вручную или при включённом переключателе. Общий лог `chatcenter.log` и `ai-errors.log` эта кнопка не очищает.</div>{message && <div style={{ ...css.muted, color: '#93c5fd' }}>{message}</div>}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>{[['ошибок в логе', summary.errors], ['предупреждений', summary.warnings], ['цепочек событий', summary.chains], ['мессенджеров', summary.messengers]].map(([label, value]) => <div key={label} style={css.card}><b>{value || 0}</b><div style={css.muted}>{label}</div></div>)}</div>
        <Section title="Что сейчас подозрительно">{problems.length ? problems.map((p, i) => <div key={`${p.title}-${i}`} style={{ borderTop: i ? '1px solid var(--cc-border)' : 0, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}><div style={{ color: severityColor(p.severity), fontWeight: 700 }}>{p.title}</div><div style={{ ...css.mono, marginTop: 5 }}>{p.detail || 'деталей нет'}</div><div style={{ ...css.muted, marginTop: 5 }}>Что делать: {p.advice}</div></div>) : <div style={css.muted}>Явных проблем по текущему снимку нет.</div>}</Section>
        <Section title="Цепочки событий">{chains.length ? chains.slice(-20).map((c, i) => <div key={c.id || i} style={{ borderTop: i ? '1px solid var(--cc-border)' : 0, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}><div><b>{c.title}</b> <span style={css.muted}>{c.ts} · {c.type}</span></div><div style={css.mono}>{c.detail}</div></div>) : <div style={css.muted}>Пока нет событий уведомлений/WebView/native в последних строках лога.</div>}</Section>
        <Section title="Файл для ИИ"><div style={css.mono}>{report?.paths?.reportPath || snapshot?.paths?.reportPath || 'Отчёт появится после обновления диагностики'}</div><div style={{ ...css.muted, marginTop: 6 }}>Когда диагностика открыта или обновлена, приложение сохраняет JSON-отчёт сюда. Его можно читать без ручного копирования текста из интерфейса.</div></Section>
        <Section title="Последние ошибки">{recentErrors.length ? <div style={css.mono}>{recentErrors.join('\n')}</div> : <div style={css.muted}>Ошибок в последних строках нет.</div>}</Section>
      </div>
    </div></div>
  )
}

function Section({ title, children }) { return <div style={css.card}><div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>{children}</div> }
