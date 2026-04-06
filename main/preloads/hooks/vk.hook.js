// Notification hook для ВКонтакте (vk.com) — v0.82.0
// Файл инжектится в main world через <script> tag (preload)
// Изменения в этом файле НЕ затрагивают другие мессенджеры (Telegram, MAX, WhatsApp)
// ВАЖНО: VK НЕ использует Notification API для сообщений (только для online-статусов)
// Уведомления VK приходят через chatObserver (addedNodes) и unread-count
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
  // === VK ENRICHMENT ===
  // VK title = "ВКонтакте" → ищем sender в ConvoListItem
  var _appTitles = /^(vk|вконтакте|вк)/i;
  function _findSender(body) {
    if (!body || body.length < 2) return null;
    var slice = body.slice(0, 30);
    try {
      var items = document.querySelectorAll('[class*="ConvoListItem" i], [class*="dialog" i], [class*="im_dialog" i], [class*="conversation" i]');
      for (var j = 0; j < items.length && j < 80; j++) {
        if ((items[j].textContent || '').indexOf(slice) === -1) continue;
        var nameEl = items[j].querySelector('[class*="ConvoListItem__peer" i], [class*="title" i], [class*="name" i], b, strong');
        var sn = nameEl ? (nameEl.textContent || '').trim() : '';
        if (!sn || sn.length < 2 || sn.length > 60) continue;
        if (sn === body.trim() || body.indexOf(sn) === 0) continue;
        var img = items[j].querySelector('img[src^="http"]');
        var av = (img && !img.src.includes('emoji')) ? img.src : '';
        return { name: sn, avatar: av };
      }
    } catch(e) {}
    return null;
  }
  function _findAvatar(name) {
    if (!name) return '';
    try {
      var items = document.querySelectorAll('[class*="ConvoListItem" i], [class*="dialog" i]');
      for (var j = 0; j < items.length && j < 50; j++) {
        if ((items[j].textContent || '').indexOf(name) === -1) continue;
        var img = items[j].querySelector('img[src^="http"]');
        if (img && !img.src.includes('emoji')) return img.src;
      }
    } catch(e) {}
    return '';
  }
  function _enrichNotif(title, body, tag, icon) {
    var realTitle = title;
    var realIcon = icon;
    if (!title || _appTitles.test(title.trim())) {
      var sender = _findSender(body);
      if (sender) { realTitle = sender.name; if (!realIcon && sender.avatar) realIcon = sender.avatar; }
    }
    if (!realIcon) realIcon = _findAvatar(realTitle);
    return { title: realTitle, icon: realIcon };
  }
  // === VK SPAM FILTER ===
  // VK шлёт Notification для: online-статусов, своих исходящих ("Вы: ..."), системных
  var _spam = /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating|загрузк[аи]|обновлени[ея]|подключени[ея])/i;
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
      var enriched = _enrichNotif(title, body, tag, icon);
      _log('passed', title, body, tag, icon, '', enriched.title);
      console.log('__CC_NOTIF__' + JSON.stringify({ t: enriched.title || '', b: body, i: enriched.icon, g: tag }));
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
        var enriched = _enrichNotif(title, body, tag, icon);
        _log('passed', title, body, tag, icon, '', enriched.title);
        console.log('__CC_NOTIF__' + JSON.stringify({ t: enriched.title || '', b: body, i: enriched.icon, g: tag }));
      } catch(e) {}
      return Promise.resolve();
    };
  } catch(e) {}
  // === BADGE + SW + AUDIO BLOCK ===
  if (navigator.setAppBadge) { navigator.setAppBadge = function(n) { console.log('__CC_BADGE_BLOCKED__:' + n); return Promise.resolve(); }; }
  if (navigator.clearAppBadge) { navigator.clearAppBadge = function() { return Promise.resolve(); }; }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = function() { console.log('__CC_SW_BLOCKED__'); return Promise.reject(new Error('blocked')); };
    navigator.serviceWorker.getRegistrations().then(function(r) { r.forEach(function(s) { s.unregister(); }); if (r.length) console.log('__CC_SW_UNREGISTERED__:' + r.length); }).catch(function() {});
  }
  var _A = window.Audio;
  window.Audio = function(src) { var a = new _A(src); a.volume = 0; return a; };
  window.Audio.prototype = _A.prototype;
  var _ce = document.createElement.bind(document);
  document.createElement = function(tag) { var el = _ce.apply(document, arguments); if (tag && tag.toLowerCase() === 'audio') { el.volume = 0; el.muted = true; } return el; };
  ['AudioContext','webkitAudioContext'].forEach(function(n) { var _C = window[n]; if (!_C) return; var _g = _C.prototype.createGain; _C.prototype.createGain = function() { var g = _g.call(this); g.gain.value = 0; return g; }; });
  console.log('__CC_NOTIF_HOOK_OK__');
})()
