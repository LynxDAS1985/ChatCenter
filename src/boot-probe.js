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

// v1.2.336: страховка от «зависшей» стартовой заставки (index.html #cc-splash). В норме её убирает
// main.jsx при appReady (useAppBootstrap → window.__ccHideSplash).
// v1.2.395 ФИКС «долгого пустого экрана»: РАНЬШЕ таймер 30с БЕЗУСЛОВНО убирал заставку. Но в dev-режиме
// приложение честно грузится дольше 30с (сотни модулей по одному через dev-сервер): по журналу appReady
// наступает ~на 70с, контент — ~на 127с. Заставку убирали на 30с → ~40-90с ПУСТОГО экрана до контента.
// Теперь на 30с проверяем, ЖИВ ли main.jsx (он выставил window.__ccHideSplash): жив → НЕ убираем (ждём
// appReady, который сам уберёт), лишь ставим ДАЛЬНИЙ потолок 120с на случай реально зависшего appReady;
// не запустился (битый бандл до его кода) → убираем, как и раньше.
function ccSplashSafety(reason) {
  try {
    const sp = document.getElementById('cc-splash')
    if (!sp) return // норма: заставку уже убрал main.jsx (appReady)
    sp.classList.add('cc-splash--hide')
    setTimeout(() => { try { sp.remove() } catch {} }, 500)
    window.__ccStartupMark('splash', 'safety hid splash: ' + reason)
  } catch {}
}
// v1.2.397 ФИКС холодного старта: РАНЬШЕ на 30с проверяли `window.__ccHideSplash` (жив ли main.jsx). Но на
// ХОЛОДНОМ старте (пустой кэш dev-сервера / первый запуск) тело main.jsx выполняется ПОЗЖЕ 30с — по журналу
// v1.2.396 «main +60738ms react root created», а страховка на 30с (`main.jsx не запустился за 30с`) уже
// убрала заставку → ~30-105с ПУСТОГО экрана. Проверка была ненадёжной. Теперь страховка — ПРОСТО дальний
// таймер: в норме заставку убирает appReady (useAppBootstrap → __ccHideSplash) и на холодную (~60с), и на
// тёплую (быстро); этот таймер — лишь предохранитель на случай реально зависшего запуска (битый бандл /
// appReady не наступил). 180с > худшего наблюдённого холодного старта (~105с) с запасом.
setTimeout(() => ccSplashSafety('дальний предохранитель 180с (appReady не наступил)'), 180000)
