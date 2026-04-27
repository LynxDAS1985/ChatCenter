// Навигация к чату в Telegram Web K.
// v0.85.8: для пользователей (u) — DOM-клик первый, для каналов (c) — hash первый.
// Возвращает строку для executeJavaScript в WebView.

export function buildTelegramScript(senderName, chatTag) {
  const nameJson = JSON.stringify(senderName || '')
  return `(function() {
    try {
      var log = [];
      ${chatTag ? `
      var tag = ${JSON.stringify(chatTag)};
      log.push('tag=' + tag);
      var peerId = tag.split('_')[0].replace(/[^0-9-]/g, '');
      log.push('peerId=' + peerId);
      if (peerId) {
        var prefix = tag.charAt(0);
        log.push('prefix=' + prefix);
        // Ищем ТОЛЬКО в chatlist (не внутри открытого чата/группы!)
        var el = document.querySelector('.chatlist-chat[data-peer-id="' + peerId + '"]');
        if (!el) el = document.querySelector('a[data-peer-id="' + peerId + '"]');
        if (!el) el = document.querySelector('.chatlist-chat[data-peer-id="-' + peerId + '"]');
        if (!el) el = document.querySelector('a[data-peer-id="-' + peerId + '"]');
        log.push('domFound=' + !!el);
        if (el) {
          log.push('elTag=' + el.tagName + ',cls=' + (el.className||'').slice(0,50) + ',pid=' + (el.getAttribute('data-peer-id')||''));
          try {
            el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, view:window}));
            el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
          } catch(ce) { log.push('clickErr=' + ce.message); }
          return {ok:true, method:'tag-click', log:log.join(', ')};
        }
        // DOM не нашёл — hash навигация (работает из любой папки)
        try {
          var hashId = peerId;
          if (prefix === 'c') hashId = '-100' + peerId;
          else if (prefix !== 'u' && peerId.charAt(0) !== '-') {
            var peerType0 = 0;
            var m0 = tag.match(/^peer(\\d+)_/);
            if (m0) peerType0 = parseInt(m0[1]);
            if (peerType0 >= 4) hashId = '-100' + peerId;
            else if (peerType0 === 2) hashId = '-' + peerId;
          }
          location.hash = '#' + hashId;
          log.push('hash=#' + hashId);
          return {ok:true, method:'hash', log:log.join(', ')};
        } catch(he) { log.push('hashErr=' + he.message); }
        if (!el) el = document.querySelector('[data-peer-id="-' + peerId + '"]');
        log.push('domFound=' + !!el);
        if (el) {
          var chat = el.closest('.chatlist-chat') || el;
          chat.click();
          return {ok:true, method:'tag-dom', log:log.join(', ')};
        }
        try {
          var peerType = 0;
          var m = tag.match(/^peer(\\d+)_/);
          if (m) peerType = parseInt(m[1]);
          var navId = peerId;
          if (peerType >= 4 && navId.charAt(0) !== '-') navId = '-100' + navId;
          else if (peerType === 2 && navId.charAt(0) !== '-') navId = '-' + navId;
          log.push('peerType=' + peerType + ',navId=' + navId);
          var el2 = document.querySelector('[data-peer-id="' + navId + '"]');
          if (el2) {
            var chat2 = el2.closest('.chatlist-chat') || el2;
            chat2.click();
            return {ok:true, method:'tag-navId', log:log.join(', ')};
          }
        } catch(pe) { log.push('peerErr=' + pe.message); }
      }` : ''}
      var name = ${nameJson};
      log.push('name=' + JSON.stringify(name));
      if (!name) return {ok:false, method:'noName', log:log.join(', ')};
      var all = document.querySelectorAll('.chatlist-chat .peer-title');
      log.push('count=' + all.length);
      var samples = [];
      for (var i = 0; i < Math.min(all.length, 8); i++) samples.push(all[i].textContent.trim().slice(0,40));
      log.push('samples=' + JSON.stringify(samples));
      for (var i = 0; i < all.length; i++) {
        if (all[i].textContent.trim() === name) {
          var chat = all[i].closest('.chatlist-chat');
          if (chat) { chat.click(); return {ok:true, method:'exact', idx:i, log:log.join(', ')}; }
        }
      }
      var nameLow = name.toLowerCase();
      for (var i = 0; i < all.length; i++) {
        if (all[i].textContent.trim().toLowerCase() === nameLow) {
          var chat = all[i].closest('.chatlist-chat');
          if (chat) { chat.click(); return {ok:true, method:'icase', idx:i, log:log.join(', ')}; }
        }
      }
      for (var i = 0; i < all.length; i++) {
        var t = all[i].textContent.trim();
        if (t && name.length > 3 && (t.indexOf(name) >= 0 || name.indexOf(t) >= 0)) {
          var chat = all[i].closest('.chatlist-chat');
          if (chat) { chat.click(); return {ok:true, method:'partial', matched:t.slice(0,40), log:log.join(', ')}; }
        }
      }
      var extra = document.querySelectorAll('[class*="chatlist"] [class*="title"], .dialog-title, .user-title, [class*="peer-title"]');
      log.push('extra=' + extra.length);
      for (var i = 0; i < extra.length; i++) {
        var t = extra[i].textContent.trim();
        if (t === name || (t && name.length > 3 && (t.indexOf(name) >= 0 || name.indexOf(t) >= 0))) {
          var chat = extra[i].closest('.chatlist-chat') || extra[i].closest('a') || extra[i].closest('li') || extra[i].closest('[data-peer-id]');
          if (chat) { chat.click(); return {ok:true, method:'extra', log:log.join(', ')}; }
        }
      }
      return {ok:false, method:'notFound', log:log.join(', ')};
    } catch(e) { return {ok:false, method:'error', err:e.message}; }
  })();`
}
