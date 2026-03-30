// v0.84.4: Extracted from AISidebar.jsx — provider health-check logic
// deps: settingsRef, setRefreshing, setProviderStatuses, setProviderCheckTimes,
//        PROVIDERS, getProviderCfg, windowApi

import { PROVIDERS, getProviderCfg } from './aiProviders.js'

/**
 * Runs health-check requests against all configured API providers.
 * @param {Object} deps — state setters and refs
 * @param {string} [source='manual'] — label for log ('startup' | 'hourly' | 'manual')
 */
export async function runProviderChecks(deps, source = 'manual') {
  const {
    settingsRef,
    setRefreshing,
    setProviderStatuses,
    setProviderCheckTimes,
    windowApi,
  } = deps

  const s = settingsRef.current
  setRefreshing(true)
  for (const p of PROVIDERS) {
    const cfg = getProviderCfg(s, p.id)
    if (cfg.mode !== 'api') continue
    if (p.id === 'gigachat') {
      if (!cfg.apiKey || !cfg.clientSecret) continue
    } else {
      if (!cfg.apiKey) continue
    }
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    try {
      const res = await windowApi?.invoke('ai:generate', {
        messages: [{ role: 'user', content: 'ok' }],
        settings: { provider: p.id, apiKey: cfg.apiKey, clientSecret: cfg.clientSecret, model: cfg.model, systemPrompt: 'ok' },
      })
      setProviderStatuses(prev => ({ ...prev, [p.id]: res.ok ? 'ok' : 'fail' }))
      setProviderCheckTimes(prev => ({ ...prev, [p.id]: time }))
      if (!res.ok) windowApi?.invoke('ai:log-error', { provider: p.id, errorText: `[${source}] ${res.error}` }).catch(() => {})
    } catch (e) {
      setProviderStatuses(prev => ({ ...prev, [p.id]: 'fail' }))
      setProviderCheckTimes(prev => ({ ...prev, [p.id]: time }))
      windowApi?.invoke('ai:log-error', { provider: p.id, errorText: `[${source}] ${e.message}` }).catch(() => {})
    }
  }
  setRefreshing(false)
}
