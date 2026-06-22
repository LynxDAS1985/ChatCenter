const SECRET_PATTERNS = [
  /(api[_-]?key|clientSecret|client_secret|token|password|pass|secret)\s*[:=]\s*["']?[^"',\s}]+/gi,
  /("(?:api[_-]?key|clientSecret|client_secret|token|password|pass|secret)"\s*:\s*")[^"]+/gi,
  /(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
]

export function redactText(value) {
  let text = String(value ?? '')
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix) => prefix.endsWith('"') ? `${prefix}***` : `${prefix}=***`)
  }
  return text
}

export function parseLogLine(line) {
  const text = redactText(line)
  const match = text.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s*(.*)$/)
  if (!match) return { ts: '', level: 'INFO', text, raw: text }
  return { ts: match[1], level: match[2], text: match[3], raw: text }
}

export function parseLogLines(logText) {
  return String(logText || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseLogLine)
}

export function classifyLogLine(line) {
  const text = typeof line === 'string' ? line : line?.raw || line?.text || ''
  const s = text.toLowerCase()
  if (s.includes('[error]') || s.includes(' error') || s.includes('ошибка') || s.includes('failed')) return 'error'
  if (s.includes('notify') || s.includes('notif') || s.includes('ribbon') || s.includes('звук')) return 'notification'
  if (s.includes('webview') || s.includes('executejavascript') || s.includes('dom-ready')) return 'webview'
  if (s.includes('tdlib') || s.includes('tg:') || s.includes('native')) return 'native'
  if (s.includes('[warn') || s.includes('warning') || s.includes('skip') || s.includes('timeout')) return 'warning'
  if (s.includes('ai:') || s.includes('provider') || s.includes('gigachat') || s.includes('openai')) return 'ai'
  return 'system'
}

export function buildNotificationChains(lines, limit = 40) {
  return lines
    .filter(line => ['notification', 'webview', 'native'].includes(classifyLogLine(line)))
    .slice(-limit)
    .map((line, index) => ({
      id: `${line.ts || 'no-ts'}-${index}`,
      ts: line.ts,
      type: classifyLogLine(line),
      level: line.level,
      title: chainTitle(line),
      detail: line.text,
      status: classifyLogLine(line) === 'error' ? 'error' : line.level.includes('WARN') ? 'warn' : 'ok',
    }))
}

function chainTitle(line) {
  const text = line.text || ''
  if (/custom-notify|NotifManager|Ribbon/i.test(text)) return 'Уведомление / ribbon'
  if (/sound|звук/i.test(text)) return 'Звук уведомления'
  if (/webview|executeJavaScript|dom-ready/i.test(text)) return 'WebView'
  if (/tdlib|native|tg:/i.test(text)) return 'Native backend'
  return 'Системное событие'
}

function countByState(items) {
  return items.reduce((acc, item) => {
    const state = item?.state || 'unknown'
    acc[state] = (acc[state] || 0) + 1
    return acc
  }, {})
}

export function analyzeSystemDiagnostics({ snapshot = {}, runtimeContext = {} } = {}) {
  const lines = parseLogLines(snapshot.logText || '')
  const errors = lines.filter(line => classifyLogLine(line) === 'error')
  const warnings = lines.filter(line => line.level.includes('WARN') || classifyLogLine(line) === 'warning')
  const healthItems = Object.values(runtimeContext.connectionHealth || {})
  const healthByState = countByState(healthItems)
  const problems = []

  if (errors.length) {
    problems.push({
      severity: 'critical',
      title: `В журнале есть ошибки: ${errors.length}`,
      detail: errors.slice(-3).map(x => x.raw).join('\n'),
      advice: 'Открыть цепочки ниже и смотреть последний ERROR рядом с нужным модулем.',
      source: 'chatcenter.log',
    })
  }

  const badConnections = healthItems.filter(x => ['slow', 'error'].includes(x?.state))
  if (badConnections.length) {
    problems.push({
      severity: 'warning',
      title: `Проблемные подключения: ${badConnections.length}`,
      detail: badConnections.map(x => `${x.label || x.id || 'unknown'}: ${x.state}${x.details ? `, ${x.details}` : ''}`).join('\n'),
      advice: 'Включить глубокую WebView-проверку вручную и обновить диагностику.',
      source: 'connectionHealth',
    })
  }

  if (snapshot.aiErrorsText) {
    problems.push({
      severity: 'info',
      title: 'Есть записи в AI errors',
      detail: redactText(snapshot.aiErrorsText).split(/\r?\n/).filter(Boolean).slice(-3).join('\n'),
      advice: 'Это отдельный AI-журнал; он не означает поломку системных уведомлений.',
      source: 'ai-errors.log',
    })
  }

  const chains = buildNotificationChains(lines)
  return {
    createdAt: new Date().toISOString(),
    version: snapshot.app?.version || runtimeContext.version || '',
    paths: snapshot.paths || {},
    summary: {
      logLines: lines.length,
      errors: errors.length,
      warnings: warnings.length,
      chains: chains.length,
      messengers: (runtimeContext.messengers || []).length,
      activeId: runtimeContext.activeId || null,
      activeNativeAccountId: runtimeContext.activeNativeAccountId || null,
      connectionHealth: healthByState,
    },
    problems,
    chains,
    runtime: {
      messengers: (runtimeContext.messengers || []).map(m => ({
        id: m.id,
        name: m.name,
        type: m.isNative ? 'native' : 'webview',
        hasPartition: !!m.partition,
      })),
      webviewLoading: runtimeContext.webviewLoading || {},
      unreadCounts: runtimeContext.unreadCounts || {},
      unreadSplit: runtimeContext.unreadSplit || {},
      pipelineTrace: (runtimeContext.pipelineTrace || []).slice(-120),
      appReady: !!runtimeContext.appReady,
      aiVisible: !!runtimeContext.showAI,
      tasksCount: runtimeContext.tasksCount || 0,
      remindersCount: runtimeContext.remindersCount || 0,
    },
    recent: { errors: errors.slice(-20).map(x => x.raw), warnings: warnings.slice(-20).map(x => x.raw) },
  }
}
