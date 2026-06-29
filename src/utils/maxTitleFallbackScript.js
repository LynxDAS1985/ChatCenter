// MAX WebView DOM snapshot script for title/unread fallback.

export function buildMaxTitleFallbackScript() {
  return `(function() {
    try {
      function txt(el) { return ((el && el.textContent) || '').replace(/\\s+/g, ' ').trim(); }
      function cls(el) { return (typeof el.className === 'string' ? el.className : ''); }
      function badText(t) {
        if (!t) return true;
        if (t.length > 500) return true;
        return false;
      }
      function leafTexts(root) {
        var out = [];
        if (!root) return out;
        var nodes = root.querySelectorAll('span, div, p, h1, h2, h3');
        for (var i = 0; i < nodes.length && out.length < 80; i++) {
          var n = nodes[i];
          if (n.children && n.children.length > 3) continue;
          var t = txt(n);
          if (!badText(t) && out.indexOf(t) === -1) out.push(t);
        }
        return out;
      }
      function leafItems(root) {
        var out = [];
        if (!root) return out;
        var nodes = root.querySelectorAll('span, div, p, h1, h2, h3');
        for (var i = 0; i < nodes.length && out.length < 80; i++) {
          var n = nodes[i];
          if (n.children && n.children.length > 3) continue;
          var t = txt(n);
          if (badText(t)) continue;
          var r = n.getBoundingClientRect ? n.getBoundingClientRect() : null;
          out.push({
            text: t,
            cls: cls(n),
            left: Math.round(r && r.left || 0),
            top: Math.round(r && r.top || 0),
            width: Math.round(r && r.width || 0),
            height: Math.round(r && r.height || 0),
          });
        }
        return out;
      }
      function imgToDataUrl(img) {
        try {
          if (!img) return '';
          if (img.tagName === 'CANVAS' && img.width > 10) return img.toDataURL('image/png');
          if (img.tagName !== 'IMG' || !img.src) return '';
          if (img.src.startsWith('data:')) return img.src;
          if (img.src.startsWith('http')) return img.src;
          if (img.complete && img.naturalWidth > 5) {
            var c = document.createElement('canvas');
            c.width = Math.min(img.naturalWidth || img.width || 40, 80);
            c.height = Math.min(img.naturalHeight || img.height || 40, 80);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', 0.7);
          }
        } catch(e) {}
        return '';
      }
      function avatarFrom(root) {
        if (!root) return '';
        var direct = Array.prototype.slice.call(root.querySelectorAll('img[class*="avatarImage" i], img[class*="avatar" i], img[class*="photo" i], [class*="avatar" i] img, canvas[class*="avatar" i], canvas, img[src]'));
        for (var i = 0; i < direct.length; i++) {
          var el = direct[i];
          if (el.tagName === 'IMG' && /st\\.max\\.ru\\/emojis/i.test(el.src || '')) continue;
          var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          var w = el.naturalWidth || el.width || Math.round(r && r.width || 0);
          var h = el.naturalHeight || el.height || Math.round(r && r.height || 0);
          if (el.tagName === 'CANVAS' || (w >= 24 && h >= 24 && Math.abs(w - h) <= Math.max(24, Math.round(Math.max(w, h) * 0.35)))) {
            var out = imgToDataUrl(el);
            if (out) return out;
          }
        }
        return '';
      }
      function avatarDiag(root) {
        try {
          if (!root) return 'root=none';
          var imgs = Array.prototype.slice.call(root.querySelectorAll('img')).slice(0, 5);
          var canv = Array.prototype.slice.call(root.querySelectorAll('canvas')).slice(0, 5);
          var first = imgs[0] || canv[0] || null;
          var r = first && first.getBoundingClientRect ? first.getBoundingClientRect() : null;
          var src = first && first.src ? String(first.src).slice(0, 80) : '';
          var c = first ? cls(first).slice(0, 80) : '';
          return 'imgs=' + imgs.length + ' canvas=' + canv.length + ' first=' + (first ? first.tagName : 'none') + ' w=' + (first ? (first.naturalWidth || first.width || Math.round(r && r.width || 0)) : 0) + ' h=' + (first ? (first.naturalHeight || first.height || Math.round(r && r.height || 0)) : 0) + ' src=' + src + ' cls=' + c;
        } catch(e) { return 'diagErr=' + (e.message || String(e)).slice(0, 80); }
      }
      function partsDiag(root) {
        try {
          if (!root) return 'leafs=none';
          var nodes = root.querySelectorAll('span, div, p, h1, h2, h3');
          var out = [];
          for (var i = 0; i < nodes.length && out.length < 8; i++) {
            var n = nodes[i];
            if (n.children && n.children.length > 3) continue;
            var t = txt(n);
            if (!t || t.length > 80) continue;
            var r = n.getBoundingClientRect ? n.getBoundingClientRect() : null;
            out.push(out.length + ':' + t.slice(0, 24).replace(/[|\[\]]/g, ' ') + '@' + Math.round(r && r.left || 0) + ',' + Math.round(r && r.top || 0) + ',' + Math.round(r && r.width || 0) + 'x' + Math.round(r && r.height || 0) + ':' + cls(n).slice(0, 24).replace(/[|\[\]]/g, ' '));
          }
          return 'leafs=' + out.join('~');
        } catch(e) { return 'leafErr=' + (e.message || String(e)).slice(0, 80); }
      }
      function activeHeader() {
        var name = '';
        var sels = ['.topbar .headerWrapper', '.topbar [class*="title" i]', '.topbar [class*="name" i]', '[class*="topbar" i] [class*="title" i]', 'header [class*="title" i]', 'header [class*="name" i]'];
        for (var i = 0; i < sels.length; i++) {
          var el = document.querySelector(sels[i]);
          var t = txt(el).replace(/^окно\\s+чата\\s+с\\s+/i, '').trim();
          if (!badText(t) && t.length >= 2 && t.length <= 80) { name = t; break; }
        }
        if (!name) {
          var tb = document.querySelector('.topbar');
          var kids = tb ? tb.querySelectorAll('div, span, h1, h2, h3') : [];
          for (var k = 0; k < kids.length && k < 20; k++) {
            var kt = txt(kids[k]);
            if (!badText(kt) && kt.length >= 2 && kt.length <= 80) { name = kt; break; }
          }
        }
        return { sender: name, avatar: avatarFrom(document.querySelector('.topbar') || document.querySelector('header')) };
      }
      function rowScore(row) {
        var r = row.getBoundingClientRect ? row.getBoundingClientRect() : null;
        if (!r || r.width < 80 || r.height < 28 || r.height > 140) return -1;
        if (r.left > Math.max(560, window.innerWidth * 0.55)) return -1;
        var score = 0;
        var text = txt(row);
        if (!text || text.length < 2) return -1;
        if (/unread|непрочитан|badge|counter|notification/i.test((row.getAttribute('aria-label') || '') + ' ' + cls(row))) score += 4;
        var nums = row.querySelectorAll('span, div');
        for (var i = 0; i < nums.length; i++) {
          var nt = txt(nums[i]);
          if (/^[1-9]\\d{0,3}$/.test(nt)) {
            var nr = nums[i].getBoundingClientRect ? nums[i].getBoundingClientRect() : null;
            if (!nr || (nr.width <= 36 && nr.height <= 28)) score += 3;
          }
        }
        if (row.querySelector('img, canvas')) score += 1;
        return score;
      }
      function sidebarSnapshot() {
        var roots = Array.prototype.slice.call(document.querySelectorAll('nav, aside, [class*="navigation" i], [class*="sidebar" i], [class*="scrollListContent" i]'));
        if (!roots.length) roots = [document.body];
        var rows = [];
        roots.forEach(function(root) {
          rows = rows.concat(Array.prototype.slice.call(root.querySelectorAll('[class*="wrapper--withActions"], [role="listitem"], [role="presentation"], a, button')));
        });
        function cleanAuthor(t) { return String(t || '').replace(/[:：]\\s*$/, '').trim(); }
        function isBadgeItem(it) { return /^[1-9]\\d{0,3}$/.test(it.text) && (it.width <= 36 || /badge|indicator/i.test(it.cls)); }
        function isMetaItem(it) { return /meta/i.test(it.cls); }
        function isTitleItem(it) { return /title|name/i.test(it.cls); }
        function isAuthorItem(it) { return /author/i.test(it.cls); }
        function rowParts(row) {
          var items = leafItems(row);
          var senderItem = null;
          for (var i = 0; i < items.length; i++) {
            if (isTitleItem(items[i]) && items[i].text.length >= 2 && items[i].text.length <= 80) { senderItem = items[i]; break; }
          }
          if (!senderItem) {
            for (var s = 0; s < items.length; s++) {
              if (!isBadgeItem(items[s]) && !isMetaItem(items[s]) && items[s].text.length >= 2 && items[s].text.length <= 80) { senderItem = items[s]; break; }
            }
          }
          var authorItem = null;
          for (var a = 0; a < items.length; a++) {
            if (isAuthorItem(items[a]) && items[a].text.length >= 2 && items[a].text.length <= 80) { authorItem = items[a]; break; }
          }
          var chatTitle = senderItem ? senderItem.text : '';
          var sender = authorItem ? cleanAuthor(authorItem.text) : chatTitle;
          var bodyItem = null;
          for (var b = 0; b < items.length; b++) {
            var it = items[b];
            if (it.text === chatTitle || it.text === sender || it.text === (authorItem && authorItem.text)) continue;
            if (isMetaItem(it) || isBadgeItem(it) || isTitleItem(it) || isAuthorItem(it)) continue;
            if (/badge|indicator|meta|title|name|author/i.test(it.cls)) continue;
            if (!/text|message|preview/i.test(it.cls)) continue;
            if (senderItem && it.top <= senderItem.top + 5) continue;
            if (it.width < 24 || it.height < 10) continue;
            bodyItem = it;
            break;
          }
          var body = bodyItem ? bodyItem.text : '';
          if (!body && /фото|photo/i.test(txt(row))) body = 'Фото';
          return { items: items, sender: sender, chatTag: authorItem ? chatTitle : '', body: body, bodyClass: bodyItem ? bodyItem.cls : '' };
        }
        function rowAttrDiag(row) {
          try {
            var href = row && row.getAttribute ? (row.getAttribute('href') || '') : '';
            var aria = row && row.getAttribute ? (row.getAttribute('aria-label') || row.getAttribute('title') || '') : '';
            var data = [];
            if (row && row.attributes) {
              for (var a = 0; a < row.attributes.length && data.length < 5; a++) {
                var nm = row.attributes[a].name || '';
                if (/data|aria|href|role/i.test(nm)) data.push(nm + '=' + String(row.attributes[a].value || '').slice(0, 24).replace(/[|~]/g, ' '));
              }
            }
            return 'href=' + href.slice(0, 40).replace(/[|~]/g, ' ') + '|aria=' + aria.slice(0, 40).replace(/[|~]/g, ' ') + '|attrs=' + data.join(',');
          } catch(e) { return 'attrErr=' + (e.message || String(e)).slice(0, 40); }
        }
        function rowImageDiag(row) {
          try {
            var imgs = row ? Array.prototype.slice.call(row.querySelectorAll('img')).slice(0, 3) : [];
            var out = [];
            for (var i = 0; i < imgs.length; i++) {
              var im = imgs[i];
              var r = im.getBoundingClientRect ? im.getBoundingClientRect() : null;
              out.push(i + ':' + (im.naturalWidth || im.width || Math.round(r && r.width || 0)) + 'x' + (im.naturalHeight || im.height || Math.round(r && r.height || 0)) + ':' + cls(im).slice(0, 18).replace(/[|~]/g, ' ') + ':' + String(im.src || '').slice(0, 36));
            }
            return 'imgs[' + out.join(',') + ']';
          } catch(e) { return 'imgErr=' + (e.message || String(e)).slice(0, 40); }
        }
        function compactRowDiag(row, sc, idx) {
          var rp = rowParts(row);
          var r = row && row.getBoundingClientRect ? row.getBoundingClientRect() : null;
          return idx + '#s' + sc + '@' + Math.round(r && r.left || 0) + ',' + Math.round(r && r.top || 0) + ',' + Math.round(r && r.width || 0) + 'x' + Math.round(r && r.height || 0) + '|from=' + rp.sender.slice(0, 24).replace(/[|~]/g, ' ') + '|chat=' + rp.chatTag.slice(0, 18).replace(/[|~]/g, ' ') + '|body=' + rp.body.slice(0, 36).replace(/[|~]/g, ' ') + '|bodyCls=' + rp.bodyClass.slice(0, 20).replace(/[|~]/g, ' ') + '|p=' + rp.items.length + '|' + rowImageDiag(row) + '|' + rowAttrDiag(row);
        }
        var best = null, bestScore = -1;
        var candidates = [];
        var scored = 0;
        for (var i = 0; i < rows.length && i < 400; i++) {
          var sc = rowScore(rows[i]);
          if (sc >= 0) scored++;
          if (sc > bestScore) { best = rows[i]; bestScore = sc; }
          if (sc >= 3) candidates.push({ row: rows[i], score: sc, idx: i });
        }
        if (!best || bestScore < 3) return null;
        var info = rowParts(best);
        var body = info.body;
        if (!body || badText(body)) return null;
        var avatar = avatarFrom(best);
        candidates.sort(function(a, b) {
          if (b.score !== a.score) return b.score - a.score;
          var ar = a.row.getBoundingClientRect ? a.row.getBoundingClientRect() : null;
          var br = b.row.getBoundingClientRect ? b.row.getBoundingClientRect() : null;
          return Math.round((ar && ar.top) || 0) - Math.round((br && br.top) || 0);
        });
        var topDiag = [];
        for (var d = 0; d < candidates.length && d < 10; d++) topDiag.push(compactRowDiag(candidates[d].row, candidates[d].score, candidates[d].idx));
        return { text: body, sender: info.sender, chatTag: info.chatTag, avatar: avatar, source: 'max-title-sidebar', score: bestScore, diag: 'rows=' + rows.length + ' scored=' + scored + ' cand=' + candidates.length + ' selectedText=' + body.slice(0, 80).replace(/[|~]/g, ' ') + ' selectedSender=' + info.sender.slice(0, 80).replace(/[|~]/g, ' ') + ' chatTag=' + info.chatTag.slice(0, 80).replace(/[|~]/g, ' ') + ' bodyClass=' + info.bodyClass.slice(0, 60).replace(/[|~]/g, ' ') + ' chosenLeafs=' + partsDiag(best) + ' topRows=' + topDiag.join('~') + ' chosenAvatar=' + (!!avatar) + ' ' + avatarDiag(best) };
      }
      function activeChatSnapshot() {
        return null;
      }
      var result = sidebarSnapshot();
      return JSON.stringify(result || {});
    } catch(e) {
      return JSON.stringify({ error: e.message || String(e) });
    }
  })()`;
}

