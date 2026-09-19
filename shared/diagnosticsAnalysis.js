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
  return String(logText || '').split(/\r?\n/).filter(Boolean).map(parseLogLine)
}

export function classifyLogLine(line) {
  const text = typeof line === 'string' ? line : line?.raw || line?.text || ''
  const s = text.toLowerCase()
  const level = typeof line === 'object' ? String(line?.level || '').toUpperCase() : ''
  const errorField = s.match(/\berror\s*=\s*([^\]|,}]*)/i)
  const errorValue = (errorField?.[1] || '').trim()
  const hasErrorField = !!(errorValue && !/^[a-z_][\w-]*\s*=/.test(errorValue))
  if (level.includes('ERROR') || s.includes('[error]') || hasErrorField || s.includes('ошибка') || s.includes('failed')) return 'error'
  if (s.includes('notify') || s.includes('notif') || s.includes('ribbon') || s.includes('звук')) return 'notification'
  if (s.includes('webview') || s.includes('executejavascript') || s.includes('dom-ready') || s.includes('[max-') || s.includes('[ipc-max]') || s.includes('[vk-diag]') || s.includes('vkfull') || s.includes('[monitor]')) return 'webview'
  if (s.includes('tdlib') || s.includes('tg:') || s.includes('native')) return 'native'
  if (s.includes('[warn') || s.includes('warning') || s.includes('skip') || s.includes('timeout')) return 'warning'
  if (s.includes('ai:') || s.includes('provider') || s.includes('gigachat') || s.includes('openai')) return 'ai'
  return 'system'
}

export function buildNotificationChains(lines, limit = 2000) {
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

function findNotificationSignals(lines) {
  const noIcon = lines.filter(line => /Ribbon:|NotifManager|custom-notify/i.test(line.raw || line.text || '') && /(iconUrl=нет iconData=нет|icon=false|iconType=none)/i.test(line.raw || line.text || ''))
  const grouped = lines.filter(line => /addNotification/i.test(line.raw || line.text || '') && /grouping=true/i.test(line.raw || line.text || '') && /itemsBefore=[1-9]/i.test(line.raw || line.text || ''))
  return { noIcon, grouped }
}

function addProblem(problems, severity, title, detail, advice, source) { problems.push({ severity, title, detail, advice, source }) }

function uniqBy(items, keyFn) {
  const seen = new Set()
  return items.filter(item => { const key = keyFn(item); if (seen.has(key)) return false; seen.add(key); return true })
}

function extractMaxFallbackCandidates(detail = '') {
  const candidates = []; const re = /\|from=([^|~]*)\|chat=([^|~]*)\|body=([^|~]*)/g; let match
  while ((match = re.exec(detail))) { const sender = String(match[1] || '').trim(), chat = String(match[2] || '').trim(), body = String(match[3] || '').trim(); if (body) candidates.push({ sender, chat, body }) }
  return uniqBy(candidates, x => `${x.sender}|${x.chat}|${x.body}`).slice(0, 12)
}

function extractField(detail = '', name) { return String(detail.match(new RegExp(`${name}=([^|~]+)`))?.[1] || '').trim() }

function isSuspiciousActiveFallback(event) {
  const sender = String(event.sender || '')
  if (event.source !== 'max-title-active') return false
  if (/^Сообщение$/i.test(event.text || '') || /\bВ сети\b|\bonline\b/i.test(sender)) return true
  const words = sender.split(/\s+/).filter(Boolean), half = Math.floor(words.length / 2)
  return half >= 2 && words.slice(0, half).join(' ') === words.slice(half, half * 2).join(' ')
}

function traceTextVariants(text, sender = '') {
  const base = String(text || '').trim(), variants = new Set([base]), name = String(sender || '').trim()
  if (name && base.toLowerCase().startsWith(name.toLowerCase())) {
    const stripped = base.slice(name.length).trimStart(); variants.add(stripped); variants.add(stripped.replace(/^[:：\-–—]\s*/, '').trim())
  }
  return variants
}

export function analyzeMaxFallbackTrace(trace = []) {
  const rows = Array.isArray(trace) ? trace : []
  const events = []; let lastTitle = null
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {}
    if (!(row.mName === 'Макс' || /макс|max/i.test(row.mName || row.mid || ''))) continue
    if (row.step === 'source' && /^title \+\d+/.test(row.text || '')) {
      lastTitle = { ts: row.ts || 0, delta: Number(String(row.text).match(/\+(\d+)/)?.[1] || 0) }; continue
    }
    if (row.step !== 'enrich' || row.type !== 'pass' || !/MAX title-fallback/i.test(row.detail || '')) continue
    const detail = row.detail || '', source = detail.match(/MAX title-fallback\s+([^\s|]+)/i)?.[1] || '', text = String(row.text || '')
    const sender = detail.match(/sender="([^"]*)"/)?.[1] || extractField(detail, 'selectedSender')
    const candidates = extractMaxFallbackCandidates(detail)
    const windowEnd = (row.ts || 0) + 12000, tail = rows.slice(i + 1).filter(x => (x?.ts || 0) <= windowEnd && (x.mName === row.mName || x.mid === row.mid))
    const variants = traceTextVariants(text, sender), sameText = x => variants.has(String(x?.text || '').trim())
    const dedup = tail.find(x => x.step === 'dedup' && x.type === 'block' && sameText(x)), ribbon = tail.find(x => x.step === 'ribbon' && x.type === 'pass' && sameText(x)), sound = tail.find(x => x.step === 'sound' && x.type === 'pass' && sameText(x))
    const titleDelta = lastTitle && Math.abs((row.ts || 0) - lastTitle.ts) < 2500 ? lastTitle.delta : 0
    events.push({ ts: row.ts || 0, titleDelta, source, text, sender, candidateCount: candidates.length, candidates, dedupBlocked: !!dedup, dedupDetail: dedup?.detail || '', ribbonOk: !!ribbon, soundOk: !!sound, suspiciousActive: isSuspiciousActiveFallback({ source, text, sender }) })
  }
  return events.slice(-500)
}

export function analyzeSystemDiagnostics({ snapshot = {}, runtimeContext = {} } = {}) {
  const lines = parseLogLines(snapshot.logText || '')
  const errors = lines.filter(line => classifyLogLine(line) === 'error')
  const warnings = lines.filter(line => line.level.includes('WARN') || classifyLogLine(line) === 'warning')
  const healthItems = Object.values(runtimeContext.connectionHealth || {})
  const healthByState = countByState(healthItems)
  const notifSignals = findNotificationSignals(lines)
  const pipelineTrace = (runtimeContext.pipelineTrace || []).slice(-5000)
  const maxFallbackEvents = analyzeMaxFallbackTrace(pipelineTrace)
  const problems = []

  if (errors.length) {
    addProblem(problems, 'critical', `В журнале есть ошибки: ${errors.length}`, errors.slice(-3).map(x => x.raw).join('\n'), 'Открыть цепочки ниже и смотреть последний ERROR рядом с нужным модулем.', 'chatcenter.log')
  }

  const badConnections = healthItems.filter(x => ['slow', 'error'].includes(x?.state)); if (badConnections.length) {
    addProblem(problems, 'warning', `Проблемные подключения: ${badConnections.length}`, badConnections.map(x => `${x.label || x.id || 'unknown'}: ${x.state}${x.details ? `, ${x.details}` : ''}`).join('\n'), 'Включить глубокую WebView-проверку вручную и обновить диагностику.', 'connectionHealth')
  }

  if (snapshot.aiErrorsText) {
    addProblem(problems, 'info', 'Есть записи в AI errors', redactText(snapshot.aiErrorsText).split(/\r?\n/).filter(Boolean).slice(-3).join('\n'), 'Это отдельный AI-журнал; он не означает поломку системных уведомлений.', 'ai-errors.log')
  }

  if (notifSignals.noIcon.length) {
    addProblem(problems, 'warning', `Уведомления без аватарки: ${notifSignals.noIcon.length}`, notifSignals.noIcon.slice(-5).map(x => x.raw).join('\n'), 'Проверить источник sender/avatar до renderer: hook/fallback должен передать iconUrl или iconDataUrl.', 'notification-avatar')
  }

  if (notifSignals.grouped.length) {
    addProblem(problems, 'info', `Есть сгруппированные уведомления: ${notifSignals.grouped.length}`, notifSignals.grouped.slice(-5).map(x => x.raw).join('\n'), 'Если пользователь слышит звук, но не видит отдельную карточку, проверить отображение каждого элемента внутри группы.', 'notification-grouping')
  }

  const maxMultiLost = maxFallbackEvents.filter(x => x.titleDelta > 1 && x.dedupBlocked && x.candidates.some(c => c.body && c.body !== x.text)); if (maxMultiLost.length) {
    const detail = maxMultiLost.slice(-3).map(x => `title +${x.titleDelta}; выбран "${x.text}" → dedup; другие кандидаты:\n${x.candidates.filter(c => c.body && c.body !== x.text).map(c => `${c.sender}: ${c.body}`).join('\n')}`).join('\n\n')
    addProblem(problems, 'critical', `MAX fallback потерял кандидатов: ${maxMultiLost.length}`, detail, 'Нужно чинить MAX fallback: при title +N возвращать и обрабатывать список кандидатов, а не один выбранный текст.', 'max-fallback-candidates')
  }

  const badActive = maxFallbackEvents.filter(x => x.suspiciousActive); if (badActive.length) {
    const detail = badActive.slice(-5).map(x => `${x.source}: text="${x.text}" sender="${x.sender}" ribbon=${x.ribbonOk} dedup=${x.dedupBlocked}`).join('\n')
    addProblem(problems, 'warning', `MAX active fallback подозрителен: ${badActive.length}`, detail, 'Не считать max-title-active надёжным, если он даёт служебный text="Сообщение" или sender с дублем/статусом.', 'max-fallback-active')
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
    maxFallbackEvents,
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
      pipelineTrace,
      appReady: !!runtimeContext.appReady,
      aiVisible: !!runtimeContext.showAI,
      tasksCount: runtimeContext.tasksCount || 0,
      remindersCount: runtimeContext.remindersCount || 0,
    },
    recent: { errors: errors.slice(-500).map(x => x.raw), warnings: warnings.slice(-500).map(x => x.raw) },
  }
}
