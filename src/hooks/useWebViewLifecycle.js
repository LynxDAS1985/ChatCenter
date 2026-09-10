// v0.86.10: Lifecycle для WebView — ОТКАЧЕНО (resize/reload не работают для Telegram K peer-changed race).
// Оставлены только: health-check раз в 30 сек (для диагностики) + warm-up вкладок (безопасен, не мешает).
// Смотри .memory-bank/common-mistakes.md Ловушка 64 — перечень всего что пробовали и почему не помогло.
import { useEffect, useRef } from 'react'
import { checkBlackAndRepaint, WATCHDOG_INTERVAL_MS } from '../utils/webviewBlackWatchdog.js' // v1.2.431: сторож чёрного экрана (фото кадра → 1px-пинок перерисовки)

const HEALTH_SCRIPT = `(function(){
  try {
    var body = document.body;
    if (!body) { console.log('__CC_DIAG__health: body=null'); return; }
    var cc = document.querySelector('#column-center, #main, .sidebar, .im-page, [class*="chat"]');
    var ccR = cc ? cc.getBoundingClientRect() : null;
    var tgCol = document.querySelector('#column-center');
    var tgColR = tgCol ? tgCol.getBoundingClientRect() : null;
    var P = function(k,v){try{console.log('__CC_DIAG__health['+k+']: '+v)}catch(e){}};
    P('doc','size='+document.querySelectorAll('*').length+' ready='+document.readyState+' vis='+document.visibilityState);
    P('body','bg='+getComputedStyle(body).backgroundColor+' vis='+getComputedStyle(body).visibility+' op='+getComputedStyle(body).opacity);
    P('main', cc ? (cc.tagName+'.'+(cc.className||'').toString().slice(0,30)+' size='+Math.round(ccR.width)+'x'+Math.round(ccR.height)) : 'null');
    if (tgCol) P('tg-col', 'size='+Math.round(tgColR.width)+'x'+Math.round(tgColR.height));
    P('err',(window.__ccLastErr||'none').slice(0,150));
  } catch(e) { try{console.log('__CC_DIAG__health: fail='+e.message)}catch(_){} }
})();`

export default function useWebViewLifecycle({ activeId, messengers, appReady, webviewRefs, setActiveId }) {
  // v0.87.1 FIX: warm-up ОТКЛЮЧЁН — он перебирал ВСЕ вкладки по 1.5 сек при старте,
  // что давало "пустой экран" на первые 7-15 секунд (для 5+ вкладок).
  // Прогрев решал проблему "первого открытия" для ОДНОЙ кастомной вкладки (Telega Avtoliberty),
  // но цена — стартовая задержка для всех — слишком высокая. Чёрный экран Telega решён через
  // другие механизмы (см. Ловушка 64). Если warm-up снова потребуется — делать опционально
  // через настройку, не по умолчанию.
  // ОСТАВЛЕНО: health-check (диагностика, не мешает UI).

  // Health-check: периодический probe активной вкладки для диагностики
  useEffect(() => {
    if (!activeId) return
    const runProbe = () => {
      const el = webviewRefs.current[activeId]
      if (el?.executeJavaScript) {
        try { el.executeJavaScript(HEALTH_SCRIPT).catch(() => {}) } catch(_) {}
      }
    }
    const interval = setInterval(runProbe, 30000)
    return () => clearInterval(interval)
  }, [activeId, webviewRefs])

  // v1.2.416 (Ловушка 64): РЕАЛЬНЫЙ пинок размером при активации веб-вкладки — «расклеивает» схлопнутую
  // раскладку адаптивного SPA (МАКС/др.), который при инициализации в НЕактивной вкладке прочитал неверный
  // размер и застрял в «мобильном» виде (область чата 0×0 → чёрный экран). Синтетический resize-event
  // бесполезен — такие сайты слушают ResizeObserver (реальное изменение пикселей). Поэтому на миг сужаем
  // обёртку webview на 1px и возвращаем через 2×rAF → guest реально видит resize → пересчитывает layout.
  // Раньше этот фикс был (v0.86.8), но его удалили при переводе Telegram на нативный канал — веб-МАКС остался без него.
  useEffect(() => {
    if (!activeId) return undefined
    const m = (messengers || []).find(x => x.id === activeId)
    if (!m || m.isNative) return undefined // нативные вкладки (TDLib) — не webview, пинок не нужен
    let logged = false
    const nudge = () => {
      const el = webviewRefs.current[activeId]
      const wrap = el?.parentElement
      if (!wrap) return
      const w = Math.round(wrap.getBoundingClientRect().width)
      if (w < 5) return
      wrap.style.width = (w - 1) + 'px'
      requestAnimationFrame(() => requestAnimationFrame(() => { try { wrap.style.width = '' } catch (_) {} }))
      if (!logged) { logged = true; try { window.api?.send?.('app:log', { level: 'INFO', message: '[webview-relayout] 1px-пинок раскладки для ' + activeId + ' (Ловушка 64)' }) } catch (_) {} }
    }
    const t1 = setTimeout(nudge, 200)  // после показа вкладки
    const t2 = setTimeout(nudge, 700)  // повтор — поймать SPA, если ещё не был готов
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [activeId, messengers, webviewRefs])

  // v1.2.431: сторож ЧЁРНОГО ЭКРАНА. Пинок выше срабатывает только при АКТИВАЦИИ вкладки, а тяжёлый чат
  // может почернеть уже ПОСЛЕ (содержимое загружено, пиксели чёрные — не перерисовывается). Поэтому пока
  // веб-вкладка открыта, раз в WATCHDOG_INTERVAL_MS делаем «фото» кадра (capturePage) и при пустом дёргаем
  // тот же 1px-пинок. Предохранитель — не больше 3 пинков на одно открытие (см. webviewBlackWatchdog.js).
  useEffect(() => {
    if (!activeId) return undefined
    const m = (messengers || []).find(x => x.id === activeId)
    if (!m || m.isNative) return undefined
    const state = { nudges: 0, checks: 0 }
    const log = (level, message) => { try { window.api?.send?.('app:log', { level, message }) } catch (_) {} }
    // v1.2.435: интервал вынесен в WATCHDOG_INTERVAL_MS (60с вместо 10с) — настоящая причина чёрного
    // экрана МАКС была в другом (наш впрыск прятал корень приложения, ADR-042), а снимок кадра дорогой.
    const iv = setInterval(() => { checkBlackAndRepaint(webviewRefs.current[activeId], log, state) }, WATCHDOG_INTERVAL_MS)
    return () => clearInterval(iv)
  }, [activeId, messengers, webviewRefs])
}
