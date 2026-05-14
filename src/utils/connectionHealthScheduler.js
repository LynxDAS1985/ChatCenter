import { HEALTH_ERROR, HEALTH_PENDING, HEALTH_SLOW } from './connectionHealth.js'

export const HEALTH_SCHEDULER_TICK_MS = 5000
export const HEALTH_ACTIVE_MS = 30000
export const HEALTH_PROBLEM_MS = 60000
export const HEALTH_INACTIVE_MS = 180000
export const HEALTH_BACKGROUND_MS = 300000
export const HEALTH_MAX_WEBVIEW_PARALLEL = 2
export const HEALTH_MAX_NATIVE_PARALLEL = 1

export function nextHealthDelay({ item, isActive = false, windowFocused = true }) {
  if (!windowFocused) return HEALTH_BACKGROUND_MS
  if ([HEALTH_ERROR, HEALTH_SLOW].includes(item?.state)) return HEALTH_PROBLEM_MS
  if (isActive) return HEALTH_ACTIVE_MS
  return HEALTH_INACTIVE_MS
}

export function isHealthDue({
  item,
  now = Date.now(),
  isActive = false,
  windowFocused = true,
}) {
  if (!item?.id) return false
  if (item.state === HEALTH_PENDING && !item.lastCheckedAt) return true
  const lastCheckedAt = item.lastCheckedAt || item.lastOkAt || 0
  if (!lastCheckedAt) return true
  return now - lastCheckedAt >= nextHealthDelay({ item, isActive, windowFocused })
}

export function selectConnectionHealthJobs({
  connectionHealth = {},
  messengers = [],
  activeId = null,
  activeNativeAccountId = null,
  windowFocused = true,
  webviewLoading = {},
  inFlightWebview = new Set(),
  inFlightNative = new Set(),
  maxWebview = HEALTH_MAX_WEBVIEW_PARALLEL,
  maxNative = HEALTH_MAX_NATIVE_PARALLEL,
  now = Date.now(),
}) {
  const jobs = { webview: [], native: [] }
  let webviewSlots = Math.max(0, maxWebview - inFlightWebview.size)
  let nativeSlots = Math.max(0, maxNative - inFlightNative.size)
  const messengerById = new Map((messengers || []).map(m => [m.id, m]))

  const items = Object.values(connectionHealth || {})
    .filter(item => item?.id)
    .sort((a, b) => {
      const aPriority = priorityScore(a, isItemActive(a, activeId, activeNativeAccountId))
      const bPriority = priorityScore(b, isItemActive(b, activeId, activeNativeAccountId))
      if (aPriority !== bPriority) return bPriority - aPriority
      return (a.lastCheckedAt || 0) - (b.lastCheckedAt || 0)
    })

  for (const item of items) {
    if (item.type === 'native') {
      if (nativeSlots <= 0 || inFlightNative.has(item.id)) continue
      if (!isHealthDue({ item, now, isActive: item.id === activeNativeAccountId, windowFocused })) continue
      jobs.native.push({ id: item.id })
      nativeSlots--
      continue
    }

    if (item.type !== 'webview') continue
    if (webviewSlots <= 0 || inFlightWebview.has(item.id)) continue
    if (webviewLoading[item.id]) continue
    const messenger = messengerById.get(item.id)
    if (!messenger || messenger.isNative) continue
    const isActive = item.id === activeId
    if (!isHealthDue({ item, now, isActive, windowFocused })) continue
    jobs.webview.push({
      id: item.id,
      label: messenger.name || item.label || item.id,
      url: messenger.url || item.url || '',
    })
    webviewSlots--
  }

  return jobs
}

function isItemActive(item, activeId, activeNativeAccountId) {
  if (item?.type === 'native') return item.id === activeNativeAccountId
  return item?.id === activeId
}

function priorityScore(item, isActive) {
  if (item?.state === HEALTH_ERROR) return 400
  if (item?.state === HEALTH_SLOW) return 300
  if (isActive) return 200
  if (item?.state === HEALTH_PENDING) return 100
  return 0
}
