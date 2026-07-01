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
  assert.strictEqual(report.runtime.pipelineTrace.length, 1)

  const parsed = mod.parseLogLine('[2026-06-19 15:00:00] [INFO] token=abc')
  assert.strictEqual(parsed.level, 'INFO')
  assert.ok(parsed.raw.includes('token=***'))
  assert.strictEqual(mod.classifyLogLine('[2026-06-23 09:40:00] [TRACE] [MONITOR] [Макс] [MAX-SNAPSHOT] reason=count-change'), 'webview')
  assert.strictEqual(mod.classifyLogLine('[2026-06-23 09:40:00] [TRACE] [IPC-MAX] channel=new-message'), 'webview')
  assert.strictEqual(mod.classifyLogLine('[2026-07-01 13:00:00] [R:TRACE] [TRACE] · [ВКонтакте] debug: [VK-DIAG] candidate-new-incoming {"text":"Привет"}'), 'webview')

  const maxReport = mod.analyzeSystemDiagnostics({
    snapshot: { logText: '', app: { version: '1.2.8' } },
    runtimeContext: {
      pipelineTrace: [
        { ts: 1000, step: 'source', type: 'info', mid: 'max', mName: 'Макс', text: 'title +2', detail: 'MAX title-fallback scheduled' },
        { ts: 1700, step: 'enrich', type: 'pass', mid: 'max', mName: 'Макс', text: 'Первый', detail: 'MAX title-fallback max-title-sidebar | sender="Ivan" icon=true text="Первый" | rows=2 cand=2 selectedText=Первый selectedSender=Ivan topRows=1#s10@0,0,1x1|from=Ivan|chat=|body=Первый|bodyCls=text|p=1|imgs[]|href=|aria=|attrs=~2#s10@0,0,1x1|from=Petr|chat=|body=Второй|bodyCls=text|p=1|imgs[]|href=|aria=|attrs=' },
        { ts: 1800, step: 'handle', type: 'info', mid: 'max', mName: 'Макс', text: 'Первый', detail: 'extra={s:"Ivan",icon:true}' },
        { ts: 1900, step: 'dedup', type: 'block', mid: 'max', mName: 'Макс', text: 'Первый', detail: 'recentNotifs | age=3000ms' },
        { ts: 5000, step: 'enrich', type: 'pass', mid: 'max', mName: 'Макс', text: 'Сообщение', detail: 'MAX title-fallback max-title-active | sender="Ivan Ivan В сети" icon=true text="Сообщение"' },
      ],
    },
  })
  assert.strictEqual(maxReport.maxFallbackEvents.length, 2)
  assert.strictEqual(maxReport.maxFallbackEvents[0].titleDelta, 2)
  assert.strictEqual(maxReport.maxFallbackEvents[0].candidateCount, 2)
  assert.strictEqual(maxReport.maxFallbackEvents[0].dedupBlocked, true)
  assert.ok(maxReport.problems.some(p => p.source === 'max-fallback-candidates'))
  assert.ok(maxReport.problems.some(p => p.source === 'max-fallback-active'))

  const senderStripReport = mod.analyzeSystemDiagnostics({
    snapshot: { logText: '', app: { version: '1.2.8' } },
    runtimeContext: {
      pipelineTrace: [
        { ts: 1000, step: 'source', type: 'info', mid: 'max', mName: 'Макс', text: 'title +1', detail: 'MAX title-fallback scheduled' },
        { ts: 1700, step: 'enrich', type: 'pass', mid: 'max', mName: 'Макс', text: 'Антон Х : Спасибо за отзыв.', detail: 'MAX title-fallback max-title-sidebar | sender="Антон Х" icon=true text="Антон Х : Спасибо за отзыв." | selectedText=Антон Х : Спасибо за отзыв. selectedSender=Антон Х topRows=1#s10@0,0,1x1|from=Антон Х|chat=А.Х.|body=Антон Х : Спасибо за отзыв.|bodyCls=text|p=1|imgs[]|href=|aria=|attrs=' },
        { ts: 1800, step: 'handle', type: 'info', mid: 'max', mName: 'Макс', text: ': Спасибо за отзыв.', detail: 'sender-strip: убрано "Антон Х" из начала' },
        { ts: 1900, step: 'ribbon', type: 'pass', mid: 'max', mName: 'Макс', text: ': Спасибо за отзыв.', detail: 'main-result ok=true id=15 error= sender="Антон Х"' },
        { ts: 1950, step: 'sound', type: 'pass', mid: 'max', mName: 'Макс', text: ': Спасибо за отзыв.', detail: 'звук после подтверждённого ribbon' },
      ],
    },
  })
  assert.strictEqual(senderStripReport.maxFallbackEvents[0].ribbonOk, true)
  assert.strictEqual(senderStripReport.maxFallbackEvents[0].soundOk, true)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
