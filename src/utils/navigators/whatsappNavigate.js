// Навигация к чату в WhatsApp Web.
// span[title] = имя чата в sidebar. Клик — на role=listitem/row/option
// или ближайший parent с tabindex/data-testid (cell-frame, list-item).

export function buildWhatsAppScript(senderName) {
  const nameJson = JSON.stringify(senderName || '')
  return `(function() {
    try {
      var log = [];
      var name = ${nameJson};
      log.push('name=' + JSON.stringify(name));
      if (!name) return {ok:false, method:'noName', log:log.join(', ')};
      var spans = document.querySelectorAll('#side span[title], [data-testid="chat-list"] span[title]');
      log.push('spans=' + spans.length);
      function waClick(el) {
        el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, view:window}));
        el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
      }
      function findRow(span) {
        var p = span;
        for (var d = 0; d < 10 && p && p !== document.body; d++) {
          p = p.parentElement;
          if (!p) break;
          var r = p.getAttribute('role');
          var tid = p.getAttribute('data-testid') || '';
          if (r === 'listitem' || r === 'row' || r === 'option' || tid.includes('list-item') || tid.includes('cell-frame')) return p;
        }
        return span.closest('[tabindex]') || span.closest('[data-testid]') || span;
      }
      // Exact match
      for (var i = 0; i < spans.length; i++) {
        if (spans[i].getAttribute('title') === name) {
          var path = [];
          var pp = spans[i];
          for (var dd = 0; dd < 8 && pp; dd++) { path.push(pp.tagName + (pp.getAttribute('role')?'[role='+pp.getAttribute('role')+']':'') + (pp.getAttribute('data-testid')?'['+pp.getAttribute('data-testid')+']':'')); pp = pp.parentElement; }
          log.push('found=exact,path=' + path.join('>'));
          var gridcell = spans[i].closest('[role="gridcell"]');
          var row = spans[i].closest('[role="row"]');
          var listitem = spans[i].closest('[role="listitem"]');
          var target = listitem || gridcell || row || findRow(spans[i]);
          log.push('target=' + (target?target.tagName+'[role='+(target.getAttribute('role')||'')+']':'null'));
          if (target) { waClick(target); return {ok:true, method:'exact', log:log.join(', ')}; }
        }
      }
      // Partial match
      for (var i = 0; i < spans.length; i++) {
        var t = spans[i].getAttribute('title') || '';
        if (t && name.length > 3 && (t.startsWith(name) || name.startsWith(t) || t.toLowerCase().indexOf(name.toLowerCase()) >= 0)) {
          var row = findRow(spans[i]);
          log.push('found=partial,matched=' + t.slice(0,30) + ',rowTag=' + (row?row.tagName:'null'));
          if (row) { waClick(row); return {ok:true, method:'partial', matched:t.slice(0,40), log:log.join(', ')}; }
        }
      }
      var samples = [];
      for (var i = 0; i < Math.min(spans.length, 8); i++) samples.push((spans[i].getAttribute('title')||'').slice(0,30));
      log.push('samples=' + JSON.stringify(samples));
      return {ok:false, method:'notFound', log:log.join(', ')};
    } catch(e) { return {ok:false, method:'error', err:e.message}; }
  })();`
}
