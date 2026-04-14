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
  // Warm-up: прогрев вкладок при старте — безопасен, помогает первой загрузке других мессенджеров
  const warmupDoneRef = useRef(false)
  useEffect(() => {
    if (warmupDoneRef.current) return
    if (!appReady || messengers.length === 0) return
    warmupDoneRef.current = true
    const savedActiveId = activeId
    const ids = messengers.map(m => m.id)
    const warmupDelay = 1500
    ids.forEach((id, idx) => {
      setTimeout(() => { setActiveId(id) }, idx * warmupDelay)
    })
    setTimeout(() => { if (savedActiveId) setActiveId(savedActiveId) }, ids.length * warmupDelay + 500)
  }, [appReady, messengers, activeId, setActiveId])

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
