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
      const detail = `VK-EXEC kind=${payload.kind || ''} reason=${payload.reason || ''} seq=${payload.seq || ''} sender=${payload.senderName || ''} icon=${!!payload.iconUrl} activeUnread=${!!payload.vkActiveUnread} msgId=${payload.messageId || ''} url=${String(payload.url || '').slice(0, 180)}`
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
  var SCRIPT_VERSION='1.2.49-active-unread';
  if(window.__ccVkExecFallbackInstalled===SCRIPT_VERSION){
    try{console.log(PREFIX+JSON.stringify({kind:'already-installed',version:SCRIPT_VERSION,url:location.href,ts:Date.now()}));}catch(e){}
    return 'already-installed';
  }
  if(window.__ccVkExecFallbackObserver){try{window.__ccVkExecFallbackObserver.disconnect();}catch(e){}}
  if(window.__ccVkSidebarObserver){try{window.__ccVkSidebarObserver.disconnect();}catch(e){}}
  window.__ccVkExecFallbackInstalled=SCRIPT_VERSION;
  function clean(v){return String(v||'').replace(/\\s+/g,' ').trim();}
  function attr(el,n){try{return el&&el.getAttribute&&el.getAttribute(n)||'';}catch(e){return '';}}
  function cls(el){return typeof(el&&el.className)==='string'?el.className:'';}
  function emit(payload){try{console.log(PREFIX+JSON.stringify(Object.assign({url:location.href,ts:Date.now()},payload)));}catch(e){}}
  function one(sel,root){try{return (root||document).querySelector(sel);}catch(e){return null;}}
  function all(sel,root){try{return Array.from((root||document).querySelectorAll(sel));}catch(e){return [];}}
  var currentUrl='',currentContainer=null,currentObserver=null,sidebarObserver=null,sidebarTimer=0,sidebarSeen={};
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
  function rowData(row){
    var title=rowText(row,'[class*="ConvoListItem__header"], [class*="ConvoListItem__title"], [class*="PeerTitle"], [class*="title"]');
    var preview=rowText(row,'[class*="ConvoListItem__message"] [class*="ConvoListItem__text"], [class*="ConvoListItem__message"], [class*="message"]');
    var unread=clean((one('[class*="ConvoListItem__icons"] [class*="Counter"], [class*="ConvoListItem__icons"], [class*="unread"], [class*="Unread"], [class*="counter"]',row)||{}).textContent);
    var count=parseInt((unread.match(/\\d+/)||['0'])[0],10)||0, img=one('[class*="ConvoListItem__avatar"] img[src], img[src]',row), selected=/ConvoListItem--selected/i.test(cls(row));
    preview=preview.replace(/^Вы:\\s*/i,'').replace(/\\s*·\\s*\\S+$/,'').trim();
    var key=clean(title+'|'+(img&&img.src||'')).slice(0,240);
    return{title:title,preview:preview,count:count,avatar:img&&img.src||'',selected:selected,key:key,fp:key+'|'+count+'|'+preview};
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
    rows.forEach(function(row){
      var d=rowData(row); if(!d.key||d.selected||!d.preview)return;
      var prev=sidebarSeen[d.key]; sidebarSeen[d.key]=d;
      if(notify&&prev&&d.count>0&&(d.count>(prev.count||0)||d.preview!==prev.preview)){
        n++; emit({kind:'new-message',source:'vk-sidebar-unread',reason:reason,text:d.preview,senderName:d.title,iconUrl:d.avatar,chatTag:d.key,messageId:d.fp});
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
  function bind(reason){
    var found=findContainer();
    if(!found.el){emit({kind:'container-not-found',reason:reason,title:document.title});return false;}
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
    bindSidebar(reason);
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
