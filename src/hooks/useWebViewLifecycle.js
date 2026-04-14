// v0.86.6: Lifecycle для WebView — вынесено из App.jsx для лимита 600 строк.
// Решает проблемы Ловушки 64: layout lock-in адаптивных SPA (Telegram).
// 1. Forced resize при смене активной вкладки — чтобы Telegram пересчитал mobile/desktop layout
// 2. Прогрев всех вкладок при старте — чтобы каждый WebView хоть раз был активным
// 3. Health-check раз в 30 сек — чтобы видеть в логах состояние активной вкладки
import { useEffect, useRef } from 'react'

const RESIZE_SCRIPT = `(function(){try{window.dispatchEvent(new Event('resize'));if(document.body){document.body.style.minHeight='100vh';}}catch(e){}})();`
const WARMUP_RESIZE = `(function(){try{window.dispatchEvent(new Event('resize'));}catch(e){}})();`
const HEALTH_SCRIPT = `(function(){
  try {
    var body = document.body;
    if (!body) { console.log('__CC_DIAG__health: body=null'); return; }
    var cc = document.querySelector('#column-center, #main, .sidebar, .im-page, [class*="chat"]');
    var ccR = cc ? cc.getBoundingClientRect() : null;
    var P = function(k,v){try{console.log('__CC_DIAG__health['+k+']: '+v)}catch(e){}};
    P('doc','size='+document.querySelectorAll('*').length+' ready='+document.readyState+' vis='+document.visibilityState);
    P('body','bg='+getComputedStyle(body).backgroundColor+' vis='+getComputedStyle(body).visibility+' op='+getComputedStyle(body).opacity);
    P('main', cc ? (cc.tagName+'.'+(cc.className||'').toString().slice(0,30)+' size='+Math.round(ccR.width)+'x'+Math.round(ccR.height)) : 'null');
    P('err',(window.__ccLastErr||'none').slice(0,150));
  } catch(e) { try{console.log('__CC_DIAG__health: fail='+e.message)}catch(_){} }
})();`

export default function useWebViewLifecycle({ activeId, messengers, appReady, webviewRefs, setActiveId }) {
  // ── FIX v0.86.5: Forced resize при смене активной вкладки (Ловушка 64) ──
  useEffect(() => {
    if (!activeId) return
    const el = webviewRefs.current[activeId]
    if (!el || !el.executeJavaScript) return
    const run = () => { try { el.executeJavaScript(RESIZE_SCRIPT).catch(() => {}) } catch(_) {} }
    run()
    const t1 = setTimeout(run, 150)
    const t2 = setTimeout(run, 500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [activeId, webviewRefs])

  // ── v0.86.6: Прогрев всех вкладок при старте ──
  const warmupDoneRef = useRef(false)
  useEffect(() => {
    if (warmupDoneRef.current) return
    if (!appReady || messengers.length === 0) return
    warmupDoneRef.current = true
    const savedActiveId = activeId
    const ids = messengers.map(m => m.id)
    const warmupDelay = 1500
    ids.forEach((id, idx) => {
      setTimeout(() => {
        const el = webviewRefs.current[id]
        if (el?.executeJavaScript) {
          try { el.executeJavaScript(WARMUP_RESIZE).catch(() => {}) } catch(_) {}
        }
        setActiveId(id)
      }, idx * warmupDelay)
    })
    setTimeout(() => { if (savedActiveId) setActiveId(savedActiveId) }, ids.length * warmupDelay + 500)
  }, [appReady, messengers, activeId, webviewRefs, setActiveId])

  // ── v0.86.6: Health-check раз в 30 сек ──
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
