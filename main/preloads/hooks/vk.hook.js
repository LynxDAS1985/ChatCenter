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
  // v1.2.124: общие помощники детекта списка чатов. Старый наблюдатель всплывашек
  // «Новое сообщение» (v1.2.58) удалён в v1.2.124 — на новом vk.ru таких всплывашек нет.
  function _cleanToastText(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  // v1.2.122: бережная чистилка для ТЕКСТА сообщения — схлопывает пробелы/табы, но СОХРАНЯЕТ переносы строк (списки/абзацы каналов не превращаются в простыню). Не заменяет _cleanToastText (её использует путь тостов).
  function _cleanMultiline(v) { return String(v || '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
  function _hashToast(v) {
    var h = 0, s = String(v || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return String(Math.abs(h));
  }
  // v1.2.124: собрать текст элемента ВКЛЮЧАЯ эмодзи-картинки. VK рисует эмодзи как <img>,
  // а textContent их не видит -> смайлик терялся. Берём alt у <img> (там сам символ).
  // Нет alt (эмодзи фоном) — пропускаем, хуже прежнего не будет.
  function _vkNodeText(node) {
    try {
      var out = '', kids = (node && node.childNodes) || [];
      for (var i = 0; i < kids.length; i++) {
        var n = kids[i];
        if (n.nodeType === 3) { out += (n.nodeValue || ''); continue; }
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') { out += (n.getAttribute('alt') || ''); continue; } // эмодзи-картинка → символ из alt
        if (n.tagName === 'BR') { out += '\n'; continue; } // v1.2.129: явный перенос строки
        // v1.2.129: блочные теги (абзац/список/цитата) дают перенос вокруг текста — иначе
        // textContent-сбор склеивает абзацы поста в «простыню» (у VK переносы в разметке, не буквами; MDN: textContent их не отражает).
        var inner = _vkNodeText(n);
        if (/^(DIV|P|LI|UL|OL|BLOCKQUOTE|PRE|SECTION|ARTICLE)$/.test(n.tagName || '')) out += '\n' + inner + '\n';
        else out += inner;
      }
      return out;
    } catch(e) { return (node && node.textContent) || ''; }
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
      tx = el ? _cleanMultiline(_vkNodeText(el)) : '';
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
    // v1.2.196: ДИАГНОСТИКА источника счётчика ВК (главный мир → лог доходит), раз в ~15с.
    // Показывает ВСЕ кандидаты «фантомной» 1 + что реально хватает «широкий» поиск счётчика
    // (step3, как в countUnreadVK): значение@класс. Так видно ТОЧНЫЙ источник, без гадания.
    try { var _n = Date.now(); if (!_scanVkList._srcTs || _n - _scanVkList._srcTs > 15000) { _scanVkList._srcTs = _n;
      var _mb='нет',_fb='нет',_gb='нет',_nv=document.querySelectorAll('a,[role="link"]');
      for(var _i=0;_i<_nv.length&&_i<250;_i++){var _tx=(_nv[_i].textContent||'').replace(/\s+/g,' ').trim();
        if(_mb==='нет'&&/мессенджер|messenger/i.test(_tx)){var _m=_tx.match(/(\d+)/);_mb=_m?_m[1]:'0';}
        if(_fb==='нет'&&/друз|friend/i.test(_tx)){var _f=_tx.match(/(\d+)/);_fb=_f?_f[1]:'0';}
        if(_gb==='нет'&&/игр|game/i.test(_tx)){var _g=_tx.match(/(\d+)/);_gb=_g?_g[1]:'0';}}
      var _s3='нет';try{var _im=document.querySelectorAll('a[href*="/im"]');for(var _j=0;_j<_im.length&&_j<20;_j++){var _p=_im[_j].closest('li,div,[class*="Item"],[class*="item"]')||_im[_j];var _cs=_p.querySelectorAll('[class*="ounter"],[class*="badge"],[class*="Badge"],[class*="counter"]');for(var _k=0;_k<_cs.length;_k++){var _nn=parseInt((_cs[_k].textContent||'').trim(),10);if(!isNaN(_nn)&&_nn>0){_s3=_nn+'@'+String(_cs[_k].className||'').slice(0,18);break;}}if(_s3!=='нет')break;}}catch(e){}
      var _tt=(document.title||'').match(/\((\d+)\)/);
      console.log('__CC_DIAG__vk-src titleN='+(_tt?_tt[1]:'нет')+' msgBadge='+_mb+' friends='+_fb+' games='+_gb+' step3='+_s3+' listUnread='+unread);
    } } catch(e){}
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
