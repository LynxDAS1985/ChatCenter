// v0.86.6: Диагностические логи для WebView (вынесены из webviewSetup.js для лимита 600 строк).
// Назначение — собирать причины чёрных экранов, схлопнувшихся layout, runtime-ошибок мессенджеров.

/**
 * Логирует геометрию WebView через 600 мс после навигации.
 * @param {HTMLElement} el - WebView element
 * @param {string} messengerId
 * @param {function} traceNotif
 */
export function logGeometry(el, messengerId, traceNotif) {
  setTimeout(() => {
    try {
      const r = el.getBoundingClientRect?.()
      const cs = getComputedStyle(el)
      const parent = el.parentElement
      const pcs = parent ? getComputedStyle(parent) : null
      const pr = parent ? parent.getBoundingClientRect() : null
      let topAtCenter = ''
      try {
        const cx = (r?.left || 0) + (r?.width || 0) / 2
        const cy = (r?.top || 0) + (r?.height || 0) / 2
        const topEl = document.elementFromPoint(cx, cy)
        topAtCenter = topEl ? `${topEl.tagName}.${(topEl.className || '').toString().slice(0, 40)}` : 'none'
      } catch(_) {}
      const info = `wv=${Math.round(r?.width || 0)}x${Math.round(r?.height || 0)} ` +
        `vis=${cs.visibility} disp=${cs.display} op=${cs.opacity} z=${cs.zIndex} ` +
        `par=${Math.round(pr?.width || 0)}x${Math.round(pr?.height || 0)} ` +
        `parZ=${pcs?.zIndex} parPE=${pcs?.pointerEvents} parVis=${pcs?.visibility} ` +
        `top@center=${topAtCenter}`
      traceNotif('geom', 'info', messengerId, '', info.slice(0, 400))
    } catch(err) { traceNotif('geom', 'error', messengerId, '', 'err=' + (err.message || err)) }
  }, 600)
}

/**
 * Опрашивает DOM внутри WebView через executeJavaScript.
 * Пишет 12 отдельных коротких __CC_DIAG__probe[...] логов.
 */
export function runDomProbe(el, messengerId, traceNotif) {
  setTimeout(() => {
    try {
      const diagScript = `(function(){
        try {
          var html = document.documentElement, body = document.body;
          var cc = document.querySelector('#column-center');
          var ccs = cc ? getComputedStyle(cc) : null;
          var ccR = cc ? cc.getBoundingClientRect() : null;
          var bubblesEl = document.querySelector('.bubbles, .bubbles-inner');
          var bR = bubblesEl ? bubblesEl.getBoundingClientRect() : null;
          var bcs = bubblesEl ? getComputedStyle(bubblesEl) : null;
          var P = function(k,v){try{console.log('__CC_DIAG__probe['+k+']: '+v)}catch(e){}};
          P('doc','size='+document.querySelectorAll('*').length+' ready='+document.readyState+' vis='+document.visibilityState+' hidden='+document.hidden);
          P('url',(location.href||'').slice(0,150));
          P('body','bg='+(body?getComputedStyle(body).backgroundColor:'?')+' vis='+(body?getComputedStyle(body).visibility:'?')+' op='+(body?getComputedStyle(body).opacity:'?')+' disp='+(body?getComputedStyle(body).display:'?')+' innerLen='+(body?(body.innerHTML||'').length:0));
          P('html','bg='+(html?getComputedStyle(html).backgroundColor:'?'));
          P('tg-selectors','auth='+!!document.querySelector('#auth-pages')+' tabs='+!!document.querySelector('.tabs-container')+' sideL='+!!document.querySelector('.sidebar-left')+' col='+!!document.querySelector('#column-center')+' chat='+!!document.querySelector('.chat')+' bubbles='+!!document.querySelector('.bubbles')+' bubblesIn='+!!document.querySelector('.bubbles-inner'));
          P('column-center', cc ? ('size='+Math.round(ccR.width)+'x'+Math.round(ccR.height)+' disp='+ccs.display+' vis='+ccs.visibility+' op='+ccs.opacity+' bg='+ccs.backgroundColor+' transform='+ccs.transform.slice(0,30)+' left='+Math.round(ccR.left)+' top='+Math.round(ccR.top)) : 'null');
          P('bubbles', bubblesEl ? ('size='+Math.round(bR.width)+'x'+Math.round(bR.height)+' disp='+bcs.display+' vis='+bcs.visibility+' op='+bcs.opacity+' n='+document.querySelectorAll('.bubble').length) : 'null');
          P('canvas','n='+document.querySelectorAll('canvas').length+' hidden='+Array.from(document.querySelectorAll('canvas')).filter(function(c){return c.width===0||c.height===0||getComputedStyle(c).display==='none'}).length);
          P('img','n='+document.querySelectorAll('img').length);
          P('webgl',(function(){try{var c=document.createElement('canvas');var g=c.getContext('webgl')||c.getContext('experimental-webgl');return !!g?'ok':'none'}catch(e){return 'err:'+e.message.slice(0,40)}})());
          P('err',(window.__ccLastErr||'none').slice(0,200));
        } catch(e) { P('fail', e.message); }
      })();`
      if (el.executeJavaScript) el.executeJavaScript(diagScript).catch(() => {})
    } catch(err) { traceNotif('probe', 'error', messengerId, '', 'err=' + (err.message || err)) }
  }, 1500)
}

/**
 * Устанавливает глобальный ловец ошибок внутри WebView (error + unhandledrejection).
 * Ошибки будут приходить в консоль как __CC_DIAG__wv-runtime.
 */
export function attachRuntimeErrorCatcher(el) {
  try {
    const catcher = `(function(){
      if (window.__ccErrHooked) return;
      window.__ccErrHooked = true;
      window.__ccLastErr = '';
      window.addEventListener('error', function(ev){
        var m = (ev && ev.message) || '';
        var s = (ev && ev.filename) || '';
        var l = (ev && ev.lineno) || 0;
        window.__ccLastErr = (m+'|'+s+':'+l).slice(0,300);
        try{console.log('__CC_DIAG__wv-runtime: '+window.__ccLastErr);}catch(e){}
      });
      window.addEventListener('unhandledrejection', function(ev){
        var m = (ev && ev.reason && (ev.reason.message || String(ev.reason))) || '';
        window.__ccLastErr = ('rej|'+m).slice(0,300);
        try{console.log('__CC_DIAG__wv-runtime: '+window.__ccLastErr);}catch(e){}
      });
      try{console.log('__CC_DIAG__wv-err-catcher: attached');}catch(e){}
    })();`
    if (el.executeJavaScript) el.executeJavaScript(catcher).catch(() => {})
  } catch(_) {}
}
