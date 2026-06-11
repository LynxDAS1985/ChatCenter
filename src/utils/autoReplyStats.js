// v1.2.5: pure helpers для статистики авто-ответов из audit log.
//
// Используется в AIActivityDashboard для отображения графика «AI ответил N раз в день».
// Группирует audit записи actor='ai_auto' по дням за последние N дней.

/**
 * Сгруппировать audit записи по дням (по локальному timezone).
 * Возвращает массив объектов { date: 'YYYY-MM-DD', total, byAction: {markRead, aiReply, aiReplyBridge}, errors }.
 *
 * @param {Array<{actor, actionId, timestamp, executionResult}>} auditEntries
 * @param {number} [days=7] — сколько последних дней включать (default 7)
 * @returns {Array<{date: string, total: number, byAction: object, errors: number}>}
 */
export function groupAutoReplyByDay(auditEntries, days = 7) {
  if (!Array.isArray(auditEntries)) return []

  // Подготовить массив дней — последние `days` календарных дней от сегодня
  const result = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    result.push({
      date: formatDate(d),
      total: 0,
      byAction: { markRead: 0, aiReply: 0, aiReplyBridge: 0, other: 0 },
      errors: 0,
    })
  }

  // Группировать
  const byDate = new Map(result.map(r => [r.date, r]))
  for (const entry of auditEntries) {
    if (entry?.actor !== 'ai_auto') continue
    const ts = Number(entry.timestamp || 0)
    if (!ts) continue
    const d = new Date(ts)
    d.setHours(0, 0, 0, 0)
    const key = formatDate(d)
    const slot = byDate.get(key)
    if (!slot) continue

    slot.total++
    if (entry.executionResult && entry.executionResult !== 'ok') {
      slot.errors++
    }
    const actionId = entry.actionId || ''
    if (actionId === 'mark_as_read') slot.byAction.markRead++
    else if (actionId === 'ai_reply_summary') slot.byAction.aiReply++
    else if (actionId === 'ai_reply_bridge_summary') slot.byAction.aiReplyBridge++
    else slot.byAction.other++
  }

  return result
}

/**
 * Вычислить статистику за период.
 *
 * @param {Array} grouped — output от groupAutoReplyByDay
 * @returns {{total, max, errors, errorRate, hasData}}
 */
export function summarizeStats(grouped) {
  if (!Array.isArray(grouped) || grouped.length === 0) {
    return { total: 0, max: 0, errors: 0, errorRate: 0, hasData: false }
  }
  let total = 0
  let max = 0
  let errors = 0
  for (const d of grouped) {
    total += d.total
    if (d.total > max) max = d.total
    errors += d.errors
  }
  return {
    total,
    max,
    errors,
    errorRate: total > 0 ? Math.round((errors / total) * 100) : 0,
    hasData: total > 0,
  }
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Короткое имя дня недели для подписи на графике.
 */
export function shortDayLabel(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    const names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    return names[d.getDay()]
  } catch (_) { return '?' }
}
