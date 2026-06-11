// v1.2.8: импорт/экспорт правил авто-ответов в JSON.
//
// Зачем: бэкап правил (если переустанавливаешь систему) + перенос между ПК.
// Не передаются API ключи или audit log — только правила.
//
// Формат JSON:
//   {
//     "ccVersion": "1.2.8",
//     "exportedAt": "2026-06-11T17:42:00.000Z",
//     "rules": [
//       {
//         "name": "...",
//         "enabled": true,
//         "triggers": { ... },
//         "action": { ... },
//         "cooldownMinutes": 60
//       },
//       ...
//     ]
//   }
//
// Поля id / matchedCount / lastMatchedAt — пропускаются при экспорте
// (это runtime данные, для импорта генерируется новый id).

const SUPPORTED_VERSIONS = ['1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6',
                             '1.1.7', '1.1.8', '1.1.9', '1.1.10', '1.1.11', '1.1.12', '1.1.13',
                             '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18',
                             '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8']

/**
 * Сериализовать массив правил в JSON строку.
 * @param {Array} rules — массив правил из autoReplyRulesStore
 * @param {string} [appVersion]
 * @returns {string} JSON
 */
export function exportRulesToJson(rules, appVersion = '1.2.8') {
  if (!Array.isArray(rules)) throw new Error('rules должен быть массивом')

  const cleaned = rules.map(r => stripRuntimeFields(r))
  const payload = {
    ccVersion: appVersion,
    exportedAt: new Date().toISOString(),
    rules: cleaned,
  }
  return JSON.stringify(payload, null, 2)
}

/**
 * Распарсить JSON и провалидировать.
 * Возвращает { ok, rules?, error?, warnings?: string[] }.
 *
 * @param {string} json
 * @returns {{ok: boolean, rules?: Array, error?: string, warnings?: string[]}}
 */
export function parseImportJson(json) {
  if (typeof json !== 'string' || !json.trim()) {
    return { ok: false, error: 'Файл пустой' }
  }

  let parsed
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    return { ok: false, error: 'Неправильный JSON: ' + (e?.message || e) }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Файл не содержит объект' }
  }

  if (!Array.isArray(parsed.rules)) {
    return { ok: false, error: 'Нет поля «rules» (массив правил)' }
  }

  const warnings = []
  if (parsed.ccVersion && !SUPPORTED_VERSIONS.includes(parsed.ccVersion)) {
    warnings.push(`Файл от версии ${parsed.ccVersion} — может содержать несовместимые поля`)
  }

  // Валидация каждого правила (мягкая — отбрасываем невалидные)
  const validRules = []
  for (let i = 0; i < parsed.rules.length; i++) {
    const r = parsed.rules[i]
    const v = validateRule(r, i)
    if (v.ok) {
      validRules.push(v.rule)
    } else {
      warnings.push(`Правило #${i + 1} пропущено: ${v.error}`)
    }
  }

  if (validRules.length === 0) {
    return { ok: false, error: 'Ни одного валидного правила в файле', warnings }
  }

  return { ok: true, rules: validRules, warnings }
}

/**
 * Убрать runtime поля из правила (id/matchedCount/lastMatchedAt).
 */
function stripRuntimeFields(rule) {
  if (!rule || typeof rule !== 'object') return rule
  const { id, matchedCount, lastMatchedAt, ...rest } = rule
  return rest
}

/**
 * Мягкая валидация правила. Возвращает { ok, rule?, error? }.
 */
function validateRule(rule, idx) {
  if (!rule || typeof rule !== 'object') {
    return { ok: false, error: 'не объект' }
  }
  if (!rule.name || typeof rule.name !== 'string') {
    return { ok: false, error: 'нет поля name' }
  }
  if (!rule.action || typeof rule.action !== 'object') {
    return { ok: false, error: 'нет action' }
  }
  if (!rule.action.type) {
    return { ok: false, error: 'нет action.type' }
  }
  if (rule.action.type !== 'ai_reply' && rule.action.type !== 'mark_read') {
    return { ok: false, error: `неизвестный action.type=${rule.action.type}` }
  }
  if (!rule.triggers || typeof rule.triggers !== 'object') {
    return { ok: false, error: 'нет triggers' }
  }

  // Нормализуем триггеры (заменяем undefined на дефолты для backward compat)
  const cleaned = {
    name: String(rule.name).slice(0, 100),
    enabled: rule.enabled !== false,
    triggers: {
      chatIds: Array.isArray(rule.triggers.chatIds) ? rule.triggers.chatIds : [],
      messengerIds: Array.isArray(rule.triggers.messengerIds) ? rule.triggers.messengerIds : [],
      senderIds: Array.isArray(rule.triggers.senderIds) ? rule.triggers.senderIds : [],
      keywords: Array.isArray(rule.triggers.keywords) ? rule.triggers.keywords : [],
      keywordsMode: rule.triggers.keywordsMode === 'all' ? 'all' : 'any',
      schedule: rule.triggers.schedule && typeof rule.triggers.schedule === 'object'
        ? rule.triggers.schedule : { enabled: false },
      excludeBots: rule.triggers.excludeBots !== false,
      excludeChannels: rule.triggers.excludeChannels !== false,
      excludeOutgoing: rule.triggers.excludeOutgoing !== false,
    },
    action: {
      type: rule.action.type,
      ...(rule.action.aiPromptHint ? { aiPromptHint: String(rule.action.aiPromptHint).slice(0, 500) } : {}),
      ...(rule.action.useBridge === true ? { useBridge: true } : {}),
      ...(Array.isArray(rule.action.bridgeChain) ? { bridgeChain: rule.action.bridgeChain } : {}),
      ...(rule.action.bridgeMode ? { bridgeMode: rule.action.bridgeMode } : {}),
    },
    cooldownMinutes: Number(rule.cooldownMinutes) > 0 ? Number(rule.cooldownMinutes) : 60,
  }
  return { ok: true, rule: cleaned }
}
