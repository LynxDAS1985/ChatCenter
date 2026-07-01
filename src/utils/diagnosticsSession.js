export const DIAGNOSTICS_RING_LIMIT = 1200
export const DIAGNOSTICS_SEEN_LIMIT = 2400

export function createInitialDiagnosticsSession() {
  return {
    active: false,
    paused: false,
    deepWebview: true,
    sessionId: '',
    startedAt: '',
    stoppedAt: '',
    lastTickAt: '',
    lastSavedPath: '',
    lastError: '',
    events: [],
    seenKeys: [],
    latestReport: null,
    summary: { ticks: 0, events: 0, problems: 0, errors: 0, warnings: 0 },
  }
}

export function startDiagnosticsSession(prev = createInitialDiagnosticsSession()) {
  if (prev.active) return { ...prev, paused: false, lastError: '' }
  const now = new Date().toISOString()
  return {
    ...createInitialDiagnosticsSession(),
    deepWebview: true,
    active: true,
    paused: false,
    sessionId: `diag_${Date.now().toString(36)}`,
    startedAt: now,
    lastTickAt: now,
  }
}

export function pauseDiagnosticsSession(session) {
  return session.active ? { ...session, paused: true } : session
}

export function resumeDiagnosticsSession(session) {
  return session.active ? { ...session, paused: false, lastError: '' } : session
}

export function stopDiagnosticsSession(session) {
  return session.active ? { ...session, active: false, paused: false, stoppedAt: new Date().toISOString() } : session
}

export function clearDiagnosticsScreen(session) {
  return { ...session, events: [], seenKeys: [], summary: { ...session.summary, events: 0, problems: 0, errors: 0, warnings: 0 } }
}

export function resetDiagnosticsSession() {
  return createInitialDiagnosticsSession()
}

export function toggleDiagnosticsDeepWebview(session) {
  return { ...session, deepWebview: true }
}

export function markDiagnosticsSaved(session, path) {
  return { ...session, lastSavedPath: path || session.lastSavedPath, lastError: '' }
}

export function markDiagnosticsError(session, error) {
  return { ...session, lastError: String(error?.message || error || 'unknown diagnostics error') }
}

function eventKey(event) {
  return [
    event.kind || '',
    event.ts || '',
    event.source || '',
    event.title || '',
    event.text || '',
    event.detail || '',
  ].join('|').slice(0, 700)
}

function short(value, max = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function problemEvent(problem, index) {
  const severity = problem.severity || 'info'
  return {
    kind: 'problem',
    ts: problem.ts || '',
    severity,
    source: problem.source || 'diagnostics',
    title: problem.title || 'Диагностический маркер',
    text: short(problem.detail || problem.advice || ''),
    detail: short(problem.advice || problem.detail || '', 500),
    marker: severity === 'critical' ? 'red' : severity === 'warning' ? 'yellow' : 'blue',
    index,
  }
}

function maxFallbackEvent(event, index) {
  const suspicious = !!event.suspiciousActive || event.source === 'max-title-active' || !event.sender || !event.text
  return {
    kind: 'max-fallback',
    ts: event.ts || '',
    severity: suspicious ? 'warning' : 'info',
    source: event.source || 'max-title-fallback',
    title: suspicious ? 'MAX fallback: проверить источник' : 'MAX fallback',
    text: short(`${event.sender || 'нет отправителя'} → ${event.text || 'нет текста'}`),
    detail: short(`title +${event.titleDelta || 0}; candidates=${event.candidateCount || 0}; ribbon=${event.ribbonOk ? 'yes' : 'no'}; sound=${event.soundOk ? 'yes' : 'no'}; avatar=${event.iconOk === false ? 'no' : 'unknown'}`, 500),
    marker: suspicious ? 'yellow' : 'blue',
    index,
  }
}

function chainEvent(chain, index) {
  const raw = `${chain.title || ''} ${chain.detail || ''}`
  const hasSound = /sound|звук/i.test(raw)
  const hasNotif = /__CC_NOTIF__|custom-notify|NotifManager|ribbon|notif/i.test(raw)
  const hasAvatarProblem = /iconUrl=нет|iconData=нет|iconType=none|avatar=false|icon=false/i.test(raw)
  return {
    kind: hasSound ? 'sound' : hasNotif ? 'notification' : chain.type || 'chain',
    ts: chain.ts || '',
    severity: chain.status === 'error' ? 'critical' : hasAvatarProblem ? 'warning' : 'info',
    source: chain.type || 'chain',
    title: chain.title || 'Событие',
    text: short(chain.detail || ''),
    detail: short(chain.detail || '', 700),
    marker: chain.status === 'error' ? 'red' : hasAvatarProblem ? 'yellow' : 'blue',
    index,
  }
}

function traceEvent(row, index) {
  const detail = row.detail || ''
  const text = row.text || ''
  const source = /MAX title-fallback/i.test(detail) ? 'title-fallback' : row.step || 'trace'
  const severity = row.type === 'block' || /max-title-active|icon=false|iconUrl=нет|iconData=нет/i.test(detail) ? 'warning' : 'info'
  const maxLen = /max-sidebar/i.test(`${detail} ${text}`) ? 7000 : 700
  return {
    kind: row.step || 'trace',
    ts: row.ts || '',
    severity,
    source,
    title: `${row.mName || row.mid || 'system'} · ${row.step || 'trace'}`,
    text: short(text || detail, maxLen),
    detail: short(detail || text, maxLen),
    marker: severity === 'warning' ? 'yellow' : 'blue',
    index,
  }
}

export function buildDiagnosticsSessionEvents(report = {}) {
  const events = []
  ;(report.problems || []).forEach((p, i) => events.push(problemEvent(p, i)))
  ;(report.maxFallbackEvents || []).slice(-80).forEach((e, i) => events.push(maxFallbackEvent(e, i)))
  ;(report.chains || []).slice(-160).forEach((c, i) => events.push(chainEvent(c, i)))
  ;(report.runtime?.pipelineTrace || []).slice(-220)
    .filter(row => /source|enrich|handle|dedup|ribbon|sound|error/i.test(row?.step || '') || /__CC_NOTIF__|MAX title-fallback|max-sidebar|NotifManager|avatar|icon|sound|звук/i.test(`${row?.detail || ''} ${row?.text || ''}`))
    .forEach((row, i) => events.push(traceEvent(row, i)))
  return events
}

export function appendDiagnosticsReport(session, report) {
  if (!session.active) return session
  const incoming = buildDiagnosticsSessionEvents(report)
  const seen = new Set(session.seenKeys || [])
  const fresh = []
  const freshKeys = []
  for (const event of incoming) {
    const key = eventKey(event)
    if (seen.has(key)) continue
    seen.add(key)
    freshKeys.push(key)
    fresh.push({ ...event, id: `${session.sessionId || 'diag'}_${Date.now()}_${fresh.length}` })
  }
  const events = [...(session.events || []), ...fresh].slice(-DIAGNOSTICS_RING_LIMIT)
  const seenKeys = [...(session.seenKeys || []), ...freshKeys].slice(-DIAGNOSTICS_SEEN_LIMIT)
  const problems = events.filter(e => e.kind === 'problem').length
  const errors = events.filter(e => e.severity === 'critical').length
  const warnings = events.filter(e => e.severity === 'warning').length
  return {
    ...session,
    events,
    seenKeys,
    latestReport: report,
    lastTickAt: new Date().toISOString(),
    lastError: '',
    summary: {
      ticks: (session.summary?.ticks || 0) + 1,
      events: events.length,
      problems,
      errors,
      warnings,
    },
  }
}

export function buildDiagnosticsSessionReport(session) {
  return {
    ...(session.latestReport || {}),
    diagnosticsSession: {
      sessionId: session.sessionId,
      active: session.active,
      paused: session.paused,
      deepWebview: session.deepWebview,
      startedAt: session.startedAt,
      stoppedAt: session.stoppedAt,
      lastTickAt: session.lastTickAt,
      summary: session.summary,
      events: session.events || [],
    },
  }
}

export function diagnosticsSessionToText(session) {
  const head = [
    `Диагностическая сессия: ${session.sessionId || 'нет'}`,
    `Статус: ${session.active ? (session.paused ? 'пауза' : 'пишет') : 'остановлена'}`,
    `Старт: ${session.startedAt || 'нет'}`,
    `Последний снимок: ${session.lastTickAt || 'нет'}`,
    `Событий в буфере: ${session.events?.length || 0}`,
  ]
  const body = (session.events || []).slice(-120).map(e => {
    const marker = e.marker === 'red' ? 'RED' : e.marker === 'yellow' ? 'WARN' : 'INFO'
    return `[${marker}] ${e.title || e.kind}: ${e.text || ''}${e.detail ? ` | ${e.detail}` : ''}`
  })
  return [...head, '', ...body].join('\n')
}
