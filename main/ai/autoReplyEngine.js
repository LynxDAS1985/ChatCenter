// v1.1.0 (Phase 4.3): Auto-reply engine — чистые функции для проверки совпадений.
//
// matchRule(rule, message, now) → boolean — проверяет ОДНО правило против ОДНОГО сообщения.
// findMatchingRules(rules, message, now) → array — фильтрует только enabled + matched.
//
// "message" = объект с полями:
//   - text: string (текст сообщения)
//   - chatId: string (составной id 'accountId:rawId')
//   - messengerId: string ('native_cc', ...)
//   - senderId: string
//   - isOutgoing: boolean
//   - chatType: 'private' | 'group' | 'channel' | 'bot'
//   - timestamp: number (Unix ms)
//
// "now" = ms — текущее время (для тестируемости + race-free).

// ─── Cooldown ──────────────────────────────────────────────────────────────

/**
 * Проверить — прошло ли достаточно времени с последнего срабатывания.
 * @returns {boolean} true если можно срабатывать
 */
export function checkCooldown(rule, now) {
  if (!rule || !rule.lastMatchedAt || !rule.cooldownMinutes) return true
  const elapsedMs = now - rule.lastMatchedAt
  return elapsedMs >= rule.cooldownMinutes * 60 * 1000
}

// ─── Schedule (рабочее время) ──────────────────────────────────────────────

/**
 * Парсит 'HH:MM' в минуты от начала суток. Returns -1 если invalid.
 */
function parseTimeMinutes(hhmm) {
  if (typeof hhmm !== 'string') return -1
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return -1
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return -1
  return h * 60 + mm
}

/**
 * Проверить — попадает ли now в schedule (день недели + диапазон HH:MM).
 * Если schedule.enabled=false — всегда true.
 */
export function checkSchedule(schedule, now) {
  if (!schedule || !schedule.enabled) return true
  const d = new Date(now)
  // JS: 0=Вс..6=Сб → нам: 1=Пн..7=Вс
  let day = d.getDay()
  day = day === 0 ? 7 : day  // Вс → 7
  if (!Array.isArray(schedule.days) || !schedule.days.includes(day)) return false
  const fromMin = parseTimeMinutes(schedule.from)
  const toMin = parseTimeMinutes(schedule.to)
  if (fromMin < 0 || toMin < 0) return true  // invalid schedule — пропускаем
  const nowMin = d.getHours() * 60 + d.getMinutes()
  if (fromMin <= toMin) {
    return nowMin >= fromMin && nowMin <= toMin
  }
  // Через полночь (например from=22:00 to=06:00) — диапазон в 2 куска.
  return nowMin >= fromMin || nowMin <= toMin
}

// ─── Keywords ──────────────────────────────────────────────────────────────

/**
 * Проверить text против keywords. keywordsMode='any' → OR, 'all' → AND.
 * Match case-insensitive.
 */
export function checkKeywords(keywords, mode, text) {
  if (!Array.isArray(keywords) || keywords.length === 0) return true
  if (typeof text !== 'string' || text.length === 0) return false
  const lower = text.toLowerCase()
  if (mode === 'all') {
    return keywords.every(k => lower.includes(String(k).toLowerCase()))
  }
  return keywords.some(k => lower.includes(String(k).toLowerCase()))
}

// ─── Main matchRule ────────────────────────────────────────────────────────

/**
 * Проверить ОДНО правило против сообщения.
 * @returns {boolean}
 */
export function matchRule(rule, message, now) {
  if (!rule || !rule.enabled) return false
  if (!message) return false
  const t = rule.triggers || {}

  // 1. excludeOutgoing — не отвечать на свои сообщения
  if (t.excludeOutgoing !== false && message.isOutgoing) return false

  // 2. messengerId — только native_* (или explicit фильтр)
  if (Array.isArray(t.messengerIds) && t.messengerIds.length > 0) {
    if (!t.messengerIds.includes(message.messengerId)) return false
  } else {
    // default — только native_*
    if (typeof message.messengerId !== 'string' || !message.messengerId.startsWith('native_')) {
      return false
    }
  }

  // 3. chatIds whitelist
  if (Array.isArray(t.chatIds) && t.chatIds.length > 0) {
    if (!t.chatIds.includes(String(message.chatId))) return false
  }

  // 4. senderIds whitelist
  if (Array.isArray(t.senderIds) && t.senderIds.length > 0) {
    if (!t.senderIds.includes(String(message.senderId))) return false
  }

  // 5. excludeBots / excludeChannels
  if (t.excludeBots && message.chatType === 'bot') return false
  if (t.excludeChannels && message.chatType === 'channel') return false

  // 6. Keywords
  if (!checkKeywords(t.keywords, t.keywordsMode, message.text)) return false

  // 7. Schedule
  if (!checkSchedule(t.schedule, now)) return false

  // 8. Cooldown (последняя проверка — exit early на других всё ещё дёшево)
  if (!checkCooldown(rule, now)) return false

  return true
}

/**
 * Найти все правила которые matchаются. Возвращает массив правил (можно несколько).
 */
export function findMatchingRules(rules, message, now) {
  if (!Array.isArray(rules)) return []
  return rules.filter(r => matchRule(r, message, now))
}

// ─── Helpers для UI ────────────────────────────────────────────────────────

/**
 * Описать срабатывание правила (для audit log / streaming).
 */
export function describeRuleMatch(rule, message) {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    chatId: message.chatId,
    senderId: message.senderId,
    triggerSnapshot: {
      keywords: rule.triggers?.keywords || [],
      action: rule.action?.type || 'ai_reply',
    },
  }
}

export const _internal = { parseTimeMinutes }
