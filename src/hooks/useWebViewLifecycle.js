// v0.86.8: Lifecycle для WebView (Ловушка 64 обновлено).
// Стратегия: трюк с реальным изменением размера родителя WebView (+1px → -1px через RAF).
// Это заставляет Telegram ResizeObserver реально сработать (dispatchEvent не работает в v0.86.5).
// Если через 2 сек всё равно column-center=0x0 — делаем reloadIgnoringCache один раз.
// 1. Physical resize при смене активной вкладки
// 2. Прогрев всех вкладок при старте
// 3. Health-check раз в 30 сек + авто-reload если 0×0
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

// Трюк с физическим изменением размера родителя WebView — заставляет ResizeObserver сработать.
function physicalResize(el) {
  try {
    const parent = el?.parentElement
    if (!parent) return
    const orig = parent.style.width
    // Меняем ширину на 1px меньше, через requestAnimationFrame возвращаем
    parent.style.width = (parent.clientWidth - 1) + 'px'
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        parent.style.width = orig
      })
    })
  } catch(_) {}
}

// Проверяет Telegram column-center и делает reload если 0×0.
function checkAndRecoverTelegram(el, messengerId, traceNotif, reloadedRef) {
  if (!el?.executeJavaScript) return
  const check = `(function(){try{var cc=document.querySelector('#column-center');if(!cc)return 'no-col';var r=cc.getBoundingClientRect();return r.width+'x'+r.height;}catch(e){return 'err:'+e.message}})()`
  el.executeJavaScript(check).then(res => {
    if (typeof res === 'string' && res.startsWith('0x0')) {
      if (reloadedRef.current[messengerId]) {
        if (traceNotif) traceNotif('recover', 'error', messengerId, '', 'column-center 0x0 даже после reload — Telegram не восстановлен')
        return
      }
      reloadedRef.current[messengerId] = true
      if (traceNotif) traceNotif('recover', 'warn', messengerId, '', 'column-center=0x0 → reloadIgnoringCache')
      try { el.reloadIgnoringCache() } catch(_) { try { el.reload() } catch(_) {} }
    }
  }).catch(() => {})
}

export default function useWebViewLifecycle({ activeId, messengers, appReady, webviewRefs, setActiveId, traceNotif }) {
  const reloadedRef = useRef({}) // { [messengerId]: true } — чтобы не зациклить reload

  // ── v0.86.8 FIX: физический resize родителя при смене активной вкладки ──
  useEffect(() => {
    if (!activeId) return
    const el = webviewRefs.current[activeId]
    if (!el) return
    physicalResize(el)
    const t1 = setTimeout(() => physicalResize(el), 300)
    const t2 = setTimeout(() => checkAndRecoverTelegram(el, activeId, traceNotif, reloadedRef), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [activeId, webviewRefs, traceNotif])

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
        if (el) physicalResize(el)
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
