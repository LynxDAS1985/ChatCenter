import {
  DEFAULT_SLOW_MS,
  markHealthByProbe,
  markHealthError,
  markHealthPending,
} from './connectionHealth.js'

const PROBE_SCRIPT = `(async () => {
  try {
    const startedAt = performance.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const origin = location.origin && location.origin !== 'null' ? location.origin : location.href
    const nonce = String(Date.now()) + '_' + Math.random().toString(36).slice(2)
    function withNonce(rawUrl) {
      var u = new URL(rawUrl, origin)
      u.hash = ''
      u.searchParams.set('cc_health', nonce)
      return u.href
    }
    const currentUrl = withNonce(location.href)
    const candidates = [
      { url: currentUrl, label: 'current-page' },
      { url: withNonce('/favicon.ico'), label: 'favicon' },
      { url: withNonce('/'), label: 'origin-root' }
    ]
    let used = null
    let lastError = null
    try {
      for (const candidate of candidates) {
        try {
          await fetch(candidate.url, {
            method: 'GET',
            cache: 'no-store',
            mode: 'no-cors',
            credentials: 'include',
            signal: controller.signal
          })
          used = candidate
          break
        } catch (e) {
          lastError = e
        }
      }
      if (!used) throw lastError || new Error('network probe failed')
    } finally {
      clearTimeout(timer)
    }
    return {
      ok: true,
      readyState: document.readyState,
      href: location.href,
      hasBody: !!document.body,
      title: document.title || '',
      probeUrl: used.url,
      probeTarget: used.label,
      probeKind: 'network-fetch',
      probeMs: Math.max(0, performance.now() - startedAt)
    }
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
})()`

export function probeWebviewHealth({
  webview,
  id,
  label,
  url,
  setConnectionHealth,
  details = 'Проверка вкладки',
  timeoutMs = DEFAULT_SLOW_MS,
}) {
  if (!webview || !id || !setConnectionHealth) return Promise.resolve(null)
  const startedAt = Date.now()
  let settled = false

  setConnectionHealth(prev => ({
    ...prev,
    [id]: markHealthPending(prev[id], {
      id,
      type: 'webview',
      label,
      url,
      details,
    }),
  }))

  const timeout = new Promise(resolve => {
    setTimeout(() => resolve({ timeout: true }), timeoutMs)
  })

  const probe = Promise.resolve()
    .then(() => webview.executeJavaScript(PROBE_SCRIPT, true))
    .then(result => ({ result }))
    .catch(error => ({ error }))

  return Promise.race([probe, timeout]).then(outcome => {
    if (settled) return null
    settled = true
    const fallbackMs = Date.now() - startedAt

    setConnectionHealth(prev => {
      const currentUrl = readWebviewUrl(webview, url)
      const lastMs = typeof outcome?.result?.probeMs === 'number'
        ? outcome.result.probeMs
        : fallbackMs
      if (outcome?.timeout) {
        return {
          ...prev,
          [id]: markHealthError(prev[id], {
            id,
            type: 'webview',
            label,
            url: currentUrl,
            startedAt,
            lastMs,
            errorText: 'timeout',
            details: 'Сетевая проверка вкладки не ответила',
          }),
        }
      }
      if (outcome?.error || outcome?.result?.ok === false) {
        return {
          ...prev,
          [id]: markHealthError(prev[id], {
            id,
            type: 'webview',
            label,
            url: currentUrl,
            startedAt,
            lastMs,
            errorText: outcome?.error?.message || outcome?.result?.error || 'Ошибка сетевой проверки вкладки',
            details: `${details}; network-fetch failed`,
          }),
        }
      }
      return {
        ...prev,
        [id]: markHealthByProbe(prev[id], {
          id,
          type: 'webview',
          label,
          url: outcome?.result?.href || currentUrl,
          startedAt,
          lastMs,
          slowMs: timeoutMs,
          details: `${details}; network-fetch:${outcome?.result?.probeTarget || 'unknown'}; readyState=${outcome?.result?.readyState || 'unknown'}`,
        }),
      }
    })
    return outcome
  })
}

function readWebviewUrl(webview, fallback = '') {
  try {
    return webview?.getURL?.() || fallback || ''
  } catch {
    return fallback || ''
  }
}
