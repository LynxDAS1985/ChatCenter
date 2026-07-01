// Notification hook для MAX (web.max.ru) — v0.82.0
// Файл инжектится в main world через executeJavaScript (CSP MAX блокирует <script> tag)
// Изменения в этом файле НЕ затрагивают другие мессенджеры (Telegram, VK, WhatsApp)
(function() {
  if (window.__cc_notif_hooked) return;
  window.__cc_notif_hooked = true;
  window.__cc_notif_log = window.__cc_notif_log || []; var _maxLastTitleUnread = 0, _maxRecentTitleGrowTs = 0;
  function _log(status, title, body, tag, icon, reason, enrichedTitle) {
    var e = { ts: Date.now(), status: status, title: title || '', body: (body || '').slice(0, 200), tag: tag || '', reason: reason || '', enrichedTitle: enrichedTitle || '' };
    if (icon) e.hasIcon = true;
    window.__cc_notif_log.push(e);
    if (window.__cc_notif_log.length > 100) window.__cc_notif_log.shift();
  }
  // === MAX ENRICHMENT ===
  // MAX вызывает showNotification("Макс", {body: "текст"}) — title = название приложения
  // Нужно найти sender в sidebar по тексту сообщения
  var _appTitles = /^(ma[xк][cс]?)/i;
  function _findSender(body) {
    if (!body || body.length < 2) return null;
    var slice = body.slice(0, 30);
    try {
      // MAX SvelteKit: .chatlist-chat + .peer-title (аналог Telegram Web K)
      var chats = document.querySelectorAll('.chatlist-chat');
      for (var i = 0; i < chats.length && i < 50; i++) {
        if ((chats[i].textContent || '').indexOf(slice) === -1) continue;
        var pt = chats[i].querySelector('.peer-title');
        var nm = pt ? (pt.textContent || '').trim() : '';
        if (!nm) continue;
        var av = _findAvatarIn(chats[i]);
        return { name: nm, avatar: av };
      }
      // Fallback: wrapper--withActions (Svelte sidebar март 2026)
      var wrappers = document.querySelectorAll('[class*="wrapper--withActions"]');
      for (var j = 0; j < wrappers.length && j < 50; j++) {
        if ((wrappers[j].textContent || '').indexOf(slice) === -1) continue;
        var nameEl = wrappers[j].querySelector('[class*="title" i], [class*="name" i], [class*="peer" i], b, strong');
        var sn = nameEl ? (nameEl.textContent || '').trim() : '';
        if (!sn || sn.length < 2 || sn.length > 60) continue;
        if (sn === body.trim() || body.indexOf(sn) === 0) continue;
        var av2 = _findAvatarIn(wrappers[j]);
        return { name: sn, avatar: av2 };
      }
    } catch(e) {}
    return null;
  }
  function _findAvatarIn(el) {
    try {
      var media = el.querySelector('img[class*="avatar" i], img[class*="photo" i], [class*="avatar" i] img, canvas[class*="avatar" i], canvas, img[src]');
      if (!media) return '';
      if (media.tagName === 'CANVAS' && media.width > 10) { try { return media.toDataURL('image/png'); } catch(e) {} }
      if (media.tagName !== 'IMG' || !media.src) return '';
      if (media.src.startsWith('data:')) return media.src;
      if (media.src.startsWith('http')) return media.src;
      if (media.complete && media.naturalWidth > 10) {
        try {
          var c = document.createElement('canvas');
          c.width = Math.min(media.naturalWidth || media.width || 40, 80);
          c.height = Math.min(media.naturalHeight || media.height || 40, 80);
          c.getContext('2d').drawImage(media, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', 0.7);
        } catch(e2) {}
      }
    } catch(e) {}
    return '';
  }
  function _maxTrackTitleUnread() { var m = String(document.title || '').match(/^(\d{1,3})\s+/), c = m ? (parseInt(m[1], 10) || 0) : 0; if (c > _maxLastTitleUnread) { console.log('__CC_DIAG__max-sidebar-title: ' + JSON.stringify({ prev:_maxLastTitleUnread, next:c, title:document.title||'', ts:Date.now() })); _maxRecentTitleGrowTs = Date.now(); } if (c || _maxLastTitleUnread) _maxLastTitleUnread = c; }
  function _findAvatar(name) {
    if (!name) return '';
    try {
      var items = document.querySelectorAll('[class*="chat" i], [class*="dialog" i], [class*="wrapper" i], li');
      for (var j = 0; j < items.length && j < 100; j++) {
        if ((items[j].textContent || '').indexOf(name) === -1) continue;
        var img = items[j].querySelector('img[src^="http"]');
        if (img && !img.src.includes('emoji') && img.naturalWidth > 10) return img.src;
      }
    } catch(e) {}
    return '';
  }
  function _enrichNotif(title, body, tag, icon) {
    var realTitle = title;
    var realIcon = icon;
    if (!title || _appTitles.test(title.trim())) {
      var sender = _findSender(body);
      if (sender) {
        realTitle = sender.name;
        if (!realIcon && sender.avatar) realIcon = sender.avatar;
      }
    }
    if (!realIcon) realIcon = _findAvatar(realTitle);
    return { title: realTitle, icon: realIcon };
  }
  // === MAX SPAM FILTER ===
  var _spam = /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating|загрузк[аи]|обновлени[ея]|подключени[ея])/i;
  var _maxPhantom = /сообщений\s+пока\s+нет|напишите\s+(сообщение|что[- ]нибудь)|отправьте\s+(этот\s+)?стикер|теперь\s+в\s+max|новые\s+сообщения\s+сегодня|начните\s+общени[ея]|добро\s+пожаловать/i;
  var _editedMark = /^(\d{1,2}:\d{2}\s*)?ред\.?\s*$/i;
  var _outgoing = /^(вы:\s|you:\s)/i;
  var _statusEnd = /\s+(в\s+сети|online|offline|был[аи]?\s+(в\s+сети|недавно|давно))\s*$/i;
  var _sysText = /^(сообщение|пропущенный\s*(вызов|звонок)|входящий\s*(вызов|звонок)|missed\s*call|message)$/i;
  function _isSpam(body) {
    if (!body || !body.trim()) return 'empty';
    var t = body.trim();
    if (_spam.test(t)) return 'system';
    if (_maxPhantom.test(t)) return 'maxPhantom';
    if (_editedMark.test(t)) return 'edited';
    if (_outgoing.test(t)) return 'outgoing';
    if (_statusEnd.test(t)) return 'status';
    if (_sysText.test(t)) return 'sysText';
    return '';
  }
  // === MAX STICKER EXTRACTION ===
  var _stickerSeq = 0;
  function _extractSticker() {
    try {
      var containers = document.querySelectorAll('.history, [class*="history" i]');
      var container = null;
      for (var ci = 0; ci < containers.length; ci++) { if (containers[ci].children.length > 3) { container = containers[ci]; break; } }
      if (!container) return null;
      var msgs = container.children;
      for (var mi = msgs.length - 1; mi >= Math.max(0, msgs.length - 5); mi--) {
        var msg = msgs[mi];
        var emojiEls = msg.querySelectorAll('[class*="emoji" i], [class*="sticker" i], [class*="big" i]');
        for (var ei = 0; ei < emojiEls.length; ei++) {
          var eTxt = (emojiEls[ei].textContent || '').trim();
          if (eTxt && eTxt.length <= 30 && !/[a-zA-Zа-яА-Я0-9]/.test(eTxt)) return { type: 'emoji', content: eTxt };
        }
        var imgs = msg.querySelectorAll('img[src]');
        for (var ii = imgs.length - 1; ii >= 0; ii--) {
          var imgW = imgs[ii].naturalWidth || imgs[ii].width || 0;
          if (imgW > 50 && !imgs[ii].src.includes('sqr_') && !imgs[ii].src.includes('avatar')) return { type: 'image', content: imgs[ii].src };
        }
        var videos = msg.querySelectorAll('video, canvas, [class*="lottie" i]');
        for (var vi = 0; vi < videos.length; vi++) { if ((videos[vi].width || videos[vi].clientWidth || 0) >= 40) return { type: 'animated', content: null }; }
        var textEls = msg.querySelectorAll('[class*="text" i], p, span');
        for (var ti = textEls.length - 1; ti >= 0; ti--) {
          var txt = (textEls[ti].textContent || '').trim();
          if (txt && txt.length >= 1 && txt.length <= 30 && !/[a-zA-Zа-яА-Я0-9]/.test(txt)) return { type: 'emoji', content: txt };
        }
      }
    } catch(e) {}
    return null;
  }
  // === NOTIFICATION OVERRIDE ===
  var _N = window.Notification;
  window.Notification = function(title, opts) {
    try {
      var body = (opts && opts.body) || '';
      var tag = (opts && opts.tag) || '';
      var icon = (opts && opts.icon) || (opts && opts.image) || '';
      var spam = _isSpam(body);
      if (spam === 'empty' && title && !_appTitles.test(title.trim())) {
        var sticker = _extractSticker();
        if (sticker && sticker.content) body = sticker.content + ' #' + (++_stickerSeq);
        else if (sticker) body = '\u{0001F4CE} Стикер #' + (++_stickerSeq);
        spam = '';
      }
      if (spam) { _log('blocked', title, body, tag, icon, spam, ''); console.log('__CC_DIAG__hook-blocked: ' + spam + ' | "' + (body||'').slice(0,30) + '" t="' + (title||'').slice(0,20) + '"'); return; }
      var enriched = _enrichNotif(title, body, tag, icon);
      // v0.83.1: Фильтр своих сообщений — если enriched sender = имя в header активного чата
      // и документ видим (пользователь на вкладке MAX) → вероятно своё сообщение
      var _tb = document.querySelector('.topbar');
      var _tbText = _tb ? (_tb.textContent || '').trim() : '';
      if (enriched.title && _tbText && _tbText.indexOf(enriched.title) >= 0 && !document.hidden) {
        _log('blocked', title, body, tag, icon, 'own-chat', enriched.title);
        console.log('__CC_DIAG__hook-blocked: own-chat | "' + (body||'').slice(0,30) + '" sender="' + (enriched.title||'').slice(0,20) + '"');
        return;
      }
      _log('passed', title, body, tag, icon, '', enriched.title);
      console.log('__CC_NOTIF__' + JSON.stringify({ t: enriched.title || '', b: body, i: enriched.icon || '', g: tag, src: 'max-notification-api' }));
    } catch(e) {}
  };
  window.Notification.permission = 'granted';
  window.Notification.requestPermission = function(cb) { if (cb) cb('granted'); return Promise.resolve('granted'); };
  Object.defineProperty(window.Notification, 'permission', { get: function() { return 'granted'; }, set: function() {} });
  // ServiceWorker showNotification (MAX основной метод)
  try {
    ServiceWorkerRegistration.prototype.showNotification = function(title, opts) {
      try {
        var body = (opts && opts.body) || '';
        var tag = (opts && opts.tag) || '';
        var icon = (opts && opts.icon) || (opts && opts.image) || '';
        var spam = _isSpam(body);
        if (spam === 'empty' && title && !_appTitles.test(title.trim())) {
          var sticker = _extractSticker();
          if (sticker && sticker.content) body = sticker.content + ' #' + (++_stickerSeq);
          else if (sticker) body = '\u{0001F4CE} Стикер #' + (++_stickerSeq);
          spam = '';
        }
        if (spam) { _log('blocked', title, body, tag, icon, spam, ''); console.log('__CC_DIAG__hook-blocked: ' + spam + ' | "' + (body||'').slice(0,30) + '" t="' + (title||'').slice(0,20) + '"'); return Promise.resolve(); }
        var enriched = _enrichNotif(title, body, tag, icon);
        // v0.83.1: Фильтр своих сообщений (аналогично new Notification выше)
        var _tb2 = document.querySelector('.topbar');
        var _tb2Text = _tb2 ? (_tb2.textContent || '').trim() : '';
        if (enriched.title && _tb2Text && _tb2Text.indexOf(enriched.title) >= 0 && !document.hidden) {
          _log('blocked', title, body, tag, icon, 'own-chat', enriched.title);
          console.log('__CC_DIAG__hook-blocked: own-chat | "' + (body||'').slice(0,30) + '" sender="' + (enriched.title||'').slice(0,20) + '"');
          return Promise.resolve();
        }
        _log('passed', title, body, tag, icon, '', enriched.title);
        console.log('__CC_NOTIF__' + JSON.stringify({ t: enriched.title || '', b: body, i: enriched.icon || '', g: tag, src: 'max-sw-showNotification' }));
      } catch(e) {}
      return Promise.resolve();
    };
  } catch(e) {}
  // === BADGE API BLOCK ===
  if (navigator.setAppBadge) { navigator.setAppBadge = function(n) { console.log('__CC_BADGE_BLOCKED__:' + n); return Promise.resolve(); }; }
  if (navigator.clearAppBadge) { navigator.clearAppBadge = function() { return Promise.resolve(); }; }
  // === SERVICE WORKER: РАЗРЕШАЕМ (v1.2.10) ===
  // У MAX единственный путь уведомлений — ServiceWorkerRegistration.showNotification (перехват выше, "MAX основной метод").
  // Раньше здесь SW блокировался и удалялся (register→reject + getRegistrations→unregister). Но без живого SW
  // navigator.serviceWorker.ready не резолвится → MAX не может вызвать showNotification → __CC_NOTIF__ ни разу
  // не приходил → каждое сообщение ловил только костыль по заголовку вкладки. А заголовок MAX считает
  // непрочитанные ЧАТЫ, а не сообщения → второе/третье сообщение в одном чате терялось (баг v1.2.9-).
  // Поэтому SW MAX НЕ трогаем: пусть регистрируется. Тогда наш перехват showNotification срабатывает на КАЖДОЕ
  // сообщение и НЕ даёт показать системное уведомление (оригинал не вызывается). Костыль-заголовок остаётся
  // аварийным fallback'ом (maxTitleFallback.js), как и задумано.
  // Чтобы при живом SW не полезли ФОНОВЫЕ системные уведомления MAX (push при свёрнутом окне) —
  // блокируем только подписку на push, сам SW (кэш/офлайн/foreground showNotification) работает штатно.
  try {
    if (window.PushManager && window.PushManager.prototype && window.PushManager.prototype.subscribe) {
      window.PushManager.prototype.subscribe = function() { try { console.log('__CC_PUSH_BLOCKED__'); } catch(e) {} return Promise.reject(new Error('push blocked')); };
    }
  } catch(e) {}
  // === AUDIO MUTE ===
  var _A = window.Audio;
  window.Audio = function(src) { var a = new _A(src); a.volume = 0; return a; };
  window.Audio.prototype = _A.prototype;
  var _ce = document.createElement.bind(document);
  document.createElement = function(tag) { var el = _ce.apply(document, arguments); if (tag && tag.toLowerCase() === 'audio') { el.volume = 0; el.muted = true; } return el; };
  ['AudioContext','webkitAudioContext'].forEach(function(n) { var _C = window[n]; if (!_C) return; var _g = _C.prototype.createGain; _C.prototype.createGain = function() { var g = _g.call(this); g.gain.value = 0; return g; }; });
  // === SIDEBAR WATCHER === запасной путь: preview + рост unread, не просто изменение текста.
  var _maxLastList = {};
  function _maxSearchState() {
    try {
      var nodes = document.querySelectorAll('input, textarea, [contenteditable="true"], [role="searchbox"]');
      for (var i = 0; i < nodes.length && i < 40; i++) {
        var n = nodes[i], value = ((n.value !== undefined ? n.value : n.textContent) || '').replace(/\s+/g, ' ').trim();
        if (!value) continue;
        var style = window.getComputedStyle ? window.getComputedStyle(n) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) continue;
        var ph = ((n.getAttribute && (n.getAttribute('placeholder') || n.getAttribute('aria-label') || n.getAttribute('data-placeholder'))) || '').toLowerCase(), role = ((n.getAttribute && n.getAttribute('role')) || '').toLowerCase(), box = n.getBoundingClientRect ? n.getBoundingClientRect() : null;
        if (box && (box.width < 20 || box.height < 10)) continue;
        var leftSide = !box || box.left < Math.max(520, window.innerWidth * 0.45), looksSearch = role === 'searchbox' || /search|поиск|найти/.test(ph) || leftSide;
        if (looksSearch) return { active: true, value: value.slice(0, 40) };
      }
    } catch(e) {} return { active: false, value: '' };
  }
  function _maxUnreadInfo(row) {
    var best = 0;
    try { var nodes = [row].concat(Array.prototype.slice.call(row.querySelectorAll('span, div, p, [class*="badge" i], [class*="counter" i], [class*="unread" i]')));
      for (var i = 0; i < nodes.length && i < 80; i++) { var n = nodes[i], c = (typeof n.className === 'string' ? n.className : ''), t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (/badge|counter|unread|indicator/i.test(c) && /^\d{1,3}$/.test(t)) best = Math.max(best, parseInt(t, 10) || 0);
        else if (/badge|unread|indicator/i.test(c) && !t) best = Math.max(best, 1);
      } } catch(e) {}
    return best;
  }
  function _maxRowInfo(row) {
    var leaves = row.querySelectorAll('span, div, p'), sender = '', body = '';
    for (var i = 0; i < leaves.length; i++) {
      var n = leaves[i]; if (n.children && n.children.length > 2) continue;
      var t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 2 || t.length > 200) continue;
      var c = (typeof n.className === 'string' ? n.className : '');
      if (/badge|indicator|meta|counter/i.test(c)) continue;
      if (!sender && /title|name/i.test(c)) { sender = t; continue; }
      if (/title|name/i.test(c)) continue;
      if (!body && /text|message|preview/i.test(c) && t !== sender && !/^\d{1,4}$/.test(t)) body = t;
    }
    return { sender: sender, body: body, unread: _maxUnreadInfo(row) };
  }
  function _maxScanList(root, emit) { _maxTrackTitleUnread(); var search = _maxSearchState();
    if (search.active && emit) { console.log('__CC_DIAG__max-sidebar: search active skip emit | value="' + search.value + '"'); emit = false; }
    var rows = root.querySelectorAll('[class*="wrapper--withActions"], [role="listitem"], [role="presentation"]'); for (var i = 0; i < rows.length && i < 60; i++) {
      var info = _maxRowInfo(rows[i]);
      if (!info.sender || !info.body || info.body === info.sender) continue;
      if (_isSpam(info.body)) continue;
      var prev = _maxLastList[info.sender], prevBody = (prev && typeof prev === 'object') ? prev.body : prev, prevUnread = (prev && typeof prev === 'object') ? (prev.unread || 0) : 0;
      var firstSeen = (prev === undefined), unreadIncreased = info.unread > prevUnread, bodyChanged = info.body !== prevBody, freshTitleMs = Date.now() - _maxRecentTitleGrowTs;
      if (!bodyChanged && !unreadIncreased) continue;
      _maxLastList[info.sender] = { body: info.body, unread: info.unread };
      var titleCorrelatedFirst = firstSeen && unreadIncreased && freshTitleMs < 3000, stableUnreadBodyChanged = !firstSeen && bodyChanged && info.unread > 0 && freshTitleMs < 3000, shouldShow = unreadIncreased || stableUnreadBodyChanged, action = (!emit ? 'skip-emit-false' : (firstSeen && !titleCorrelatedFirst) ? 'skip-first-seen' : !shouldShow ? 'skip-no-confirmed-unread-change' : stableUnreadBodyChanged ? 'show-stable-unread-body' : 'show');
      console.log('__CC_DIAG__max-sidebar-decision: ' + JSON.stringify({ action:action, sender:info.sender, body:info.body, prevBody:prevBody||'', unread:info.unread, prevUnread:prevUnread, firstSeen:firstSeen, bodyChanged:bodyChanged, unreadIncreased:unreadIncreased, stableUnreadBodyChanged:stableUnreadBodyChanged, freshTitleMs:freshTitleMs, emit:!!emit, search:search, title:document.title||'', url:location.href||'', ts:Date.now() }));
      if ((firstSeen && !titleCorrelatedFirst) || !emit) continue; if (titleCorrelatedFirst) console.log('__CC_DIAG__max-sidebar: title-correlated first unread | sender="' + info.sender + '" unread=' + info.unread + ' body="' + info.body + '"');
      if (!shouldShow) { console.log('__CC_DIAG__max-sidebar: skip no confirmed unread change | sender="' + info.sender + '" unread=' + info.unread + ' prev=' + prevUnread + ' body="' + info.body + '" prevBody="' + (prevBody || '') + '" freshTitleMs=' + freshTitleMs); continue; }
      var icon = _findAvatarIn(rows[i]);
      _log('passed', info.sender, info.body, '', icon, '', info.sender);
      console.log('__CC_NOTIF__' + JSON.stringify({ t: info.sender, b: info.body, i: icon || '', g: '', src: 'max-sidebar', u: info.unread }));
    }
  }
  setTimeout(function() {
    function _root() { return document.querySelector('[class*="scrollListContent" i]') || document.querySelector('nav, aside, [class*="sidebar" i]') || document.body; }
    try { _maxScanList(_root(), false); } catch(e) {}              // первичная заливка _maxLastList без уведомлений
    var _dt = 0;
    try {
      new MutationObserver(function() { clearTimeout(_dt); _dt = setTimeout(function() { try { _maxScanList(_root(), true); } catch(e) {} }, 350); }).observe(document.body, { childList: true, subtree: true, characterData: true });
      console.log('__CC_DIAG__max-sidebar: observer attached');
    } catch(e) {}
  }, 8000);
  console.log('__CC_NOTIF_HOOK_OK__');
})()
