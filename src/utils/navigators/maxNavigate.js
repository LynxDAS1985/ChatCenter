// Навигация к чату в MAX (web.max.ru) на SvelteKit.
// v0.81.6: чаты = div.wrapper--withActions, Svelte on:click НЕ триггерится
// от .click() на wrapper — нужно искать кликабельный child (a[href]/button).
// v0.81.7: диагностика структуры wrapper для отладки.

export function buildMaxScript(senderName) {
  const nameJson = JSON.stringify(senderName || '')
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
      var wrappers = document.querySelectorAll('[class*="wrapper--withActions"]');
      log.push('wrappers=' + wrappers.length);
      for (var i = 0; i < wrappers.length; i++) {
        var t = wrappers[i].textContent.trim();
        if (t && t.toLowerCase().indexOf(nameLow) >= 0) {
          var diag = [];
          for (var c = 0; c < Math.min(wrappers[i].children.length, 8); c++) {
            var ch = wrappers[i].children[c];
            diag.push(ch.tagName + '.' + (typeof ch.className === 'string' ? ch.className : '').slice(0,40).replace(/\\s+/g,'.') + (ch.getAttribute && ch.getAttribute('href') ? '[href=' + ch.getAttribute('href').slice(0,20) + ']' : ''));
          }
          var par = wrappers[i].parentElement;
          var parInfo = par ? par.tagName + '.' + (typeof par.className === 'string' ? par.className : '').slice(0,40).replace(/\\s+/g,'.') : 'none';
          log.push('parent=' + parInfo);
          log.push('children=' + diag.join(' | '));
          var a = wrappers[i].querySelector('a[href]');
          if (a) { a.click(); log.push('clicked=a[href]'); }
          else if (par && par.tagName === 'A') { par.click(); log.push('clicked=parent-a'); }
          else {
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
