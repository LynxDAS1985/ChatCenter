// v0.86.10: Lifecycle для WebView — ОТКАЧЕНО (resize/reload не работают для Telegram K peer-changed race).
// Оставлены только: health-check раз в 30 сек (для диагностики) + warm-up вкладок (безопасен, не мешает).
// Смотри .memory-bank/common-mistakes.md Ловушка 64 — перечень всего что пробовали и почему не помогло.
import { useEffect, useRef } from 'react'

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
}
