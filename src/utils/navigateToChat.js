/**
 * Навигация к чату в WebView по клику на ribbon.
 * Каждый мессенджер — свой скрипт навигации.
 */

export function buildChatNavigateScript(url, senderName, chatTag) {
  const nameJson = JSON.stringify(senderName || '')

  // Telegram Web K
  if (url.includes('telegram.org')) {
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
          // v0.85.8: Для пользователей (u) — сначала DOM-клик (надёжнее)
          // Для каналов (c) — hash первый (канала может не быть в chatlist текущей папки)
          var el = document.querySelector('[data-peer-id="' + peerId + '"]');
          if (!el) el = document.querySelector('[data-peer-id="-' + peerId + '"]');
          log.push('domFound=' + !!el);
          if (el) {
            log.push('elTag=' + el.tagName + ',elCls=' + (el.className||'').slice(0,60));
            var chat = el.closest('.chatlist-chat');
            log.push('closestChat=' + !!chat);
            if (!chat) chat = el.closest('a') || el.closest('li') || el.closest('[class*="ListItem"]') || el.closest('[class*="chat-item"]') || el;
            log.push('clickTarget=' + chat.tagName + ',cls=' + (chat.className||'').slice(0,60));
            // Пробуем разные стратегии клика
            chat.click();
            // Если chat = el (нет parent container) — пробуем MouseEvent с bubbles
            if (chat === el) {
              try { chat.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true})); } catch(ce) {}
              log.push('mouseEvent=dispatched');
            }
            return {ok:true, method:'tag-dom', log:log.join(', ')};
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

  // MAX (web.max.ru)
  if (url.includes('max.ru')) {
    return `(function() {
      try {
        var log = [];
        var name = ${nameJson};
        log.push('name=' + JSON.stringify(name));
        if (!name) return {ok:false, method:'noName', log:log.join(', ')};
        function scrollDown() {
          setTimeout(function() {
            var h = document.querySelector('.history') || document.querySelector('[class*="history"]');
            if (h) { h.scrollTop = h.scrollHeight; }
          }, 300);
        }
        var nameLow = name.toLowerCase();
        var nav = document.querySelector('nav') || document.querySelector('[class*="navigation"]');
        if (nav) {
          log.push('nav=' + nav.className.slice(0,40));
          var links = nav.querySelectorAll('a[href]');
          log.push('links=' + links.length);
          for (var i = 0; i < links.length; i++) {
            var t = links[i].textContent.trim();
            if (t === name) { links[i].click(); scrollDown(); return {ok:true, method:'nav-exact', log:log.join(', ')}; }
          }
          for (var i = 0; i < links.length; i++) {
            if (links[i].textContent.trim().toLowerCase() === nameLow) { links[i].click(); scrollDown(); return {ok:true, method:'nav-icase', log:log.join(', ')}; }
          }
          for (var i = 0; i < links.length; i++) {
            var t = links[i].textContent.trim();
            if (t && name.length > 2 && t.toLowerCase().indexOf(nameLow) >= 0) { links[i].click(); scrollDown(); return {ok:true, method:'nav-partial', log:log.join(', ')}; }
          }
        }
        // v0.81.6: MAX SvelteKit — чаты = div.wrapper--withActions
        // Svelte on:click НЕ триггерится от .click() на wrapper (common-mistakes строка 829)
        var wrappers = document.querySelectorAll('[class*="wrapper--withActions"]');
        log.push('wrappers=' + wrappers.length);
        for (var i = 0; i < wrappers.length; i++) {
          var t = wrappers[i].textContent.trim();
          if (t && t.toLowerCase().indexOf(nameLow) >= 0) {
            // v0.81.7: ДИАГНОСТИКА — что внутри wrapper, какие children
            var diag = [];
            for (var c = 0; c < Math.min(wrappers[i].children.length, 8); c++) {
              var ch = wrappers[i].children[c];
              diag.push(ch.tagName + '.' + (typeof ch.className === 'string' ? ch.className : '').slice(0,40).replace(/\s+/g,'.') + (ch.getAttribute && ch.getAttribute('href') ? '[href=' + ch.getAttribute('href').slice(0,20) + ']' : ''));
            }
            var par = wrappers[i].parentElement;
            var parInfo = par ? par.tagName + '.' + (typeof par.className === 'string' ? par.className : '').slice(0,40).replace(/\s+/g,'.') : 'none';
            log.push('parent=' + parInfo);
            log.push('children=' + diag.join(' | '));
            // Пробуем клик на разных уровнях
            var a = wrappers[i].querySelector('a[href]');
            if (a) { a.click(); log.push('clicked=a[href]'); }
            else if (par && par.tagName === 'A') { par.click(); log.push('clicked=parent-a'); }
            else {
              // Пробуем клик на первый child с svelte классом
              var clicked = false;
              for (var c2 = 0; c2 < wrappers[i].children.length; c2++) {
                var ch2 = wrappers[i].children[c2];
                if (ch2.tagName === 'A' || ch2.tagName === 'BUTTON') { ch2.click(); log.push('clicked=child-' + ch2.tagName); clicked = true; break; }
              }
              if (!clicked) {
                wrappers[i].dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
                log.push('clicked=mouseEvent');
              }
            }
            scrollDown(); return {ok:true, method:'wrapper', log:log.join(', ')};
          }
        }
        // Fallback: все a[href] на странице
        var allLinks = document.querySelectorAll('a[href]');
        log.push('allLinks=' + allLinks.length);
        for (var i = 0; i < allLinks.length; i++) {
          var t = allLinks[i].textContent.trim();
          if (t && t.length < 80 && name.length > 2 && t.toLowerCase().indexOf(nameLow) >= 0) {
            var href = allLinks[i].getAttribute('href') || '';
            if (href && href !== '#' && !href.startsWith('javascript')) { allLinks[i].click(); scrollDown(); return {ok:true, method:'any-link', log:log.join(', ')}; }
          }
        }
        scrollDown();
        return {ok:false, method:'notFound', log:log.join(', ')};
      } catch(e) { return {ok:false, method:'error', err:e.message}; }
    })();`
  }

  // WhatsApp Web
  if (url.includes('whatsapp.com')) {
    return `(function() {
      try {
        var name = ${nameJson};
        if (!name) return false;
        var spans = document.querySelectorAll('span[title]');
        for (var i = 0; i < spans.length; i++) {
          if (spans[i].getAttribute('title') === name) {
            var row = spans[i].closest('[data-testid="cell-frame-container"]') || spans[i].closest('[tabindex]') || spans[i].closest('[role="listitem"]');
            if (row) { row.click(); return true; }
          }
        }
        for (var i = 0; i < spans.length; i++) {
          var t = spans[i].getAttribute('title') || '';
          if (t && name.length > 3 && (t.startsWith(name) || name.startsWith(t))) {
            var row = spans[i].closest('[data-testid="cell-frame-container"]') || spans[i].closest('[tabindex]') || spans[i].closest('[role="listitem"]');
            if (row) { row.click(); return true; }
          }
        }
        return false;
      } catch(e) { return false; }
    })();`
  }

  // VK
  if (url.includes('vk.com')) {
    return `(function() {
      try {
        var name = ${nameJson};
        if (!name) return false;
        var els = document.querySelectorAll('.im_dialog_peer, [class*="ConversationHeader__name"], [class*="PeerName"], .ConvoListItem__title');
        for (var i = 0; i < els.length; i++) {
          if (els[i].textContent.trim() === name) {
            var row = els[i].closest('a, li, button, [role="listitem"], .ConvoListItem');
            if (row) { row.click(); return true; }
          }
        }
        return false;
      } catch(e) { return false; }
    })();`
  }

  // Generic fallback
  if (!senderName) return null
  return `(function() {
    try {
      var name = ${nameJson};
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim() === name) {
          var el = walker.currentNode.parentElement.closest('a, li, [role="listitem"], [tabindex]');
          if (el) { el.click(); return true; }
        }
      }
      return false;
    } catch(e) { return false; }
  })();`
}
