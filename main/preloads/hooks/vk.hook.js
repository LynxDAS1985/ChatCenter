// Notification hook для ВКонтакте (vk.com / vk.ru) — v0.82.0
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
  // === BADGE + SW BLOCK ===
  if (navigator.setAppBadge) { navigator.setAppBadge = function(n) { console.log('__CC_BADGE_BLOCKED__:' + n); return Promise.resolve(); }; }
  if (navigator.clearAppBadge) { navigator.clearAppBadge = function() { return Promise.resolve(); }; }
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = function() { console.log('__CC_SW_BLOCKED__'); return Promise.reject(new Error('blocked')); };
    navigator.serviceWorker.getRegistrations().then(function(r) { r.forEach(function(s) { s.unregister(); }); if (r.length) console.log('__CC_SW_UNREGISTERED__:' + r.length); }).catch(function() {});
  }
  // v1.2.58: VK can show its own "New message" toast on profile/feed pages
  // where there is no messenger container or sidebar. This observer must live in
  // the primary VK hook, not only in VK-EXEC fallback, otherwise healthy preload
  // sessions miss the toast completely.
  var _toastSeen = {};
  function _cleanToastText(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  // v1.2.122: бережная чистилка для ТЕКСТА сообщения — схлопывает пробелы/табы, но СОХРАНЯЕТ переносы строк (списки/абзацы каналов не превращаются в простыню). Не заменяет _cleanToastText (её использует путь тостов).
  function _cleanMultiline(v) { return String(v || '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
  function _hashToast(v) {
    var h = 0, s = String(v || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return String(Math.abs(h));
  }
  function _toastLabelOk(v) {
    return /^(\u043d\u043e\u0432\u043e\u0435\s+\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435|new\s+message)$/i.test(_cleanToastText(v));
  }
  function _toastRootOk(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      var lines = (el.innerText || el.textContent || '').split(/\n+/).map(_cleanToastText).filter(Boolean);
      if (!_toastLabelOk(lines[0] || '')) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 180 || r.width > 520 || r.height < 35 || r.height > 180) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity || 1) < 0.2) return false;
      return /fixed|sticky|absolute/.test(cs.position) || r.left < 80 || r.bottom > innerHeight - 220;
    } catch(e) { return false; }
  }
  function _parseVkToast(root) {
    var raw = _cleanToastText(root.innerText || root.textContent || '');
    var lines = (root.innerText || root.textContent || '').split(/\n+/).map(_cleanToastText).filter(Boolean);
    if (!lines.length || !_toastLabelOk(lines[0])) return null;
    var sender = '', text = '';
    if (lines.length >= 3) {
      sender = lines[1];
      text = lines.slice(2).join(' ');
    } else {
      var m = (lines[1] || '').match(/^(.+?)\s+(\u043f\u0440\u0438\u0441\u043b\u0430\u043b[а-я]*\s+\u0432\u0430\u043c\s+.+)$/i);
      if (m) { sender = _cleanToastText(m[1]); text = _cleanToastText(m[2]); }
    }
    sender = sender.replace(/\s+(online|offline|\u0432\s+\u0441\u0435\u0442\u0438|\u043f\u0435\u0447\u0430\u0442\u0430\u0435\u0442).*$/i, '').trim();
    var img = root.querySelector('img[src]');
    var icon = img && !/emoji/i.test(img.src || '') ? img.src : '';
    if (!sender || !text) return { decision: 'block-incomplete-toast', sender: sender, text: text, icon: icon, raw: raw, lines: lines };
    if (sender.length > 80 || text.length > 220) return { decision: 'block-invalid-toast', sender: sender, text: text, icon: icon, raw: raw, lines: lines };
    return { decision: 'emit-toast', sender: sender, text: text, icon: icon, raw: raw, lines: lines };
  }
  function _scanVkToasts(reason, notify) {
    var nodes = document.querySelectorAll('div,section,aside,[role]');
    var emitted = 0, rows = 0;
    for (var i = 0; i < nodes.length && i < 800; i++) {
      var root = nodes[i];
      if (!_toastRootOk(root)) continue;
      rows++;
      var d = _parseVkToast(root);
      if (!d) continue;
      var fp = _hashToast(d.sender + '|' + d.text + '|' + d.icon);
      console.log('__CC_DIAG__vk-toast candidate reason=' + reason + ' decision=' + d.decision + ' sender="' + d.sender.slice(0,80) + '" text="' + d.text.slice(0,160) + '" icon=' + !!d.icon + ' raw="' + String(d.raw || '').slice(0,220) + '"');
      if (!notify || d.decision !== 'emit-toast' || _toastSeen[fp]) continue;
      _toastSeen[fp] = Date.now();
      emitted++;
      console.log('__CC_NOTIF__' + JSON.stringify({ t: d.sender, b: d.text, i: d.icon, g: 'vk-toast:' + fp, src: 'vk-toast' }));
    }
    Object.keys(_toastSeen).forEach(function(k) { if (Date.now() - _toastSeen[k] > 120000) delete _toastSeen[k]; });
    if (rows) console.log('__CC_DIAG__vk-toast scan reason=' + reason + ' rows=' + rows + ' emitted=' + emitted);
  }
  try {
    if (window.__ccVkPrimaryToastObserver) window.__ccVkPrimaryToastObserver.disconnect();
    var _vkToastObserver = new MutationObserver(function() { _scanVkToasts('primary-mutation', true); });
    _vkToastObserver.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
    window.__ccVkPrimaryToastObserver = _vkToastObserver;
    setTimeout(function() { _scanVkToasts('primary-bind', false); }, 500);
    console.log('__CC_DIAG__vk-toast primary-bound version=1.2.58');
  } catch(e) {
    console.log('__CC_DIAG__vk-toast primary-bind-error ' + (e && e.message || e));
  }
  // v1.2.112: детект новых сообщений для нового ВК (vk.ru).
  // По диагностике v1.2.111: строки списка чатов = ".ConvoListItem", непрочитанные помечены
  // классом с "unread". Всплывашка "Новое сообщение" на vk.ru отсутствует (toast-наблюдатель
  // выше даёт 0), поэтому ловим появление непрочитанного прямо в списке чатов.
  // Первый проход — базовая линия (не уведомляем о том, что уже непрочитано); дальше шлём
  // только НОВЫЕ строки (или с изменившимся текстом = новое сообщение в том же чате).
  var _vkPrevUnread = null; // null = базовая линия ещё не снята
  var _vkListTimer = null;
  function _vkRowUnread(row) {
    try {
      if (/unread/i.test(row.className || '')) return true;
      return !!row.querySelector('[class*="unread" i], [class*="Counter" i], [class*="counter" i], [class*="Badge" i]');
    } catch(e) { return false; }
  }
  // v1.2.120: «беззвучный» чат — по значку 🔕. Реальные классы (диагностика v1.2.118):
  // личный чат — ConvoTitle__mutedIcon, канал — ChannelTitle__icon--muted (оба содержат "muted").
  // ЛОВУШКА: элемент есть и у обычных чатов (скрыт), поэтому считаем замьюченным ТОЛЬКО если он ВИДИМ.
  function _vkRowMuted(row) {
    try {
      var m = row.querySelector('[class*="mutedIcon" i], [class*="icon--muted" i]'); // v1.2.123: точные классы (не широкое "muted", ловившее "unmuted")
      if (!m) return false;
      var cs = getComputedStyle(m);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity || 1) < 0.1) return false;
      return m.offsetWidth > 0 || m.offsetHeight > 0; // v1.2.123: убрана лазейка getClientRects (могла дать ложное «виден» у пустого элемента → тихий пропуск)
    } catch(e) { return false; }
  }
  function _vkRowSender(row) {
    try {
      var el = row.querySelector('[class*="ConvoListItem__peer" i], [class*="title" i], [class*="name" i], [class*="peer" i], b, strong');
      var sn = el ? _cleanToastText(el.textContent) : '';
      return (sn && sn.length >= 2 && sn.length <= 80) ? sn : '';
    } catch(e) { return ''; }
  }
  // v1.2.114: по диагностике vkRow — в строке есть спец-элемент превью
  // (ChannelPostPreview / *preview*), а также МУСОР: скрытый для скринридера элемент
  // (vkuiVisuallyHidden = «36 минут назад»), дата (*__date*), счётчик (UnreadCounter).
  // Берём превью; фолбэк — листья строки, но БЕЗ мусорных классов; в конце режем время.
  var _vkJunkCls = /visuallyHidden|Hidden|__date|__time|UnreadCounter|Counter|Badge/i;
  // v1.2.115: срезаем ТОЛЬКО явную метку времени, чтобы не съесть настоящий текст.
  // «· 36м»/«· 2ч» (лишь после разделителя «·»), «36 минут назад» (обязательно со словом
  // «назад»), «12:34». Без «·» и без «назад» одиночные м/ч/с НЕ трогаем — иначе превью
  // «буду через 5 минут» превратилось бы в «буду через».
  var _vkDateTail = /\s*·\s*\d+\s*(минут\w*|секунд\w*|час\w*|дн\w*|нед\w*|мес\w*|[мчсд])\s*$/i;
  var _vkAgoTail = /\s*\d+\s*(минут\w*|секунд\w*|час\w*|дн\w*|нед\w*|мес\w*)\s+назад\s*$/i;
  function _vkRowText(row, sender) {
    var tx = '';
    try {
      var el = row.querySelector('[class*="PostPreview" i], [class*="preview" i], [class*="snippet" i], [class*="ListItem__text" i]');
      tx = el ? _cleanMultiline(el.textContent) : '';
      if (!tx) {
        var kids = row.querySelectorAll('*'), parts = [];
        for (var d = 0; d < kids.length; d++) {
          if (kids[d].children.length) continue;                 // только листья
          if (_vkJunkCls.test(String(kids[d].className || ''))) continue; // без времени/счётчика/скрытого
          var t = _cleanToastText(kids[d].textContent);
          if (t && t !== sender) parts.push(t);
        }
        tx = parts.join(' ');
      }
    } catch(e) {}
    tx = tx.replace(_vkDateTail, '').replace(_vkAgoTail, '').replace(/\s*\d{1,2}:\d{2}\s*$/, '').replace(/\s*·\s*$/, '');
    return tx.trim().slice(0, 4000); // v1.2.122: НЕ схлопываем (переносы сохранены выше); 4000 — только анти-краш, не «мерка» (реальные посты меньше)
  }
  function _vkRowAvatar(row) {
    try { var img = row.querySelector('img[src^="http"]'); return (img && !/emoji/i.test(img.src || '')) ? img.src : ''; }
    catch(e) { return ''; }
  }
  function _scanVkList(reason) {
    var rows = document.querySelectorAll('[class*="ConvoListItem" i]');
    var current = {}, cand = [], unread = 0, muted = 0;
    for (var i = 0; i < rows.length && i < 200; i++) {
      if (!_vkRowUnread(rows[i])) continue;
      unread++;
      if (_vkRowMuted(rows[i])) { muted++; continue; } // v1.2.120: заглушённый чат (🔕) — не уведомляем
      var sender = _vkRowSender(rows[i]);
      var text = _vkRowText(rows[i], sender);
      if (!sender || !text || _isSpam(text)) continue;
      var fp = _hashToast(sender + '|' + text);
      current[fp] = true;
      cand.push({ fp: fp, sender: sender, text: text, icon: _vkRowAvatar(rows[i]) });
    }
    var emitted = 0, sent = {};
    if (_vkPrevUnread) {
      for (var k = 0; k < cand.length; k++) {
        var f = cand[k].fp;
        if (_vkPrevUnread[f] || sent[f]) continue; // уже было непрочитано ИЛИ уже отправлено в этом проходе
        sent[f] = true;
        emitted++;
        console.log('__CC_NOTIF__' + JSON.stringify({ t: cand[k].sender, b: cand[k].text, i: cand[k].icon, g: 'vk-list:' + f, src: 'vk-list' }));
      }
    }
    // v1.2.115: базовую линию фиксируем ТОЛЬКО на непустом списке — иначе при медленной
    // загрузке (первый замер на пустом списке) все уже-непрочитанные при догрузке улетят
    // как «новые» = шторм уведомлений на старте.
    if (rows.length > 0) _vkPrevUnread = current;
    if (reason === 'initial' || emitted > 0) console.log('__CC_DIAG__vk-list reason=' + reason + ' rows=' + rows.length + ' unread=' + unread + ' muted=' + muted + ' emitted=' + emitted);
  }
  function _scheduleVkListScan(reason) {
    if (_vkListTimer) return;
    _vkListTimer = setTimeout(function(){ _vkListTimer = null; _scanVkList(reason); }, 500);
  }
  try {
    if (window.__ccVkListObserver) window.__ccVkListObserver.disconnect();
    var _vkListObs = new MutationObserver(function(){ _scheduleVkListScan('mutation'); });
    _vkListObs.observe(document.documentElement || document.body, { childList: true, subtree: true, characterData: true });
    window.__ccVkListObserver = _vkListObs;
    setTimeout(function(){ _scanVkList('initial'); }, 2500); // базовая линия после загрузки списка
  } catch(e) { console.log('__CC_DIAG__vk-list bind-error ' + (e && e.message || e)); }
  console.log('__CC_NOTIF_HOOK_OK__');
})()
