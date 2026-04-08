// Notification hook для WhatsApp Web — v0.82.0
// Файл инжектится в main world через <script> tag (preload) или executeJavaScript (App.jsx fallback)
// Изменения в этом файле НЕ затрагивают другие мессенджеры (Telegram, MAX, VK)
(function() {
  if (window.__cc_notif_hooked) return;
  window.__cc_notif_hooked = true;
  window.__cc_notif_log = window.__cc_notif_log || [];
  function _log(status, title, body, tag, icon, reason, enrichedTitle) {
    var e = { ts: Date.now(), status: status, title: title || '', body: (body || '').slice(0, 200), tag: tag || '', reason: reason || '', enrichedTitle: enrichedTitle || '' };
    if (icon) e.hasIcon = true;
    window.__cc_notif_log.push(e);
    if (window.__cc_notif_log.length > 100) window.__cc_notif_log.shift();
  }
  // === WHATSAPP ENRICHMENT ===
  // WhatsApp передаёт имя отправителя в title Notification — enrichment НЕ нужен
  // Аватарка: ищем в sidebar по span[title]
  function _findAvatar(name) {
    if (!name) return '';
    try {
      var spans = document.querySelectorAll('span[title]');
      for (var i = 0; i < spans.length && i < 80; i++) {
        if (spans[i].getAttribute('title') !== name) continue;
        var row = spans[i].closest('[data-testid="cell-frame-container"]') || spans[i].closest('[tabindex]');
        if (!row) continue;
        var img = row.querySelector('img[src^="blob:"], img[draggable="false"]');
        if (img && img.src) return img.src;
      }
    } catch(e) {}
    return '';
  }
  // === WHATSAPP SPAM FILTER ===
  var _spam = /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating)/i;
  var _outgoing = /^(вы:\s|you:\s)/i;
  var _statusEnd = /\s+(в\s+сети|online|offline|был[аи]?\s+(в\s+сети|недавно|давно))\s*$/i;
  var _sysText = /^(сообщение|пропущенный\s*(вызов|звонок)|входящий\s*(вызов|звонок)|missed\s*call|message)$/i;
  function _isSpam(body) {
    if (!body || !body.trim()) return 'empty';
    var t = body.trim();
    if (_spam.test(t)) return 'system';
    if (_outgoing.test(t)) return 'outgoing';
    if (_statusEnd.test(t)) return 'status';
    if (_sysText.test(t)) return 'sysText';
    return '';
  }
  // === NOTIFICATION OVERRIDE ===
  var _N = window.Notification;
  window.Notification = function(title, opts) {
    try {
      var body = (opts && opts.body) || '';
      var tag = (opts && opts.tag) || '';
      var icon = (opts && opts.icon) || (opts && opts.image) || (opts && opts.badge) || '';
      var spam = _isSpam(body);
      if (spam) { _log('blocked', title, body, tag, icon, spam, ''); console.log('__CC_DIAG__hook-blocked: ' + spam + ' | "' + (body||'').slice(0,30) + '" t="' + (title||'').slice(0,20) + '"'); return; }
      if (!icon) icon = _findAvatar(title);
      _log('passed', title, body, tag, icon, '', title);
      console.log('__CC_NOTIF__' + JSON.stringify({ t: title || '', b: body, i: icon, g: tag }));
    } catch(e) {}
  };
  window.Notification.permission = 'granted';
  window.Notification.requestPermission = function(cb) { if (cb) cb('granted'); return Promise.resolve('granted'); };
  Object.defineProperty(window.Notification, 'permission', { get: function() { return 'granted'; }, set: function() {} });
  try {
    ServiceWorkerRegistration.prototype.showNotification = function(title, opts) {
      try {
        var body = (opts && opts.body) || '';
        var tag = (opts && opts.tag) || '';
        var icon = (opts && opts.icon) || (opts && opts.image) || '';
        var spam = _isSpam(body);
        if (spam) { _log('blocked', title, body, tag, icon, spam, ''); console.log('__CC_DIAG__hook-blocked: ' + spam + ' | "' + (body||'').slice(0,30) + '" t="' + (title||'').slice(0,20) + '"'); return Promise.resolve(); }
        if (!icon) icon = _findAvatar(title);
        _log('passed', title, body, tag, icon, '', title);
        console.log('__CC_NOTIF__' + JSON.stringify({ t: title || '', b: body, i: icon, g: tag }));
      } catch(e) {}
      return Promise.resolve();
    };
  } catch(e) {}
  // === BADGE API BLOCK ===
  if (navigator.setAppBadge) { navigator.setAppBadge = function(n) { console.log('__CC_BADGE_BLOCKED__:' + n); return Promise.resolve(); }; }
  if (navigator.clearAppBadge) { navigator.clearAppBadge = function() { return Promise.resolve(); }; }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = function() { console.log('__CC_SW_BLOCKED__'); return Promise.reject(new Error('blocked')); };
    navigator.serviceWorker.getRegistrations().then(function(r) { r.forEach(function(s) { s.unregister(); }); if (r.length) console.log('__CC_SW_UNREGISTERED__:' + r.length); }).catch(function() {});
  }
  // === AUDIO MUTE ===
  var _A = window.Audio;
  window.Audio = function(src) { var a = new _A(src); a.volume = 0; return a; };
  window.Audio.prototype = _A.prototype;
  var _ce = document.createElement.bind(document);
  document.createElement = function(tag) { var el = _ce.apply(document, arguments); if (tag && tag.toLowerCase() === 'audio') { el.volume = 0; el.muted = true; } return el; };
  ['AudioContext','webkitAudioContext'].forEach(function(n) { var _C = window[n]; if (!_C) return; var _g = _C.prototype.createGain; _C.prototype.createGain = function() { var g = _g.call(this); g.gain.value = 0; return g; }; });
  // === SIDEBAR WATCHER (v0.86.0) ===
  // WhatsApp не шлёт Notification когда вкладка активна.
  // Следим за sidebar: когда текст последнего сообщения в чате меняется = новое сообщение.
  var _lastSidebarTexts = {};
  var _sidebarReady = false;
  setTimeout(function() {
    _sidebarReady = true;
    // Снимаем snapshot текущего состояния sidebar
    try {
      var rows = document.querySelectorAll('#side [role="row"], #side [role="listitem"], #side [data-testid="cell-frame-container"]');
      for (var i = 0; i < rows.length && i < 30; i++) {
        var nameEl = rows[i].querySelector('span[title]');
        var msgEl = rows[i].querySelector('[data-testid="last-msg-status"] + span, span[title] ~ div span');
        var name = nameEl ? nameEl.getAttribute('title') : '';
        var msg = msgEl ? (msgEl.textContent || '').trim().slice(0, 60) : '';
        if (name) _lastSidebarTexts[name] = msg;
      }
    } catch(e) {}
  }, 8000);

  var _sidebarObserver = null;
  setTimeout(function() {
    var side = document.getElementById('side') || document.querySelector('[data-testid="chat-list"]');
    if (!side) return;
    var _lastEmitTs = 0;
    _sidebarObserver = new MutationObserver(function() {
      if (!_sidebarReady) return;
      var now = Date.now();
      if (now - _lastEmitTs < 2000) return; // debounce 2 сек
      try {
        var rows = side.querySelectorAll('[role="row"], [role="listitem"], [data-testid="cell-frame-container"]');
        for (var i = 0; i < Math.min(rows.length, 15); i++) {
          var nameEl = rows[i].querySelector('span[title]');
          if (!nameEl) continue;
          var chatName = nameEl.getAttribute('title') || '';
          if (!chatName) continue;
          // Ищем badge (зелёный кружок с числом)
          var badge = rows[i].querySelector('[data-testid="icon-unread-count"], [aria-label*="unread"], .unread-count');
          if (!badge) continue; // нет badge = нет непрочитанных
          // Ищем текст последнего сообщения
          var msgSpans = rows[i].querySelectorAll('span[dir], span[class]');
          var lastMsg = '';
          for (var j = msgSpans.length - 1; j >= 0; j--) {
            var t = (msgSpans[j].textContent || '').trim();
            if (t.length >= 2 && t.length <= 200 && t !== chatName) { lastMsg = t; break; }
          }
          if (!lastMsg) continue;
          var prev = _lastSidebarTexts[chatName] || '';
          if (lastMsg !== prev) {
            _lastSidebarTexts[chatName] = lastMsg;
            if (prev) { // prev пустой = первый скан, не новое сообщение
              _lastEmitTs = now;
              console.log('__CC_NOTIF__' + JSON.stringify({ t: chatName, b: lastMsg, i: '', g: '' }));
              console.log('__CC_DIAG__wa-sidebar: new msg from "' + chatName.slice(0,25) + '" text="' + lastMsg.slice(0,30) + '"');
              return; // одно сообщение за цикл
            }
          }
        }
      } catch(e) {}
    });
    _sidebarObserver.observe(side, { childList: true, subtree: true, characterData: true });
    console.log('__CC_DIAG__wa-sidebar: observer attached to #side');
  }, 10000);

  console.log('__CC_NOTIF_HOOK_OK__');
})()
