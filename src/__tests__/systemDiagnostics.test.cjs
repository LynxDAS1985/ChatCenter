const assert = require('assert')
const { pathToFileURL } = require('url')

async function main() {
  const mod = await import(pathToFileURL('src/utils/systemDiagnostics.js').href)

  const log = [
    '[2026-06-19 15:00:00] [INFO] [NotifManager] custom-notify messenger=max sender=Ivan text=hello token=abc123',
    '[2026-06-19 15:00:01] [WARN] webview executeJavaScript timeout',
    '[2026-06-19 15:00:01] [INFO] healthCheck response ok=true ms=8 error=',
    '[2026-06-19 15:00:01] [R:TRACE] [TRACE] ✓ [Макс] Ribbon: hello | main-result ok=true id=1 error= sender="Ivan" iconUrl=нет iconData=нет',
    '[2026-06-19 15:00:01] [R:INFO] [notif-renderer] addNotification id=2 iconType=none grouping=true itemsBefore=1 containerBefore=1',
    '[2026-06-19 15:00:02] [ERROR] Error occurred in handler for GUEST_VIEW_MANAGER_CALL',
  ].join('\n')

  const report = mod.analyzeSystemDiagnostics({
    snapshot: {
      logText: log,
      aiErrorsText: 'clientSecret=super-secret',
      app: { version: '1.2.8' },
      paths: { reportPath: 'system-diagnostics-report.json' },
    },
    runtimeContext: {
      messengers: [{ id: 'max', name: 'Макс', isNative: false, partition: 'persist:max' }],
      connectionHealth: { max: { id: 'max', label: 'Макс', state: 'slow', type: 'webview' } },
      pipelineTrace: [{ step: 'test' }],
      appReady: true,
    },
  })

  assert.strictEqual(report.summary.errors, 1)
  assert.strictEqual(report.summary.warnings, 1)
  assert.ok(report.summary.chains >= 2)
  assert.ok(report.problems.some(p => p.title.includes('Проблемные подключения')))
  assert.ok(report.problems.some(p => p.title.includes('Уведомления без аватарки')))
  assert.ok(report.problems.some(p => p.title.includes('сгруппированные уведомления')))
  assert.ok(JSON.stringify(report).includes('***'))
  assert.ok(!JSON.stringify(report).includes('super-secret'))

  const parsed = mod.parseLogLine('[2026-06-19 15:00:00] [INFO] token=abc')
  assert.strictEqual(parsed.level, 'INFO')
  assert.ok(parsed.raw.includes('token=***'))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
