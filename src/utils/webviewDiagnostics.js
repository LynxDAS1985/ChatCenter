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
      runVkFullProbe(el, messengerId)
    } catch(err) { traceNotif('probe', 'error', messengerId, '', 'err=' + (err.message || err)) }
  }, 1500)
}

export function runVkFullProbe(el, messengerId) {
  if (!el?.executeJavaScript) return
  let url = ''
  try { url = el.getURL?.() || '' } catch (_) {}
  if (messengerId !== 'vk' && !/vk\.com/i.test(url)) return
  const script = `(function(){try{
    function clean(v){return String(v||'').replace(/\\s+/g,' ').trim()}
    function attr(el,n){try{return el&&el.getAttribute&&el.getAttribute(n)||''}catch(e){return ''}}
    function cls(el){return typeof (el&&el.className)==='string'?el.className:''}
    function rect(el){try{var r=el.getBoundingClientRect();return Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.width)+'x'+Math.round(r.height)}catch(e){return ''}}
    function label(el){if(!el)return 'null';var bits=[String(el.tagName||el.nodeName||'node').toLowerCase()];if(el.id)bits.push('#'+el.id);var c=cls(el);if(c)bits.push('.'+c.replace(/\\s+/g,'.'));['role','aria-label','data-testid','data-msgid','data-message-id','data-id','data-peer','data-list-id'].forEach(function(n){var v=attr(el,n);if(v)bits.push(n+'='+v)});var rr=rect(el);if(rr)bits.push('rect='+rr);return bits.join(' ')}
    function chain(el,stop){var out=[],cur=el;for(var i=0;i<8&&cur;i++){out.push(label(cur));if(cur===stop)break;cur=cur.parentElement}return out.join(' <= ')}
    function one(sel){try{return document.querySelector(sel)}catch(e){return null}}
    function all(sel,root){try{return Array.from((root||document).querySelectorAll(sel))}catch(e){return []}}
    var containerSels=['.ConvoMain__history','[class*="ConvoMain__history"]','[class*="im-page--chat-body"]','[class*="im_msg_list"]','[class*="im-mess-stack"]','[class*="ChatBody"]','[class*="im-history"]','[class*="ConversationBody"]','[class*="chat-body"]','[class*="HistoryMessages"]'];
    var messageSels=['[data-msgid]','[data-message-id]','[class*="ConvoMessage"]','[class*="im-mess"]','[class*="im_msg"]','[class*="im-mes"]','[class*="Message"]','[class*="message"]'];
    var container=null,containerSelector='';
    for(var i=0;i<containerSels.length;i++){container=one(containerSels[i]);if(container){containerSelector=containerSels[i];break}}
    function leafText(root){if(!root)return '';var sels=['[class*="text"]','[class*="Text"]','[class*="body"]','[class*="Body"]','[class*="content"]','[class*="Content"]','p','span'];var nodes=[];sels.forEach(function(s){nodes=nodes.concat(all(s,root))});if(!nodes.length)nodes=[root];for(var i=nodes.length-1;i>=0;i--){var t=clean(nodes[i].textContent);if(!t)continue;if(/^\\d{1,2}:\\d{2}(:\\d{2})?$/.test(t))continue;if(/^(сегодня|вчера|позавчера|новые сообщения)$/i.test(t))continue;if(/^(online|в сети|печатает|typing)$/i.test(t))continue;return t}return ''}
    function vkOutgoingMarker(el){var cur=el;for(var x=0;x<8&&cur;x++){var c=cls(cur),aria=attr(cur,'aria-label'),data=attr(cur,'data-out')||attr(cur,'data-outgoing')||attr(cur,'data-own'),cm=c.match(/(^|\\s)(ConvoStack--out|ConvoMessage--out|im-mess_out|message_out)(\\s|$)/i);if(cm)return{result:true,reason:'class:'+cm[2],className:c};if(/^(1|true|yes)$/i.test(data))return{result:true,reason:'data-outgoing',className:c};if(/вы отправили|you sent|исходящ/i.test(aria))return{result:true,reason:'aria-outgoing',className:c};cur=cur.parentElement}return{result:false,reason:'',className:''}}
    function outgoing(el){return vkOutgoingMarker(el).result}
    function outgoingEvidence(el){var m=vkOutgoingMarker(el),c=m.className||cls(el),aria=attr(el,'aria-label'),data=attr(el,'data-out')||attr(el,'data-outgoing')||attr(el,'data-own'),cm=m.reason.indexOf('class:')===0?m.reason.slice(6):'',dm=/^(1|true|yes)$/i.test(data),am=/you sent/i.test(aria)||/вы отправили|исходящ/i.test(aria);return{result:!!(m.result||dm||am),reason:m.reason||(dm?'data-outgoing':am?'aria-outgoing':''),className:c,dataOut:data,aria:aria,checks:{classBroadOutOwnSelfSent:!!cm,classExactVkOutgoing:!!cm,dataOutTrue:dm,ariaOutgoing:am}}}
    function authorFromMessage(el){if(!el)return '';var sels=['[class*="ConvoMessageHeader"] [class*="PeerTitle"]','[class*="ConvoMessageHeader"] [class*="author"]','[class*="ConvoMessageHeader"] a','[class*="PeerTitle"]','[class*="author"]'];for(var j=0;j<sels.length;j++){var n=null;try{n=el.querySelector(sels[j])}catch(e){}var t=clean(n&&n.textContent);if(t&&t.length<120)return t}var raw=clean(el.textContent),leaf=leafText(el);if(raw&&leaf&&raw!==leaf&&raw.endsWith(leaf))return clean(raw.slice(0,raw.length-leaf.length));return ''}
    function msgId(el){return attr(el,'data-msgid')||attr(el,'data-message-id')||attr(el,'data-id')||''}
    var messages=[];
    if(container){messageSels.forEach(function(sel){all(sel,container).forEach(function(m){if(messages.indexOf(m)<0)messages.push(m)})})}
    var header={sender:'',avatar:'',status:''};
    ['[class*="ConvoHeader"] [class*="Title"]','[class*="ConvoHeader"] [class*="title"]','[class*="ConvoHeader"] [class*="name"]','[class*="im-page--title"]','h1','h2'].some(function(s){var n=one(s),t=clean(n&&n.textContent);if(t&&t.length<140){header.sender=t;return true}return false});
    var st=one('[class*="ConvoHeader"] [class*="Status"], [class*="ConvoHeader"] [class*="status"]'); header.status=clean(st&&st.textContent);
    var av=one('[class*="ConvoHeader"] img[src], [class*="ConvoMain"] img[src], img[src*="vkuser"], img[src*="userapi"]'); header.avatar=av&&av.src||'';
    var rows=messages.slice(-30).map(function(m,idx){var oi=outgoingEvidence(m);return{idx:idx,totalIndex:messages.indexOf(m),id:msgId(m),outgoing:outgoing(m),outgoingEvidence:oi,authorFromMessage:authorFromMessage(m),text:leafText(m),rawText:clean(m.textContent),node:label(m),parentChain:chain(m,container),outerHTML:(m.outerHTML||'').slice(0,12000)}});
    var side=all('[class*="ConvoListItem"], [class*="im-page--dialogs"] [class*="chat"], [class*="dialog"], [class*="ChatList"] [class*="item"]').slice(0,30).map(function(n,idx){return{idx:idx,text:clean(n.textContent),node:label(n),avatar:(n.querySelector&&n.querySelector('img[src]')||{}).src||'',unread:clean((n.querySelector&&n.querySelector('[class*="unread"], [class*="Unread"], [class*="counter"], [class*="Counter"]')||{}).textContent||'')}});
    var payload={kind:'vkFull',url:location.href,title:document.title,ready:document.readyState,hidden:document.hidden,containerFound:!!container,containerSelector:containerSelector,container:label(container),messageCount:messages.length,header:header,messages:rows,sidebar:side,activeElement:label(document.activeElement),bodyTextSample:clean(document.body&&document.body.innerText).slice(0,3000)};
    console.log('__CC_DIAG__vkFull '+JSON.stringify(payload));
  }catch(e){try{console.log('__CC_DIAG__vkFull-error '+(e&&e.stack||e&&e.message||e))}catch(_){}}})();`
  try { el.executeJavaScript(script, true).catch(() => {}) } catch (_) {}
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
      // v1.2.422 ВРЕМЕННАЯ ДИАГНОСТИКА: МАКС рвёт WebSocket по кругу («Socket disconnected»). Оборачиваем WebSocket
      // и логируем КОД+ПРИЧИНУ закрытия (первые 3) — точно скажет, ПОЧЕМУ сервер/сеть рвёт соединение (1006 сеть,
      // 1008/4xxx — сервер отбил с причиной). Ловим и close, и error. Дедуп (первые 3), чтобы не спамить в шторме.
      try {
        var _OWS = window.WebSocket;
        if (_OWS && !_OWS.__ccWrapped) {
          var _wsN = 0;
          var _WS = function(u, p){
            var w = (p !== undefined) ? new _OWS(u, p) : new _OWS(u);
            try {
              w.addEventListener('close', function(ev){ if (_wsN < 4) { _wsN++; try{console.log('__CC_DIAG__ws-close code='+ev.code+' clean='+ev.wasClean+' reason="'+String(ev.reason||'').slice(0,80)+'" url='+String(u).slice(0,80));}catch(e){} } });
              w.addEventListener('error', function(){ if (_wsN < 4) { _wsN++; try{console.log('__CC_DIAG__ws-error url='+String(u).slice(0,80));}catch(e){} } });
            } catch(e){}
            return w;
          };
          _WS.prototype = _OWS.prototype;
          _WS.CONNECTING = _OWS.CONNECTING; _WS.OPEN = _OWS.OPEN; _WS.CLOSING = _OWS.CLOSING; _WS.CLOSED = _OWS.CLOSED; _WS.__ccWrapped = 1;
          window.WebSocket = _WS;
          try{console.log('__CC_DIAG__ws-hook: attached');}catch(e){}
        }
      } catch(e){}
      // v1.2.332: регистрацию ServiceWorker у веб-мессенджеров мы ГЛУШИМ НАМЕРЕННО (sessionSetup) —
      // её отказ это НЕ ошибка страницы, а наш же выбор. Не засоряем __ccLastErr/журнал этим
      // самоинициированным сбоем (иначе health[err] у МАКС/ВК/WhatsApp повторяет его каждые 30с).
      var _ccSkip = function(m){ return (''+(m||'')).indexOf('ServiceWorker') !== -1; };
      // v1.2.418: СВЁРТКА ПОВТОРОВ — одинаковая ошибка в цикле (напр. МАКС «Too many requests» ~7/сек) больше
      // НЕ засыпает журнал 30к строк: первую пишем сразу, дальше молча копим и раз в 10с — сводка «×N за Nс».
      // Побочно это делает шторм ПОДСЧИТЫВАЕМЫМ (после фикса SW у МАКС таких строк быть почти не должно).
      window.__ccErrLast = ''; window.__ccErrCount = 0; window.__ccErrTs = 0;
      var _ccEmit = function(text, stack){
        var now = Date.now();
        if (text === window.__ccErrLast) {
          window.__ccErrCount++;
          if (now - window.__ccErrTs >= 10000) {
            try{console.log('__CC_DIAG__wv-runtime: '+text+' ×'+window.__ccErrCount+' за '+Math.round((now-window.__ccErrTs)/1000)+'с');}catch(e){}
            window.__ccErrTs = now; window.__ccErrCount = 0;
          }
          return;
        }
        window.__ccErrLast = text; window.__ccErrCount = 0; window.__ccErrTs = now;
        try{console.log('__CC_DIAG__wv-runtime: '+text);}catch(e){}
        // v1.2.421 ВРЕМЕННАЯ ДИАГНОСТИКА: у ПЕРВОГО появления ошибки пишем и СТЕК (откуда кинута) — покажет,
        // какой код МАКС зацикливается и кидает «Too many requests» (это внутренний лимит страницы, не HTTP 429).
        if (stack) { try{console.log('__CC_DIAG__wv-stack: '+stack);}catch(e){} }
      };
      window.addEventListener('error', function(ev){
        var m = (ev && ev.message) || '';
        if (_ccSkip(m)) return;
        var s = (ev && ev.filename) || '';
        var l = (ev && ev.lineno) || 0;
        var st = (ev && ev.error && ev.error.stack) ? String(ev.error.stack).replace(/\s+/g,' ').slice(0,500) : '';
        window.__ccLastErr = (m+'|'+s+':'+l).slice(0,300);
        _ccEmit(window.__ccLastErr, st);
      });
      window.addEventListener('unhandledrejection', function(ev){
        var m = (ev && ev.reason && (ev.reason.message || String(ev.reason))) || '';
        if (_ccSkip(m)) return;
        var st = (ev && ev.reason && ev.reason.stack) ? String(ev.reason.stack).replace(/\s+/g,' ').slice(0,500) : '';
        window.__ccLastErr = ('rej|'+m).slice(0,300);
        _ccEmit(window.__ccLastErr, st);
      });
      try{console.log('__CC_DIAG__wv-err-catcher: attached');}catch(e){}
    })();`
    if (el.executeJavaScript) el.executeJavaScript(catcher).catch(() => {})
  } catch(_) {}
}

/**
 * v1.2.12: Диагностика «чёрного экрана» webview — снимок состояния отрисовки в chatcenter.log.
 * Запускается при did-stop-loading (после перезагрузки) и при активации вкладки (переключился — а там чёрный).
 * Пишет 2 строки [blackscreen]:
 *  - host: размер/видимость/прозрачность элемента <webview> + что в центре (не перекрыт ли нашим UI);
 *  - guest: visibilityState/hidden (страница «спит»?), фон body, число детей, полноэкранный оверлей
 *    (экран-объявление MAX?), что в центре страницы, число «больших» canvas (рисует ли вообще).
 * Лог через app:log (стандартный путь renderer → chatcenter.log), без console.* в renderer.
 */
export function probeBlackScreen(el, messengerId) {
  const log = (level, message) => { try { window.api?.send?.('app:log', { level, message: '[blackscreen] ' + (messengerId || '?') + ' ' + message }) } catch (_) {} }
  setTimeout(() => {
    try {
      const r = el.getBoundingClientRect?.(), cs = getComputedStyle(el)
      let cover = 'none'
      try { const cx = (r?.left || 0) + (r?.width || 0) / 2, cy = (r?.top || 0) + (r?.height || 0) / 2, t = document.elementFromPoint(cx, cy); cover = t ? `${t.tagName}.${(t.className || '').toString().slice(0, 30)}` : 'none' } catch (_) {}
      const bad = (r?.width || 0) < 5 || (r?.height || 0) < 5 || cs.visibility !== 'visible' || cs.opacity === '0'
      let url = ''; try { url = el.getURL?.() || '' } catch (_) {}
      log(bad ? 'WARN' : 'INFO', `host wv=${Math.round(r?.width || 0)}x${Math.round(r?.height || 0)} vis=${cs.visibility} disp=${cs.display} op=${cs.opacity} cover@center=${cover} url=${url.slice(0, 60)}`)
    } catch (e) { log('WARN', 'host err=' + (e?.message || e)) }
    try {
      if (!el.executeJavaScript) return
      el.executeJavaScript(`(function(){try{
        var b=document.body,bs=b?getComputedStyle(b):null,W=innerWidth,H=innerHeight;
        var all=document.querySelectorAll('div,section,main,dialog'),ov='none',n=0;
        for(var i=0;i<all.length&&n<1;i++){var e=all[i],s=getComputedStyle(e);if(s.position==='fixed'||s.position==='absolute'){var rr=e.getBoundingClientRect();if(rr.width>=W*0.9&&rr.height>=H*0.9&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'){ov=e.tagName+'.'+(e.className||'').toString().slice(0,24)+' bg='+s.backgroundColor+' z='+s.zIndex;n++}}}
        var t=document.elementFromPoint(Math.round(W/2),Math.round(H/2)),cnv=document.querySelectorAll('canvas'),cb=0;
        for(var k=0;k<cnv.length;k++){if(cnv[k].width>50&&cnv[k].height>50)cb++}
        return 'vis='+document.visibilityState+' hidden='+document.hidden+' ready='+document.readyState+' bodyBg='+(bs?bs.backgroundColor:'?')+' children='+(b?b.childElementCount:0)+' innerLen='+(b?(b.innerHTML||'').length:0)+' center='+(t?(t.tagName+'.'+(t.className||'').toString().slice(0,24)):'none')+' fullOverlay='+ov+' canvasBig='+cb;
      }catch(e){return 'guest-script-err='+(e&&e.message||e)}})()`)
        .then(res => log('INFO', 'guest ' + String(res || '').slice(0, 400)))
        .catch(e => log('WARN', 'guest exec err=' + (e?.message || e)))
    } catch (e) { log('WARN', 'guest err=' + (e?.message || e)) }
  }, 1200)
}
