export const HEALTH_PENDING = 'pending'
export const HEALTH_OK = 'ok'
export const HEALTH_SLOW = 'slow'
export const HEALTH_ERROR = 'error'

export const DEFAULT_SLOW_MS = 10000

const STATE_ORDER = {
  [HEALTH_PENDING]: 0,
  [HEALTH_OK]: 1,
  [HEALTH_SLOW]: 2,
  [HEALTH_ERROR]: 3,
}

const COLORS = {
  [HEALTH_PENDING]: '#9ca3af',
  [HEALTH_OK]: '#22c55e',
  [HEALTH_SLOW]: '#eab308',
  [HEALTH_ERROR]: '#ef4444',
}

const LABELS = {
  [HEALTH_PENDING]: 'Ожидание проверки',
  [HEALTH_OK]: 'Работает',
  [HEALTH_SLOW]: 'Медленно отвечает',
  [HEALTH_ERROR]: 'Не отвечает / ошибка',
}

export function normalizeHealthState(state) {
  return STATE_ORDER[state] === undefined ? HEALTH_PENDING : state
}

export function createPendingHealth(input = {}) {
  const now = input.now || Date.now()
  return {
    id: input.id || '',
    type: input.type || 'webview',
    label: input.label || input.id || '',
    state: HEALTH_PENDING,
    startedAt: input.startedAt || now,
    lastCheckedAt: input.lastCheckedAt || null,
    lastOkAt: input.lastOkAt || null,
    lastMs: input.lastMs ?? null,
    url: input.url || '',
    errorCode: input.errorCode || null,
    errorText: input.errorText || '',
    details: input.details || '',
  }
}

function mergeHealth(prev, patch) {
  return {
    ...createPendingHealth(prev || patch),
    ...(prev || {}),
    ...patch,
  }
}

export function markHealthPending(prev, input = {}) {
  const now = input.now || Date.now()
  return mergeHealth(prev, {
    id: input.id || prev?.id || '',
    type: input.type || prev?.type || 'webview',
    label: input.label || prev?.label || input.id || '',
    state: HEALTH_PENDING,
    startedAt: now,
    lastCheckedAt: now,
    lastMs: input.lastMs ?? null,
    url: input.url || prev?.url || '',
    errorCode: null,
    errorText: '',
    details: input.details || '',
  })
}

export function markHealthOk(prev, input = {}) {
  const now = input.now || Date.now()
  const startedAt = input.startedAt || prev?.startedAt || now
  const lastMs = Object.prototype.hasOwnProperty.call(input, 'lastMs')
    ? input.lastMs
    : (prev?.lastMs ?? null)
  return mergeHealth(prev, {
    id: input.id || prev?.id || '',
    type: input.type || prev?.type || 'webview',
    label: input.label || prev?.label || input.id || '',
    state: HEALTH_OK,
    startedAt,
    lastCheckedAt: now,
    lastOkAt: now,
    lastMs,
    url: input.url || prev?.url || '',
    errorCode: null,
    errorText: '',
    details: input.details || '',
  })
}

export function markHealthSlow(prev, input = {}) {
  const now = input.now || Date.now()
  const startedAt = input.startedAt || prev?.startedAt || now
  const lastMs = input.lastMs ?? Math.max(0, now - startedAt)
  return mergeHealth(prev, {
    id: input.id || prev?.id || '',
    type: input.type || prev?.type || 'webview',
    label: input.label || prev?.label || input.id || '',
    state: HEALTH_SLOW,
    startedAt,
    lastCheckedAt: now,
    lastMs,
    url: input.url || prev?.url || '',
    errorCode: input.errorCode ?? prev?.errorCode ?? null,
    errorText: input.errorText || prev?.errorText || '',
    details: input.details || prev?.details || '',
  })
}

export function markHealthError(prev, input = {}) {
  const now = input.now || Date.now()
  const startedAt = input.startedAt || prev?.startedAt || now
  const lastMs = input.lastMs ?? Math.max(0, now - startedAt)
  return mergeHealth(prev, {
    id: input.id || prev?.id || '',
    type: input.type || prev?.type || 'webview',
    label: input.label || prev?.label || input.id || '',
    state: HEALTH_ERROR,
    startedAt,
    lastCheckedAt: now,
    lastMs,
    url: input.url || prev?.url || '',
    errorCode: input.errorCode ?? null,
    errorText: input.errorText || '',
    details: input.details || '',
  })
}

export function markHealthByDuration(prev, input = {}) {
  const thresholdMs = input.slowMs || DEFAULT_SLOW_MS
  const now = input.now || Date.now()
  const startedAt = input.startedAt || prev?.startedAt || now
  const lastMs = input.lastMs ?? Math.max(0, now - startedAt)
  const nextInput = { ...input, now, startedAt, lastMs }
  return lastMs >= thresholdMs ? markHealthSlow(prev, nextInput) : markHealthOk(prev, nextInput)
}

export function markHealthByProbe(prev, input = {}) {
  const lastMs = input.lastMs
  if (typeof lastMs === 'number' && Number.isFinite(lastMs)) {
    return markHealthByDuration(prev, input)
  }
  return markHealthOk(prev, input)
}

export function getHealthColor(health) {
  return COLORS[normalizeHealthState(health?.state)] || COLORS[HEALTH_PENDING]
}

export function getHealthLabel(health) {
  return LABELS[normalizeHealthState(health?.state)] || LABELS[HEALTH_PENDING]
}

export function formatHealthMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '-'
  if (ms < 1000) return `${Math.round(ms)} мс`
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} сек`
}

export function formatHealthTime(ts) {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '-'
  }
}

export function getHealthTooltip(health, fallbackLabel = '') {
  const h = health || createPendingHealth({ label: fallbackLabel })
  const lines = [
    h.label || fallbackLabel || 'Подключение',
    getHealthLabel(h),
    '',
    `Последний ответ: ${formatHealthMs(h.lastMs)}`,
    `Последняя проверка: ${formatHealthTime(h.lastCheckedAt)}`,
  ]
  if (h.url) lines.push(`URL: ${h.url}`)
  if (h.errorCode || h.errorText) lines.push(`Ошибка: ${[h.errorCode, h.errorText].filter(Boolean).join(' ')}`)
  if (h.details) lines.push(String(h.details))
  lines.push('', 'Нажмите, чтобы открыть "Подключения"')
  return lines.join('\n')
}

export function getOverallHealth(items) {
  const list = Array.isArray(items) ? items : Object.values(items || {})
  if (!list.length) return HEALTH_PENDING
  return list
    .map(item => normalizeHealthState(item?.state))
    .sort((a, b) => STATE_ORDER[b] - STATE_ORDER[a])[0] || HEALTH_PENDING
}

export function getOverallHealthLabel(items) {
  return getHealthLabel({ state: getOverallHealth(items) })
}
