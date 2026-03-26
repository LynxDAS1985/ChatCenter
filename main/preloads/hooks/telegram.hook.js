// Notification hook для Telegram Web — v0.82.0
// Файл инжектится в main world через <script> tag (preload) или executeJavaScript (App.jsx fallback)
// Изменения в этом файле НЕ затрагивают другие мессенджеры (MAX, VK, WhatsApp)
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
  // === TELEGRAM ENRICHMENT ===
  // Telegram Web K передаёт имя отправителя в title Notification — enrichment НЕ нужен
  // Аватарка: ищем в .chatlist-chat по имени
  function _findAvatar(name) {
    if (!name) return '';
    try {
      var chats = document.querySelectorAll('.chatlist-chat');
      for (var i = 0; i < chats.length && i < 50; i++) {
        if ((chats[i].textContent || '').indexOf(name) === -1) continue;
        var img = chats[i].querySelector('img.avatar-photo, [class*="avatar"] img');
        if (img && img.src && img.src.startsWith('http') && img.naturalWidth > 10) return img.src;
        var cvs = chats[i].querySelector('canvas.avatar-photo');
        if (cvs && cvs.width > 10) { try { return cvs.toDataURL('image/png'); } catch(e) {} }
      }
    } catch(e) {}
    return '';
  }
  // === TELEGRAM SPAM FILTER ===
  var _spam = /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating)/i;
  var _outgoing = /^(вы:\s|you:\s)/i;
  var _statusEnd = /\s+(в\s+сети|online|offline|был[аи]?\s+(в\s+сети|недавно|давно))\s*$/i;
  var _sysText = /^(сообщение|пропущенный\s*(вызов|звонок)|входящий\s*(вызов|звонок)|missed\s*call|message)$/i;
  function _isSpam(body) {
    if (!body || body.length < 2) return 'empty';
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
      if (spam) { _log('blocked', title, body, tag, icon, spam, ''); return; }
      // Telegram передаёт имя в title — enrichment не нужен, только аватарка
      if (!icon) icon = _findAvatar(title);
      _log('passed', title, body, tag, icon, '', title);
      console.log('__CC_NOTIF__' + JSON.stringify({ t: title || '', b: body, i: icon, g: tag }));
    } catch(e) {}
  };
  window.Notification.permission = 'granted';
  window.Notification.requestPermission = function(cb) { if (cb) cb('granted'); return Promise.resolve('granted'); };
  Object.defineProperty(window.Notification, 'permission', { get: function() { return 'granted'; }, set: function() {} });
  // ServiceWorker showNotification (Telegram тоже может использовать)
  try {
    ServiceWorkerRegistration.prototype.showNotification = function(title, opts) {
      try {
        var body = (opts && opts.body) || '';
        var tag = (opts && opts.tag) || '';
        var icon = (opts && opts.icon) || (opts && opts.image) || '';
        var spam = _isSpam(body);
        if (spam) { _log('blocked', title, body, tag, icon, spam, ''); return Promise.resolve(); }
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
  // === SERVICE WORKER BLOCK ===
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
  ['AudioContext','webkitAudioContext'].forEach(function(name) { var _C = window[name]; if (!_C) return; var _g = _C.prototype.createGain; _C.prototype.createGain = function() { var g = _g.call(this); g.gain.value = 0; return g; }; });
  console.log('__CC_NOTIF_HOOK_OK__');
})()
