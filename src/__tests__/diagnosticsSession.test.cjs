const assert = require('assert')
const { pathToFileURL } = require('url')

async function main() {
  const mod = await import(pathToFileURL('src/utils/diagnosticsSession.js').href)

  let s = mod.createInitialDiagnosticsSession()
  assert.strictEqual(s.active, false)
  assert.strictEqual(s.deepWebview, true)
  s = mod.startDiagnosticsSession(s)
  assert.strictEqual(s.active, true)
  assert.strictEqual(s.paused, false)
  assert.ok(s.sessionId)

  const report = {
    problems: [{ severity: 'critical', title: 'Нет звука', detail: 'sound missing', source: 'sound' }],
    maxFallbackEvents: [{ ts: 1, source: 'max-title-active', text: 'Сообщение', sender: 'Ivan В сети', suspiciousActive: true }],
    chains: [{ ts: '2026-06-29 10:00:00', type: 'notification', title: 'Уведомление / ribbon', detail: '__CC_NOTIF__ body=hi', status: 'ok' }],
    runtime: {
      pipelineTrace: [
        { ts: 2, step: 'ribbon', type: 'pass', mName: 'Макс', text: 'hi', detail: 'NotifManager show icon=true' },
        { ts: 3, step: 'sound', type: 'pass', mName: 'Макс', text: 'hi', detail: 'звук после ribbon' },
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

  const savedReport = mod.buildDiagnosticsSessionReport(s)
  assert.strictEqual(savedReport.diagnosticsSession.sessionId, s.sessionId)
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
