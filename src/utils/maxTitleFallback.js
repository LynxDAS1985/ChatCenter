// MAX title/unread fallback: build a rich DOM snapshot only after MAX reports
// unread growth but did not emit __CC_NOTIF__/__CC_MSG__.

export const MAX_TITLE_FALLBACK_DELAY = 700

import { buildMaxTitleFallbackScript } from './maxTitleFallbackScript.js'
import { buildMessageDedupScope } from './messageProcessing.js'

export { buildMaxTitleFallbackScript }

export function parseMaxTitleFallbackResult(result) {
  if (!result) return null
  try {
    const data = typeof result === 'string' ? JSON.parse(result) : result
    const text = String(data.text || '').trim()
    if (!text || text.length > 500) return null
    if (String(data.source || '') === 'max-title-active') return null
    return {
      text,
      senderName: String(data.sender || '').trim(),
      iconDataUrl: String(data.avatar || '').startsWith('data:') ? String(data.avatar) : '',
      iconUrl: /^https?:\/\//.test(String(data.avatar || '')) ? String(data.avatar) : '',
      source: String(data.source || 'max-title-fallback'),
      diag: String(data.diag || '').slice(0, 4000),
      chatTag: String(data.chatTag || '').trim(),
    }
  } catch {
    return null
  }
}

export const normalizeSenderCachePart = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

export function buildSenderCacheKey(messengerId, senderName, chatTag = '') {
  const sender = normalizeSenderCachePart(senderName)
  return !messengerId || sender.length < 2 ? '' : `${messengerId}:sender:${normalizeSenderCachePart(chatTag) || sender}:${sender}`
}

export function getSenderCacheEntry(cache, messengerId, senderName, chatTag = '', maxAgeMs = 300000) {
  const key = buildSenderCacheKey(messengerId, senderName, chatTag), entry = cache?.[key]
  return key && entry && Date.now() - (entry.ts || 0) <= maxAgeMs ? entry : null
}

export function rememberSenderAvatar(cache, messengerId, senderName, chatTag = '', avatar = '') {
  const key = buildSenderCacheKey(messengerId, senderName, chatTag)
  if (!key || !avatar) return ''
  return cache[key] = { name: String(senderName || '').trim(), chatTag: String(chatTag || '').trim(), avatar, ts: Date.now() }, key
}

export function applySenderAvatarFallback(extra, cache, messengerId, traceNotif, text) {
  if (!extra?.senderName || extra.iconUrl || extra.iconDataUrl) return extra
  const cached = getSenderCacheEntry(cache, messengerId, extra.senderName, extra.chatTag)
  if (!cached?.avatar) return extra
  if (cached.avatar.startsWith('data:')) extra.iconDataUrl = cached.avatar; else extra.iconUrl = cached.avatar
  traceNotif?.('enrich', 'info', messengerId, text || '', `sender avatar cache-hit | key=${buildSenderCacheKey(messengerId, extra.senderName, extra.chatTag).slice(0, 80)} age=${Math.round((Date.now() - cached.ts) / 1000)}s`)
  return extra
}

export const MAX_TITLE_FALLBACK_SEEN_TTL_MS = 10 * 60 * 1000

export function buildMaxTitleFallbackFingerprint(messengerId, rich) {
  const norm = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
  const sender = norm(rich?.senderName)
  const chat = norm(rich?.chatTag)
  const text = norm(rich?.text).slice(0, 120)
  const badge = norm(rich?.badge || '')
  return !messengerId || !text ? '' : `${messengerId}:${chat || sender}:${sender}:${text}:${badge}`
}

export function hasRecentMessageForRich(recentMap, messengerId, rich, now = Date.now(), ttlMs = MAX_TITLE_FALLBACK_SEEN_TTL_MS) {
  if (!recentMap || !rich?.text) return false
  const scope = buildMessageDedupScope(rich.senderName || '', rich.chatTag || '', rich.messageId || '')
  const key = messengerId + ':' + (scope ? scope + ':' : '') + rich.text.slice(0, 60)
  const ts = recentMap.get(key)
  return !!ts && now - ts <= ttlMs
}

export function shouldBlockKnownMaxSidebarFallback(state, recentMap, messengerId, rich, now = Date.now()) {
  if (!rich || rich.source !== 'max-title-sidebar') return { blocked: false, reason: '' }
  const fingerprint = buildMaxTitleFallbackFingerprint(messengerId, rich)
  if (!fingerprint) return { blocked: false, reason: '' }
  const seen = state?.seen || {}
  const prev = seen[fingerprint]
  if (prev && now - (prev.ts || 0) <= MAX_TITLE_FALLBACK_SEEN_TTL_MS) {
    return { blocked: true, reason: `known-sidebar-preview age=${now - (prev.ts || 0)}ms`, fingerprint }
  }
  if (hasRecentMessageForRich(recentMap, messengerId, rich, now)) {
    return { blocked: true, reason: 'already-seen-in-recentNotifs', fingerprint }
  }
  return { blocked: false, reason: '', fingerprint }
}

export function rememberMaxSidebarFallback(state, messengerId, rich, now = Date.now()) {
  const fingerprint = buildMaxTitleFallbackFingerprint(messengerId, rich)
  if (!fingerprint || !state) return ''
  if (!state.seen) state.seen = {}
  state.seen[fingerprint] = { ts: now }
  const keys = Object.keys(state.seen)
  for (const key of keys) {
    if (now - (state.seen[key]?.ts || 0) > MAX_TITLE_FALLBACK_SEEN_TTL_MS) delete state.seen[key]
  }
  if (Object.keys(state.seen).length > 200) {
    const ordered = Object.keys(state.seen).sort((a, b) => (state.seen[a]?.ts || 0) - (state.seen[b]?.ts || 0))
    for (let i = 0; i < ordered.length - 200; i++) delete state.seen[ordered[i]]
  }
  return fingerprint
}

export function scheduleMaxTitleFallback({
  el,
  messengerId,
  delta,
  messengerUrl,
  notifReadyRef,
  lastRibbonTsRef,
  notifMidTsRef,
  timersRef,
  fallbackStateRef,
  recentNotifsRef,
  senderCacheRef,
  cleanupSenderCache,
  handleNewMessage,
  traceNotif,
}) {
  if (!/web\.max\.ru/.test(messengerUrl || '')) return
  if (!notifReadyRef.current[messengerId]) return
  clearTimeout(timersRef.current[messengerId])
  const scheduledAt = Date.now()
  traceNotif('source', 'info', messengerId, `title +${delta}`, `MAX title-fallback scheduled | ready=${!!notifReadyRef.current[messengerId]} url=${String(messengerUrl || '').slice(0, 80)}`)
  timersRef.current[messengerId] = setTimeout(() => {
    const lastRibbon = lastRibbonTsRef.current[messengerId] || 0
    const lastNotif = notifMidTsRef.current[messengerId] || 0
    traceNotif('debug', 'info', messengerId, `title +${delta}`, `MAX title-fallback guard | lastRibbonDelta=${lastRibbon - scheduledAt} lastNotifDelta=${lastNotif - scheduledAt} scheduledAt=${scheduledAt}`)
    if (lastRibbon >= scheduledAt || lastNotif >= scheduledAt) {
      traceNotif('source', 'info', messengerId, `title +${delta}`, 'MAX title-fallback skip | normal path already handled')
      return
    }
    el.executeJavaScript(buildMaxTitleFallbackScript())
      .then(result => {
        traceNotif('debug', 'info', messengerId, `title +${delta}`, `MAX title-fallback raw | ${String(result || '').slice(0, 3500)}`)
        const rich = parseMaxTitleFallbackResult(result)
        if (!rich) {
          traceNotif('enrich', 'warn', messengerId, `title +${delta}`, 'MAX title-fallback no rich message')
          return
        }
        const now = Date.now()
        const known = shouldBlockKnownMaxSidebarFallback(fallbackStateRef?.current, recentNotifsRef?.current, messengerId, rich, now)
        if (known.blocked) {
          if (known.fingerprint && fallbackStateRef?.current) rememberMaxSidebarFallback(fallbackStateRef.current, messengerId, rich, now)
          traceNotif('dedup', 'block', messengerId, rich.text, `MAX title-fallback stale sidebar | ${known.reason}`)
          return
        }
        const extra = {
          fromTitleFallback: true,
          ...(rich.senderName ? { senderName: rich.senderName } : {}),
          ...(rich.iconDataUrl ? { iconDataUrl: rich.iconDataUrl } : {}),
          ...(rich.iconUrl ? { iconUrl: rich.iconUrl } : {}),
          ...(rich.chatTag ? { chatTag: rich.chatTag } : {}),
        }
        if (rich.senderName && (rich.iconDataUrl || rich.iconUrl)) {
          const cacheKey = rememberSenderAvatar(senderCacheRef.current, messengerId, rich.senderName, rich.chatTag, rich.iconDataUrl || rich.iconUrl)
          cleanupSenderCache(senderCacheRef.current)
          traceNotif('enrich', 'info', messengerId, rich.text, `sender avatar cache-update | key=${cacheKey.slice(0, 80)}`)
        }
        applySenderAvatarFallback(extra, senderCacheRef.current, messengerId, traceNotif, rich.text)
        traceNotif('enrich', rich.senderName ? 'pass' : 'warn', messengerId, rich.text, `MAX title-fallback ${rich.source} | sender="${(rich.senderName || '').slice(0, 40)}" icon=${!!(rich.iconDataUrl || rich.iconUrl)} text="${rich.text.slice(0, 80)}"${rich.diag ? ' | ' + rich.diag : ''}`)
        rememberMaxSidebarFallback(fallbackStateRef?.current, messengerId, rich, now)
        handleNewMessage(messengerId, rich.text, extra)
      })
      .catch(err => {
        traceNotif('enrich', 'warn', messengerId, `title +${delta}`, `MAX title-fallback error: ${err?.message || err}`)
      })
  }, MAX_TITLE_FALLBACK_DELAY)
}
