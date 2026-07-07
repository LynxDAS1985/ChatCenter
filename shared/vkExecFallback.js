const PREFIX = '__CC_VK_EXEC_FALLBACK__'

export function parseVkExecFallbackMessage(message) {
  if (typeof message !== 'string' || !message.startsWith(PREFIX)) return null
  try { return JSON.parse(message.slice(PREFIX.length)) } catch { return null }
}

export function createVkExecFallbackRuntime(options) {
  const {
    isVkWebview,
    traceNotif,
    handleNewMessage,
    monitorReadyRef,
    timersRef,
  } = options

  return {
    schedule(el, messengerId, reason = 'dom-ready') {
      if (!isVkWebview(el, messengerId)) return
      clearTimeout(timersRef.current[messengerId])
      timersRef.current[messengerId] = setTimeout(() => {
        const ready = monitorReadyRef.current[messengerId]
        if (ready && Date.now() - ready.ts < 60000) {
          traceNotif('debug', 'info', messengerId, 'VK preload alive', `VK-EXEC skip reason=${reason} stage=${ready.stage || ''}`)
          return
        }
        traceNotif('debug', 'warn', messengerId, 'VK preload missing heartbeat', `VK-EXEC inject reason=${reason}`)
        try {
          el.executeJavaScript(buildVkExecFallbackScript())
            .then(result => traceNotif('debug', 'info', messengerId, 'VK exec fallback', `VK-EXEC injected result=${String(result || '')}`))
            .catch(error => traceNotif('error', 'warn', messengerId, 'VK exec fallback', `VK-EXEC inject failed: ${error?.message || error}`))
        } catch (error) {
          traceNotif('error', 'warn', messengerId, 'VK exec fallback', `VK-EXEC inject throw: ${error?.message || error}`)
        }
      }, 3500)
    },

    handleConsole(e, messengerId) {
      const d = e.details || e
      const msg = d.message ?? e.message
      const payload = parseVkExecFallbackMessage(msg)
      if (!payload) return false
      const text = String(payload.text || '').trim()
      const detail = `VK-EXEC kind=${payload.kind || ''} source=${payload.source || ''} reason=${payload.reason || ''} seq=${payload.seq || ''} sender=${payload.senderName || ''} icon=${!!payload.iconUrl} activeUnread=${!!payload.vkActiveUnread} rows=${payload.rows ?? ''} emitted=${payload.emitted ?? ''} row=${payload.row ?? ''} count=${payload.count ?? ''} selected=${payload.selected ?? ''} freshMin=${payload.freshMin ?? ''} decision=${payload.decision || ''} title=${String(payload.rowTitle || '').slice(0, 80)} preview=${String(payload.preview || '').slice(0, 120)} badgeText=${String(payload.badgeText || '').slice(0, 40)} badgeSource=${String(payload.badgeSource || '').slice(0, 80)} badgeCandidates=${String(payload.badgeCandidates || '').slice(0, 700)} raw=${String(payload.raw || '').slice(0, 180)} msgId=${payload.messageId || ''} url=${String(payload.url || '').slice(0, 180)}`
      traceNotif(payload.kind === 'new-message' ? 'source' : 'debug', payload.kind === 'new-message' ? 'info' : 'warn', messengerId, text || 'VK exec fallback', detail)
      if (payload.kind === 'new-message' && text) {
        handleNewMessage(messengerId, text, {
          senderName: payload.senderName || '',
          ...(payload.iconUrl ? { iconUrl: payload.iconUrl } : {}),
          chatTag: payload.chatTag || payload.url || '',
          messageId: payload.messageId || '',
          source: payload.source || 'vk-exec-fallback',
          vkActiveUnread: !!payload.vkActiveUnread,
        })
      }
      return true
    },
  }
}

export function buildVkExecFallbackScript() {
  return `;(function(){
  var PREFIX='${PREFIX}';
  var SCRIPT_VERSION='1.2.57-vk-toast-observer';
  if(window.__ccVkExecFallbackInstalled===SCRIPT_VERSION){
    try{console.log(PREFIX+JSON.stringify({kind:'already-installed',version:SCRIPT_VERSION,url:location.href,ts:Date.now()}));}catch(e){}
    return 'already-installed';
  }
  if(window.__ccVkExecFallbackObserver){try{window.__ccVkExecFallbackObserver.disconnect();}catch(e){}}
  if(window.__ccVkSidebarObserver){try{window.__ccVkSidebarObserver.disconnect();}catch(e){}}
  if(window.__ccVkToastObserver){try{window.__ccVkToastObserver.disconnect();}catch(e){}}
  window.__ccVkExecFallbackInstalled=SCRIPT_VERSION;
  function clean(v){return String(v||'').replace(/\\s+/g,' ').trim();}
  function attr(el,n){try{return el&&el.getAttribute&&el.getAttribute(n)||'';}catch(e){return '';}}
  function cls(el){return typeof(el&&el.className)==='string'?el.className:'';}
  function emit(payload){try{console.log(PREFIX+JSON.stringify(Object.assign({url:location.href,ts:Date.now()},payload)));}catch(e){}}
  function one(sel,root){try{return (root||document).querySelector(sel);}catch(e){return null;}}
  function all(sel,root){try{return Array.from((root||document).querySelectorAll(sel));}catch(e){return [];}}
  var currentUrl='',currentContainer=null,currentObserver=null,sidebarObserver=null,toastObserver=null,sidebarTimer=0,toastTimer=0,sidebarSeen={},sidebarNotified={},toastSeen={};
  function findContainer(){
    var selectors=['.ConvoMain__history','[class*="ConvoMain__history"]','[class*="im-page--chat-body"]','[class*="im_msg_list"]','[class*="im-history"]','[class*="ConversationBody"]','[class*="HistoryMessages"]'];
    for(var i=0;i<selectors.length;i++){var el=one(selectors[i]);if(el)return{el:el,selector:selectors[i]};}
    return{el:null,selector:''};
  }
  function isOutgoing(el){
    var cur=el;
    for(var i=0;i<9&&cur;i++){
      var c=cls(cur), d=attr(cur,'data-out')||attr(cur,'data-outgoing')||attr(cur,'data-own'), aria=attr(cur,'aria-label');
      if(/(^|\\s)(ConvoStack--out|ConvoMessage--out|im-mess_out|message_out)(\\s|$)/i.test(c))return true;
      if(/^(1|true|yes)$/i.test(d))return true;
      if(/you sent|outgoing/i.test(aria))return true;
      cur=cur.parentElement;
    }
    return false;
  }
  function findMessageEl(node,container){
    if(!node||node.nodeType!==1)return null;
    var sels=['[data-msgid]','[data-message-id]','[class*="ConvoHistory__messageBlock"]','[class*="ConvoMessage"]','[class*="im-mess"]','[class*="im_msg"]'];
    for(var i=0;i<sels.length;i++){
      var s=sels[i], m=null;
      try{if(node.matches&&node.matches(s))m=node;else if(node.closest)m=node.closest(s);if(!m&&node.querySelector)m=node.querySelector(s);}catch(e){}
      if(m&&(!container||container.contains(m)))return m;
    }
    return null;
  }
  function textOf(msg){
    var sels=['[class*="MessageText"]','[class*="messageText"]','[class*="ConvoMessageWithoutBubble__text"]','[class*="ConvoMessage__text"]','[class*="text"]','[class*="Text"]','p','span'];
    for(var i=0;i<sels.length;i++){
      var nodes=all(sels[i],msg);
      for(var j=nodes.length-1;j>=0;j--){
        var t=clean(nodes[j].textContent);
        if(!t||t.length>600)continue;
        if(/^\\d{1,2}:\\d{2}(:\\d{2})?$/.test(t))continue;
        if(/^(online|offline|typing|edited)$/i.test(t))continue;
        return t;
      }
    }
    var raw=clean(msg&&msg.textContent);
    if(raw.length>0&&raw.length<=600)return raw;
    return '';
  }
  function messageId(msg){return attr(msg,'data-msgid')||attr(msg,'data-message-id')||attr(msg,'data-id')||'';}
  function fingerprint(msg){
    var id=messageId(msg);
    if(id)return'id:'+id;
    return(isOutgoing(msg)?'out':'in')+'|'+clean(textOf(msg))+'|'+cls(msg).slice(0,120);
  }
  function senderFromMsg(msg){
    var sels=['[class*="ConvoMessageHeader"] [class*="PeerTitle"]','[class*="ConvoMessageHeader"] [class*="author"]','[class*="PeerTitle"]','[class*="author"]'];
    for(var i=0;i<sels.length;i++){var t=clean(one(sels[i],msg)&&one(sels[i],msg).textContent);if(t&&t.length<120)return t;}
    var head=clean(one('[class*="ConvoHeader"] [class*="Title"], [class*="ConvoHeader"] [class*="title"], h1, h2')&&one('[class*="ConvoHeader"] [class*="Title"], [class*="ConvoHeader"] [class*="title"], h1, h2').textContent);
    return head.replace(/\\s*(online|offline|typing)$/i,'').trim();
  }
  function avatarFrom(msg){
    var img=one('img[src]',msg)||one('[class*="ConvoHeader"] img[src], img[src*="userapi"], img[src*="vkuser"]');
    return img&&img.src||'';
  }
  function isAfterNewMessagesMarker(msg,container){
    var nodes=all('div,section,article,span',container), seen=false;
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i], t=clean(el.textContent);
      if(t&&t.length<=80&&/(^|\\s)(Новые сообщения|New messages)(\\s|$)/i.test(t))seen=true;
      if(el===msg||el.contains&&el.contains(msg)||msg.contains&&msg.contains(el))return seen;
    }
    return false;
  }
  function rowText(row,sel){var n=one(sel,row);return clean(n&&n.textContent);}
  function cleanSidebarPreview(text){
    var t=clean(text).replace(/^Вы:\\s*/i,'').trim();
    return t.replace(/\\s*·\\s*(?:(?:\u0442\u043e\u043b\u044c\u043a\u043e \u0447\u0442\u043e|\u0441\u0435\u0439\u0447\u0430\u0441|just now)|\d{1,2}\\s*(?:\u043c\b|\u043c\.|\u043c\u0438\u043d|\u0447\b|\u0447\.|\u0447\u0430\u0441|\u0434\b|\u0434\.|\u0434\u043d|\u043d\b|\u043d\.|\u043d\u0435\u0434|min|h|d)[\\s\d\u0430-\u044f\u0451.]*|\d{1,2}\\s+[\u0430-\u044f\u0451]{3,}\.?)\\s*\d*\\s*$/i,'').trim();
  }
  function isVkToastLabel(text){return /(?:\u041d\u043e\u0432\u043e\u0435\s+\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435|New message)/i.test(clean(text));}
  function visible(el){try{var r=el&&el.getBoundingClientRect&&el.getBoundingClientRect();var s=window.getComputedStyle&&window.getComputedStyle(el);return !!(r&&r.width>20&&r.height>16&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&(!s||s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0));}catch(e){return false;}}
  function toastRootOk(el){if(!visible(el))return false;var r=el.getBoundingClientRect(), t=clean(el.innerText||el.textContent);return t.length>0&&t.length<=320&&isVkToastLabel(t)&&r.width>=180&&r.width<=520&&r.height>=48&&r.height<=220;}
  function toastLines(root){var out=[];all('div,span,a,strong,b',root).forEach(function(el){if(!visible(el))return;var t=clean(el.innerText||el.textContent);if(t&&t.length<=180&&out.indexOf(t)<0)out.push(t);});if(!out.length)String(root&&root.innerText||root&&root.textContent||'').split(/\n+/).map(clean).filter(Boolean).forEach(function(t){if(out.indexOf(t)<0)out.push(t);});return out.filter(function(t,i,a){return !a.some(function(other,j){return i!==j&&other.length<t.length&&t.indexOf(other)>=0&&t.length>other.length+8;});});}
  function parseVkToast(root){var lines=toastLines(root),labelIndex=-1;for(var i=0;i<lines.length;i++){if(isVkToastLabel(lines[i])){labelIndex=i;break;}}if(labelIndex<0)return null;var after=lines.slice(labelIndex).map(function(t){return clean(t.replace(/(?:\u041d\u043e\u0432\u043e\u0435\s+\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435|New message)/ig,''));}).filter(Boolean),sender=after[0]||'',text=after.slice(1).join(' ').trim();if(!text&&after.length===1){var parts=after[0].split(/\s{2,}| - |: /).map(clean).filter(Boolean);if(parts.length>=2){sender=parts[0];text=parts.slice(1).join(' ');}}sender=clean(sender).replace(/\s*(online|offline|\u043e\u043d\u043b\u0430\u0439\u043d|\u0437\u0430\u0445\u043e\u0434\u0438\u043b[^\n]*)$/i,'').trim();text=clean(text);var img=one('img[src]',root),icon=img&&img.src||'',raw=clean(root.innerText||root.textContent),decision=sender&&text?'emit-toast':'block-incomplete-toast';return{sender:sender,text:text,icon:icon,raw:raw,lines:lines.slice(0,8).join(' || '),decision:decision};}
  function hash(s){var h=0;for(var i=0;i<s.length;i++){h=((h<<5)-h+s.charCodeAt(i))|0;}return Math.abs(h).toString(36);}
  function scanVkToasts(reason,notify){var roots=[],seen=[],emitted=0;all('div,section,aside,[role]',document).forEach(function(el){if(seen.indexOf(el)>=0||!toastRootOk(el))return;seen.push(el);roots.push(el);});roots.forEach(function(root,index){var d=parseVkToast(root),fp=d&&hash((d.sender||'')+'|'+(d.text||'')+'|'+(d.icon||''))||'';if(d)emit({kind:'toast-candidate',source:'vk-toast',reason:reason,row:index,senderName:d.sender,text:d.text,iconUrl:d.icon,decision:d.decision,raw:String(d.raw||'').slice(0,260),lines:d.lines});if(!notify||!d||d.decision!=='emit-toast'||toastSeen[fp])return;toastSeen[fp]=Date.now();emitted++;emit({kind:'new-message',source:'vk-toast',reason:reason,text:d.text,senderName:d.sender,iconUrl:d.icon,chatTag:'vk-toast:'+d.sender+'|'+d.icon,messageId:'vk-toast:'+fp});});Object.keys(toastSeen).forEach(function(k){if(Date.now()-toastSeen[k]>120000)delete toastSeen[k];});emit({kind:'toast-scan',reason:reason,rows:roots.length,emitted:emitted});}
  function rectInfo(el){try{var r=el&&el.getBoundingClientRect&&el.getBoundingClientRect();if(!r)return'';return Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.width)+'x'+Math.round(r.height);}catch(e){return'';}}
  function sameRowY(el,row){try{var a=el.getBoundingClientRect(),b=row.getBoundingClientRect(),cy=a.top+a.height/2;return cy>=b.top-8&&cy<=b.bottom+8&&a.width>0&&a.height>0;}catch(e){return true;}}
  function nodeInfo(el){if(!el)return'';var c=clean(cls(el)).slice(0,90),role=attr(el,'role'),aria=attr(el,'aria-label'),text=clean(el.textContent).slice(0,80);return String(el.tagName||'').toLowerCase()+'.'+c+' role='+role+' aria='+aria+' rect='+rectInfo(el)+' text='+text;}
  function unreadProbe(row){
    var primary=one('[class*="ConvoListItem__icons"] [class*="Counter"], [class*="ConvoListItem__icons"], [class*="unread"], [class*="Unread"], [class*="counter"]',row);
    var roots=[row,row&&row.parentElement].filter(Boolean),seen=[],candidates=[],sels='[class*="Counter"], [class*="counter"], [class*="Unread"], [class*="unread"], [class*="Badge"], [class*="badge"], [class*="Count"], [class*="count"], [aria-label*="непроч"], [aria-label*="unread"]';
    roots.forEach(function(root){all(sels,root).forEach(function(el){if(seen.indexOf(el)>=0||!sameRowY(el,row))return;seen.push(el);var text=clean(el.textContent),aria=clean(attr(el,'aria-label')),info=nodeInfo(el);if(/\\d+/.test(text+aria)||/counter|unread|badge|count/i.test(cls(el)))candidates.push(info);});});
    return{text:clean((primary||{}).textContent),source:primary?nodeInfo(primary):'',candidates:candidates.slice(0,10).join(' || ')};
  }
  function rowData(row){
    var title=rowText(row,'[class*="ConvoListItem__header"], [class*="ConvoListItem__title"], [class*="PeerTitle"], [class*="title"]');
    var preview=rowText(row,'[class*="ConvoListItem__message"] [class*="ConvoListItem__text"], [class*="ConvoListItem__message"], [class*="message"]');
    var badge=unreadProbe(row), unread=badge.text;
    var count=parseInt((unread.match(/\\d+/)||['0'])[0],10)||0, img=one('[class*="ConvoListItem__avatar"] img[src], img[src]',row), selected=/ConvoListItem--selected/i.test(cls(row));
    preview=cleanSidebarPreview(preview);
    var key=clean(title+'|'+(img&&img.src||'')).slice(0,240);
    return{title:title,preview:preview,count:count,avatar:img&&img.src||'',selected:selected,key:key,fp:key+'|'+count+'|'+preview,raw:clean(row.textContent),badgeText:badge.text,badgeSource:badge.source,badgeCandidates:badge.candidates};
  }
  function rowFreshMinutes(raw){
    raw=clean(raw);
    if(/(\\u0442\\u043e\\u043b\\u044c\\u043a\\u043e \\u0447\\u0442\\u043e|\\u0441\\u0435\\u0439\\u0447\\u0430\\u0441|just now)/i.test(raw))return 0;
    var m=raw.match(/(?:^|[^\\d])(\\d{1,2})\\s*(?:\\u043c\\b|\\u043c\\.|\\u043c\\u0438\\u043d(?:\\u0443\\u0442(?:\\u0430|\\u044b)?|\\.)?|min|m)(?:\\s|$|\\.|\\d)/i);
    if(m)return parseInt(m[1],10);
    return null;
  }
  function shouldEmitSidebarBaseline(reason,d){
    if(reason!=='baseline-spa-rebind'||!d.count||!d.preview)return false;
    var minutes=rowFreshMinutes(d.raw);
    return minutes!==null&&minutes<=10&&!sidebarNotified[d.fp];
  }
  function isSidebarTypingStatus(d){
    if(!d||d.count>0||!d.preview)return false;
    var raw=clean(d.raw), title=clean(d.title), preview=clean(d.preview);
    if(!title||!preview)return false;
    var compact=clean((title+preview).replace(/\\s+/g,''));
    var rawCompact=raw.replace(/\\s+/g,'');
    return rawCompact===compact&&/^(печатает|typing)$/i.test(preview);
  }
  function sidebarDecision(reason,notify,d,prev,baselineFresh){
    var minutes=rowFreshMinutes(d.raw), decision='block-unknown';
    if(!d.key)decision='block-no-key';
    else if(d.selected)decision='block-selected';
    else if(!d.preview)decision='block-no-preview';
    else if(isSidebarTypingStatus(d))decision='block-typing-status';
    else if(baselineFresh)decision='emit-baseline-fresh';
    else if(!notify)decision='block-baseline';
    else if(!prev)decision='block-no-prev';
    else if(!d.count)decision='block-no-unread';
    else if(sidebarNotified[d.fp])decision='block-already-notified';
    else if(d.count>(prev.count||0)||d.preview!==prev.preview)decision='emit-mutation-change';
    else decision='block-no-change';
    return{decision:decision,freshMin:minutes};
  }
  function shouldLogSidebarRow(reason,notify,d,prev,decision,index){
    if(reason==='baseline-spa-rebind'&&index<40)return true;
    if(d.count>0||decision.indexOf('emit-')===0)return true;
    if(prev&&(d.preview!==prev.preview||d.count!==(prev.count||0)))return true;
    return false;
  }
  function findSidebarRoot(){
    var item=one('[class*="ConvoListItem"]'), cur=item&&item.parentElement;
    for(var i=0;i<8&&cur;i++){
      try{if(cur.querySelectorAll('[class*="ConvoListItem"]').length>=2)return cur;}catch(e){}
      cur=cur.parentElement;
    }
    return one('[class*="Messenger"], [class*="messenger"]')||document.body;
  }
  function scanSidebar(reason,notify){
    var rows=all('[class*="ConvoListItem"]'), n=0;
    rows.forEach(function(row,index){
      var d=rowData(row), prev=d.key&&sidebarSeen[d.key], baselineFresh=shouldEmitSidebarBaseline(reason,d), diag=sidebarDecision(reason,notify,d,prev,baselineFresh);
      if(shouldLogSidebarRow(reason,notify,d,prev,diag.decision,index)){
        emit({kind:'sidebar-row',reason:reason,row:index,rowTitle:d.title,preview:d.preview,count:d.count,selected:!!d.selected,decision:diag.decision,freshMin:diag.freshMin,prevCount:prev&&prev.count||0,prevPreview:prev&&prev.preview||'',badgeText:d.badgeText,badgeSource:d.badgeSource,badgeCandidates:d.badgeCandidates,raw:String(d.raw||'').slice(0,260),avatar:!!d.avatar});
      }
      if(!d.key||d.selected||!d.preview)return;
      sidebarSeen[d.key]=d;
      if((baselineFresh||notify&&prev&&d.count>0&&(d.count>(prev.count||0)||d.preview!==prev.preview))&&!sidebarNotified[d.fp]){
        sidebarNotified[d.fp]=Date.now();
        n++; emit({kind:'new-message',source:'vk-sidebar-unread',reason:baselineFresh?'baseline-fresh-unread':reason,text:d.preview,senderName:d.title,iconUrl:d.avatar,chatTag:d.key,messageId:d.fp});
      }
    });
    emit({kind:'sidebar-scan',reason:reason,rows:rows.length,emitted:n});
  }
  function bindSidebar(reason){
    if(sidebarObserver){try{sidebarObserver.disconnect();}catch(e){}}
    var root=findSidebarRoot(); scanSidebar('baseline-'+reason,false);
    sidebarObserver=new MutationObserver(function(){clearTimeout(sidebarTimer);sidebarTimer=setTimeout(function(){scanSidebar('mutation',true);},120);});
    sidebarObserver.observe(root,{childList:true,subtree:true,characterData:true});
    window.__ccVkSidebarObserver=sidebarObserver;
    emit({kind:'sidebar-bound',reason:reason});
  }
  function bindToast(reason){
    if(toastObserver){try{toastObserver.disconnect();}catch(e){}}
    scanVkToasts('baseline-'+reason,false);
    toastObserver=new MutationObserver(function(){clearTimeout(toastTimer);toastTimer=setTimeout(function(){scanVkToasts('mutation',true);},80);});
    toastObserver.observe(document.body||document.documentElement,{childList:true,subtree:true,characterData:true});
    window.__ccVkToastObserver=toastObserver;
    emit({kind:'toast-bound',reason:reason});
  }
  function bind(reason){
    var found=findContainer();
    bindToast(reason);
    bindSidebar(reason);
    if(!found.el){emit({kind:'container-not-found-sidebar-bound',reason:reason,title:document.title});return false;}
    var container=found.el, baseline=new Set(), nodes=[];
    if(currentObserver){try{currentObserver.disconnect();}catch(e){}}
    currentContainer=container;currentUrl=location.href;
    ['[data-msgid]','[data-message-id]','[class*="ConvoHistory__messageBlock"]','[class*="ConvoMessage"]','[class*="im-mess"]','[class*="im_msg"]'].forEach(function(s){nodes=nodes.concat(all(s,container));});
    nodes.forEach(function(n){var fp=fingerprint(n);if(fp)baseline.add(fp);});
    emit({kind:'bound',reason:reason,selector:found.selector,baseline:baseline.size,title:document.title});
    var seq=0;
    currentObserver=new MutationObserver(function(muts){
      seq++;
      var candidates=[];
      muts.forEach(function(m){if(m.type==='childList')Array.from(m.addedNodes||[]).forEach(function(n){if(n.nodeType===1)candidates.push(n);});else if(m.type==='characterData'&&m.target&&m.target.parentElement)candidates.push(m.target.parentElement);});
      if(!candidates.length)return;
      emit({kind:'mutation',seq:seq,mutations:muts.length,candidates:candidates.length});
      candidates.forEach(function(node){
        if(!container.contains(node))return emit({kind:'skip',reason:'outside-container',seq:seq});
        var msg=findMessageEl(node,container);
        if(!msg)return emit({kind:'skip',reason:'no-message-node',seq:seq,text:clean(node.textContent).slice(0,240)});
        var fp=fingerprint(msg), text=textOf(msg), outgoing=isOutgoing(msg);
        if(!text)return emit({kind:'skip',reason:'no-text',seq:seq,fingerprint:fp});
        if(baseline.has(fp))return emit({kind:'skip',reason:'baseline-existing-message',seq:seq,text:text,fingerprint:fp});
        baseline.add(fp);
        if(outgoing)return emit({kind:'skip',reason:'outgoing-own-message',seq:seq,text:text,fingerprint:fp});
        emit({kind:'new-message',source:'vk-exec-fallback',seq:seq,text:text,senderName:senderFromMsg(msg),iconUrl:avatarFrom(msg),chatTag:location.href,messageId:fp,vkActiveUnread:isAfterNewMessagesMarker(msg,container)});
      });
    });
    currentObserver.observe(container,{childList:true,subtree:true,characterData:true});
    window.__ccVkExecFallbackObserver=currentObserver;
    return true;
  }
  if(!bind('initial'))setTimeout(function(){bind('retry-3s');},3000);
  setInterval(function(){
    var found=findContainer();
    if(location.href!==currentUrl||!currentContainer||!currentContainer.isConnected||found.el!==currentContainer)bind('spa-rebind');
  },2000);
  return 'installed';
})();`
}
