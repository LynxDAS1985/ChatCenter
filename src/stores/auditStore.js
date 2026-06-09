// v0.98.0 (Phase 2 M2.4): Audit Log store — renderer side.
//
// Главные функции:
//   - createAuditRecord(params) — нормализовать данные для записи
//   - logAuditEvent(record) — отправить main для persistent storage
//   - listAuditEvents(filter, limit) — получить записи
//   - clearOldAudit(olderThanDays) — удалить старые
//   - getRecentRevertableActions(count) — для UI «Откатить N»
//
// Запись сохраняется в JSONL файл (`audit-log/YYYY-MM.jsonl` в userData).
// Persistent через IPC. Чувствительные поля (apiKey, clientSecret) маскируются.
// Текст обрезается до 200 chars (privacy default).

const TEXT_PREVIEW_LIMIT = 200

const SENSITIVE_KEYS = [
  'apiKey', 'api_key',
  'clientSecret', 'client_secret',
  'password', 'token',
  'secret', 'authorization',
]

let counterOffset = 0

function generateId(timestamp) {
  counterOffset = (counterOffset + 1) % 1000
  const rand = Math.floor(Math.random() * 1000)
  return `audit_${timestamp}_${counterOffset}_${rand}`
}

function sanitizeArgs(args) {
  if (args == null || typeof args !== 'object') return args
  const result = {}
  for (const [key, value] of Object.entries(args)) {
    if (SENSITIVE_KEYS.includes(key)) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'string' && key === 'text' && value.length > TEXT_PREVIEW_LIMIT) {
      result[key] = value.slice(0, TEXT_PREVIEW_LIMIT) + '…'
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Создать запись audit log (без сохранения).
 *
 * @param {object} params
 * @returns {object}
 */
export function createAuditRecord(params) {
  const p = params || {}
  const timestamp = Date.now()
  return {
    id: generateId(timestamp),
    timestamp,
    actor: p.actor || 'unknown',
    actorId: p.actorId || null,
    actionId: p.actionId || 'unknown',
    source: p.source || null,
    args: sanitizeArgs(p.args),
    permissionResult: p.permissionResult || null,
    executionResult: p.executionResult || null,
    durationMs: typeof p.durationMs === 'number' ? p.durationMs : null,
    errorMessage: p.errorMessage || null,
    revertable: !!p.revertable,
  }
}

/**
 * Сохранить audit запись (через IPC в main).
 *
 * @returns {Promise<{ok, id?, error?}>}
 */
export async function logAuditEvent(params) {
  if (!globalThis.window?.api?.invoke) {
    return { ok: false, error: 'no_ipc' }
  }
  try {
    const record = createAuditRecord(params)
    const result = await globalThis.window.api.invoke('audit:log', record)
    return result || { ok: false, error: 'invoke_returned_nothing' }
  } catch (e) {
    return { ok: false, error: e?.message || 'logAuditEvent_threw' }
  }
}

/**
 * Получить список audit записей (через IPC).
 *
 * @param {object} filter — { actionId?, actor?, fromTs?, toTs? }
 * @param {number} limit
 * @returns {Promise<{ok, records?: Array, error?}>}
 */
export async function listAuditEvents(filter = {}, limit = 100) {
  if (!globalThis.window?.api?.invoke) {
    return { ok: false, error: 'no_ipc', records: [] }
  }
  try {
    const result = await globalThis.window.api.invoke('audit:list', { filter, limit })
    return result || { ok: false, error: 'invoke_returned_nothing', records: [] }
  } catch (e) {
    return { ok: false, error: e?.message, records: [] }
  }
}

export async function clearOldAudit(olderThanDays = 30) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    return await globalThis.window.api.invoke('audit:clear', { olderThanDays })
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export async function getRecentRevertableActions(count = 5) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc', records: [] }
  try {
    return await globalThis.window.api.invoke('audit:recent-revertable', { count })
  } catch (e) {
    return { ok: false, error: e?.message, records: [] }
  }
}

export const _internal = {
  sanitizeArgs,
  generateId,
  TEXT_PREVIEW_LIMIT,
  SENSITIVE_KEYS,
}
