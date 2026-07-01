import { runDomProbe } from './webviewDiagnostics.js'

export function runSelectedDiagnosticsDeepCheck({
  target, webviewRefs, messengersRef, runWebviewHealthProbe, traceNotif,
}) {
  const targetId = target?.tabId || target?.id
  if (!targetId) return false
  const webview = webviewRefs.current[targetId]
  if (!webview) return false
  const messenger = messengersRef.current.find(x => x.id === targetId)
  runWebviewHealthProbe({ webview, id: targetId, label: messenger?.name || target?.tabTitle || targetId, url: messenger?.url || target?.url || '', details: 'Диагностика выбранной вкладки' })
  runDomProbe(webview, targetId, traceNotif)
  try { webview.send?.('run-diagnostics') } catch {}
  return true
}
