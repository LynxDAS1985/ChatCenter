const bootProbeTs = performance.now()

window.__ccStartupT0 = window.__ccStartupT0 || bootProbeTs
window.__ccStartupMark = window.__ccStartupMark || ((scope, message) => {
  const line = `[startup-renderer] ${scope} +${Math.round(performance.now() - window.__ccStartupT0)}ms ${message}`
  try { window.api?.send('app:log', { level: 'INFO', message: line }) } catch {}
  try { console.log(line) } catch {}
})

window.__ccStartupMark('boot-probe', 'module script reached before main.jsx')

window.__ccStartupSummary = window.__ccStartupSummary || ((reason) => {
  try {
    const resources = performance.getEntriesByType('resource')
      .filter((entry) => {
        try {
          const url = new URL(entry.name)
          return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
        } catch {
          return false
        }
      })
      .map((entry) => {
        let path = entry.name
        try {
          const url = new URL(entry.name)
          path = `${url.pathname}${url.search || ''}`
        } catch {}
        return {
          path,
          initiatorType: entry.initiatorType,
          duration: Math.round(entry.duration),
          startTime: Math.round(entry.startTime),
          transferSize: entry.transferSize || 0,
          decodedBodySize: entry.decodedBodySize || 0,
        }
      })
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 15)
    const formatted = resources
      .map(r => `${r.duration}ms ${r.initiatorType || '?'} transfer=${r.transferSize} decoded=${r.decodedBodySize} start=${r.startTime} ${r.path}`)
      .join(' | ')
    window.__ccStartupMark('resource-summary', `${reason} count=${performance.getEntriesByType('resource').length} slow=${formatted || 'none'}`)
  } catch (err) {
    window.__ccStartupMark('resource-summary', `${reason} failed ${err.message}`)
  }
})

try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'longtask') {
        window.__ccStartupMark('longtask', `duration=${Math.round(entry.duration)}ms start=${Math.round(entry.startTime)}ms`)
      }
    }
  }).observe({ entryTypes: ['longtask'] })
  window.__ccStartupMark('perf-observer', 'longtask observer attached')
} catch (err) {
  window.__ccStartupMark('perf-observer', `longtask observer unavailable ${err.message}`)
}

window.addEventListener('DOMContentLoaded', () => {
  window.__ccStartupMark('dom', 'DOMContentLoaded')
  window.__ccStartupSummary('DOMContentLoaded')
}, { once: true })

window.addEventListener('load', () => {
  window.__ccStartupMark('dom', 'window load')
  window.__ccStartupSummary('window-load')
}, { once: true })

setTimeout(() => window.__ccStartupSummary('after-5s'), 5000)
setTimeout(() => window.__ccStartupSummary('after-15s'), 15000)
setTimeout(() => window.__ccStartupSummary('after-30s'), 30000)
