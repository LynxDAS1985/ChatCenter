const assert = require('assert')
const { pathToFileURL } = require('url')

async function main() {
  const mod = await import(pathToFileURL('src/utils/diagnosticsSession.js').href)
  const targetsMod = await import(pathToFileURL('src/utils/diagnosticsTargets.js').href)

  let s = mod.createInitialDiagnosticsSession()
  assert.strictEqual(s.active, false)
  assert.strictEqual(s.deepWebview, true)

  const builtTargets = targetsMod.buildDiagnosticsTargets({
    activeId: 'center',
    messengers: [
      { id: 'vk', name: 'ВКонтакте', url: 'https://vk.com/im', color: '#4C75A3' },
      { id: 'center', name: 'ЦентрЧатов', url: 'about:blank', color: '#38bdf8' },
    ],
  })
  assert.ok(builtTargets.targets.some(t => t.id === 'vk'), 'real VK WebView target must be present')
  assert.ok(!builtTargets.targets.some(t => t.id === 'center'), 'about:blank service tab must not become diagnostics target')
  assert.ok(builtTargets.targets.some(t => t.id === 'native_api'), 'native API target must stay present')
  const target = { id: 'max', tabId: 'max', tabTitle: 'Макс', messengerType: 'max', runtimeType: 'webview', url: 'https://web.max.ru/' }
  s = mod.startDiagnosticsSession(s, target)
  assert.strictEqual(s.active, true)
  assert.strictEqual(s.paused, false)
  assert.ok(s.sessionId)
  assert.strictEqual(s.target.messengerType, 'max')

  const report = {
    problems: [{ severity: 'critical', title: 'Нет звука', detail: 'sound missing', source: 'sound' }],
    maxFallbackEvents: [{ ts: 1, source: 'max-title-active', text: 'Сообщение', sender: 'Ivan В сети', suspiciousActive: true }],
    chains: [{ ts: '2026-06-29 10:00:00', type: 'notification', title: 'Уведомление / ribbon', detail: '__CC_NOTIF__ body=hi', status: 'ok' }],
    runtime: {
      pipelineTrace: [
        { ts: 2, step: 'ribbon', type: 'pass', mName: 'Макс', text: 'hi', detail: 'NotifManager show icon=true' },
        { ts: 3, step: 'sound', type: 'pass', mName: 'Макс', text: 'hi', detail: 'звук после ribbon' },
        { ts: 4, step: 'debug', type: 'info', mName: 'Макс', text: '__CC_DIAG__max-sidebar-decision: ' + 'x'.repeat(1200), detail: 'diagnostic | ready=true' },
      ],
    },
  }

  s = mod.appendDiagnosticsReport(s, report)
  assert.ok(s.events.length >= 5)
  assert.strictEqual(s.summary.ticks, 1)
  assert.ok(s.summary.errors >= 1)
  assert.ok(s.summary.warnings >= 1)

  const afterFirst = s.events.length
  s = mod.appendDiagnosticsReport(s, report)
  assert.strictEqual(s.events.length, afterFirst, 'same report should not duplicate live events')

  const text = mod.diagnosticsSessionToText(s)
  assert.ok(text.includes('Диагностическая сессия'))
  assert.ok(text.includes('MAX fallback') || text.includes('max-title-active'))
  assert.ok(s.events.some(e => String(e.text || '').includes('x'.repeat(1000))), 'max-sidebar diagnostics should not be cut at the old 700-char limit')

  const savedReport = mod.buildDiagnosticsSessionReport(s)
  assert.strictEqual(savedReport.diagnosticsSession.sessionId, s.sessionId)
  assert.strictEqual(savedReport.diagnosticsSession.target.messengerType, 'max')
  assert.strictEqual(savedReport.diagnosticsTarget.tabId, 'max')
  assert.ok(savedReport.sections.target)
  assert.ok(savedReport.sections.messengerSpecific.max)
  assert.ok(savedReport.diagnosticsSession.events.length)

  s = mod.pauseDiagnosticsSession(s)
  assert.strictEqual(s.paused, true)
  s = mod.resumeDiagnosticsSession(s)
  assert.strictEqual(s.paused, false)
  s = mod.toggleDiagnosticsDeepWebview(s)
  assert.strictEqual(s.deepWebview, true)
  s = mod.clearDiagnosticsScreen(s)
  assert.strictEqual(s.events.length, 0)
  s = mod.stopDiagnosticsSession(s)
  assert.strictEqual(s.active, false)
  assert.ok(s.stoppedAt)

  s = mod.resetDiagnosticsSession(s)
  assert.strictEqual(s.active, false)
  assert.strictEqual(s.events.length, 0)
  assert.strictEqual(s.sessionId, '')
  assert.strictEqual(s.deepWebview, true)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
