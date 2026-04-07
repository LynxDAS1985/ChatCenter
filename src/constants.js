// v0.6 — общие константы (мессенджеры, цвета, популярные пресеты)

export const DEFAULT_MESSENGERS = [
  {
    id: 'telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/k/',
    color: '#2AABEE',
    partition: 'persist:telegram',
    emoji: '✈️',
    isDefault: true,
    accountScript: `(async () => {
      try {
        // v0.85.8: Сначала берём ID текущего аккаунта из localStorage (надёжно)
        var selfId = null;
        try {
          var auth = JSON.parse(localStorage.getItem('user_auth') || '{}');
          if (auth.id) selfId = auth.id;
        } catch(e) {}
        console.log('__CC_DIAG__account: selfId=' + selfId);
        var dbs = [];
        try { if (typeof indexedDB.databases === 'function') dbs = await indexedDB.databases(); } catch(e) {}
        if (!dbs || !dbs.length) dbs = [{name:'tweb'},{name:'tweb-0'},{name:'tweb-1'}];
        for (var i = 0; i < dbs.length; i++) {
          var db;
          try {
            db = await new Promise(function(ok) {
              var r = indexedDB.open(dbs[i].name);
              r.onsuccess = function(){ok(r.result)};
              r.onerror = function(){ok(null)};
              r.onupgradeneeded = function(){r.transaction.abort();ok(null)};
            });
          } catch(e) { continue; }
          if (!db) continue;
          var stores = Array.from(db.objectStoreNames);
          var us = stores.find(function(n){return n==='users'||n.includes('user')});
          if (!us) { db.close(); continue; }
          try {
            var self = await new Promise(function(ok) {
              var tx = db.transaction(us,'readonly');
              var cur = tx.objectStore(us).openCursor();
              cur.onsuccess = function() {
                var c = cur.result;
                if (!c) { ok(null); return; }
                var u = c.value;
                // v0.85.8: Ищем по selfId (точный ID) ИЛИ pFlags.self (fallback)
                if (selfId && u && (u.id === selfId || u.id === String(selfId))) { ok(u); return; }
                if (!selfId && u && ((u.pFlags && u.pFlags.self) || u.self === true)) { ok(u); return; }
                c.continue();
              };
              cur.onerror = function(){ok(null)};
            });
            db.close();
            if (self) {
              var fn = self.first_name || self.firstName || '';
              var ln = self.last_name || self.lastName || '';
              var fullName = (fn + ' ' + ln).trim();
              console.log('__CC_DIAG__account: found id=' + self.id + ' name=' + fullName);
              // Сохраняем в localStorage для diagAccount (messengerConfigs.js)
              if (fullName) try { localStorage.setItem('__cc_account_name', fullName); } catch(e) {}
              if (fn) return fullName;
              if (self.name) return self.name;
              if (self.phone) return '+' + String(self.phone).replace(/^\\+/,'');
            }
          } catch(e) { try{db.close();}catch(e2){} }
        }
      } catch(e) {}
      return null;
    })()`
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    color: '#25D366',
    partition: 'persist:whatsapp',
    emoji: '💬',
    isDefault: true,
    accountScript: `(() => {
      // v0.86.0: WhatsApp account — кэш + header img alt + profile drawer + IndexedDB
      var CK = '__cc_account_name';
      var cached = localStorage.getItem(CK);
      // Не кэшировать "WhatsApp" / "WhatsApp Business" — это title страницы, не имя
      if (cached && cached.length > 1 && cached.length < 60 && !/^whatsapp/i.test(cached)) {
        console.log('__CC_DIAG__account: cached=' + cached);
        return cached;
      }
      if (cached && /^whatsapp/i.test(cached)) { try { localStorage.removeItem(CK); } catch(e) {} }
      // 1. Header profile button → img alt (WhatsApp Business показывает имя)
      try {
        var btn = document.querySelector('header [data-testid="chatlist-header-profile-btn"], header [data-icon="default-user"], header img[draggable="false"]');
        if (btn) {
          var img = btn.tagName === 'IMG' ? btn : btn.querySelector('img');
          if (img && img.alt && img.alt.length > 1 && img.alt.length < 60) {
            console.log('__CC_DIAG__account: header-img=' + img.alt);
            try { localStorage.setItem(CK, img.alt); } catch(e) {}
            return img.alt;
          }
        }
      } catch(e) {}
      // 2. Profile drawer (если открыт)
      var sels = ['[data-testid="profile-details-header-name"]','[data-testid="user-preferred-name"]','.drawer-header [role="textbox"]'];
      for (var si = 0; si < sels.length; si++) {
        var el = document.querySelector(sels[si]);
        var t = el ? (el.textContent || '').trim() : '';
        if (t && t.length > 1 && t.length < 60) {
          console.log('__CC_DIAG__account: dom=' + t);
          try { localStorage.setItem(CK, t); } catch(e) {}
          return t;
        }
      }
      // 3. Сканируем header на предмет имени/аватарки
      try {
        var headerImgs = document.querySelectorAll('header img');
        var headerInfo = [];
        for (var hi = 0; hi < Math.min(headerImgs.length, 5); hi++) {
          headerInfo.push('alt="' + (headerImgs[hi].alt||'') + '" src=' + (headerImgs[hi].src||'').slice(0,30));
        }
        console.log('__CC_DIAG__account: headerImgs=' + headerInfo.join(' | '));
      } catch(e) {}
      console.log('__CC_DIAG__account: not found, title=' + (document.title||''));
      return null;
    })()`
  },
  {
    id: 'vk',
    name: 'ВКонтакте',
    url: 'https://vk.com/im',
    color: '#4C75A3',
    partition: 'persist:vk',
    emoji: '🔵',
    isDefault: true,
    accountScript: `(() => {
      const sels = ['.TopNavBtn__title','.header__top--uname','.vkuiSimpleCell__content .vkuiTypography--weight-1'];
      for (const s of sels) { const t = document.querySelector(s)?.textContent?.trim(); if (t && t.length < 60) return t; }
      return null;
    })()`
  },
  {
    id: 'max',
    name: 'Макс',
    url: 'https://web.max.ru/',
    color: '#2688EB',
    partition: 'persist:max',
    emoji: '💎',
    isDefault: true,
    accountScript: `(function() {
      var CK = '__cc_account_name';
      function send(n) { console.log('__CC_ACCOUNT__' + n); localStorage.setItem(CK, n); }
      var cached = localStorage.getItem(CK);
      if (cached && cached.length > 1 && cached.length < 60) return cached;
      if (!window.__cc_extracting) {
        window.__cc_extracting = true;
        setTimeout(function() {
          var btn = document.querySelector('.item.settings button');
          if (!btn) { window.__cc_extracting = false; return; }
          btn.click();
          setTimeout(function() {
            var ni = document.querySelector('input[placeholder="Имя"]');
            if (ni && ni.value.trim().length > 1) { send(ni.value.trim()); }
            else {
              var pc = document.querySelector('button.profile');
              if (pc) { var t = pc.textContent.trim(); var m = t.match(/\\+7\\d{10}/); if(m){ var nm=t.split(m[0])[0].trim(); send(nm.length>1?nm:m[0]); } }
            }
            history.back();
            window.__cc_extracting = false;
          }, 3000);
        }, 500);
      }
      return null;
    })()`
  }
]

// Мессенджеры для быстрого добавления — только те, для которых настроен мониторинг
export const POPULAR_MESSENGERS = [
  { name: 'Telegram',  url: 'https://web.telegram.org/k/', color: '#2AABEE', emoji: '✈️' },
  { name: 'WhatsApp',  url: 'https://web.whatsapp.com/',    color: '#25D366', emoji: '💬' },
  { name: 'ВКонтакте', url: 'https://vk.com/im',           color: '#4C75A3', emoji: '🔵' },
  { name: 'Макс',      url: 'https://web.max.ru/',          color: '#2688EB', emoji: '💎' },
]

export const PRESET_COLORS = [
  '#2AABEE', '#25D366', '#4C75A3', '#FF5722',
  '#9C27B0', '#FF9800', '#00BCD4', '#E91E63'
]

export const PRESET_EMOJIS = ['💬', '📱', '🌐', '📧', '💼', '📨', '🔔', '🌟', '💡', '🎯', '🛒', '🏪']
