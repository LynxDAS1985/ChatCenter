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
// v1.2.452: раньше этот таймер ПРОСТО убирал заставку → пользователь видел пустое окно
// (жалоба 11 сентября). Теперь вместо пустоты поднимается окно переподключения из index.html,
// и приложение пробует запуститься само. Заставку убираем только если окна нет (старый путь).
setTimeout(() => {
  try {
    if (window.__ccBootNet && document.getElementById('cc-splash')) {
      window.__ccBootNet.show('приложение не запустилось за 3 минуты')
      window.__ccStartupMark('splash', 'boot-net: окно переподключения показано (appReady не наступил)')
      return
    }
  } catch {}
  ccSplashSafety('дальний предохранитель 180с (appReady не наступил)')
}, 180000)

// v1.2.454 — ИЗМЕРИТЕЛЬ РАСКЛАДКИ. Жалоба 11 сентября 2026: «окно чата уехало за границы»
// (панель ИИ была срезана правым краем окна). Причина найдена и исправлена — растягивающимся
// блокам разрешили сжиматься (min-w-0 / minWidth: 0). Этот измеритель:
//   1) подтверждает, что теперь всё влезает (или честно показывает, сколько не влезло);
//   2) отвечает на второй, НЕ объяснённый симптом — срезано ли содержимое сверху.
// Считает ТОЛЬКО размеры (ничего не меняет), пишет ОДНУ строку в журнал, работает вне React —
// поэтому на отрисовку повлиять не может. Приём в проекте принят: так же устроены logGeometry
// и проба «чёрного экрана» в webviewDiagnostics.js.
// Сколько точек панель ИИ ПРОСИЛА (сохранённая ширина) — её кладёт на элемент сама
// панель (data-cc-width-want в AISidebar.jsx).
function ccWantWidth() {
  try {
    const el = document.querySelector('[data-cc-layout="ai-panel"]')
    const want = el && el.getAttribute('data-cc-width-want')
    if (!want) return ''
    const shown = Math.round(el.getBoundingClientRect().width)
    return Math.abs(Number(want) - shown) > 1
      ? ` (просила ${want}, СРАБОТАЛ ПОТОЛОК «не больше половины окна»)`
      : ` (просила ${want}, потолок не понадобился)`
  } catch (_) { return '' }
}

function ccLayoutProbe(reason) {
  try {
    const box = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return 'нет'
      const r = el.getBoundingClientRect()
      const over = el.scrollWidth - el.clientWidth        // >0 = содержимое шире, чем место
      const overY = el.scrollHeight - el.clientHeight     // >0 = содержимое выше, чем место
      return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`
        + (over > 1 ? ` НЕ ВЛЕЗАЕТ по ширине на ${Math.round(over)}` : '')
        + (overY > 1 ? ` НЕ ВЛЕЗАЕТ по высоте на ${Math.round(overY)}` : '')
    }
    const parts = [
      'окно=' + window.innerWidth + 'x' + window.innerHeight,
      'страница=' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight,
      'ряд=' + box('[data-cc-layout="row"]'),
      'середина=' + box('[data-cc-layout="middle"]'),
      // v1.2.456: рядом с фактической шириной панели печатаем ЗАПРОШЕННУЮ (сохранённую
      // пользователем). Если они разошлись — значит сработал потолок «не больше половины
      // окна». Без этого о срабатывании потолка в журнале не было ни слова.
      'панельИИ=' + box('[data-cc-layout="ai-panel"]') + ccWantWidth(),
      'рейл=' + box('#app-native-rail'),
      'разделы=' + box('.native-sidebar'),
      'рядЧатов=' + box('[data-cc-layout="inbox-row"]'),
      'переписка=' + box('[data-cc-layout="messages"]'),
    ]
    window.__ccStartupMark('layout', reason + ' :: ' + parts.join(' | '))
  } catch (e) {
    try { window.__ccStartupMark('layout', 'измерить не удалось: ' + ((e && e.message) || e)) } catch {}
  }
}
// Доступен вручную: набрать __ccLayoutProbe('проверка') — пригодится, чтобы сравнить «до/после»
// перетаскивания панелей, не перезапуская приложение.
window.__ccLayoutProbe = ccLayoutProbe
// Один раз через 12с после старта: к этому моменту чаты уже нарисованы (по журналу первая
// загрузка чатов завершается на ~5-8с), а лишнего шума в журнале не создаётся.
setTimeout(() => ccLayoutProbe('замер через 12с после старта'), 12000)
