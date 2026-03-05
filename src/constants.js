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
                if (u && ((u.pFlags && u.pFlags.self) || u.self === true)) { ok(u); return; }
                c.continue();
              };
              cur.onerror = function(){ok(null)};
            });
            db.close();
            if (self) {
              var fn = self.first_name || self.firstName || '';
              var ln = self.last_name || self.lastName || '';
              if (fn) return (fn + ' ' + ln).trim();
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
      const sels = ['[data-testid="profile-details-header-name"]','[data-testid="user-preferred-name"]'];
      for (const s of sels) { const t = document.querySelector(s)?.textContent?.trim(); if (t && t.length < 60) return t; }
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
    accountScript: `(async () => {
      function tryName(o) {
        if (!o || typeof o !== 'object') return null;
        var n = o.name || o.displayName || o.first_name || o.firstName || o.nick || o.nickname || o.login;
        if (n && typeof n === 'string' && n.length > 1 && n.length < 60) return n;
        return null;
      }
      function scanStorage(st) {
        for (var i = 0; i < st.length; i++) {
          var key = st.key(i); var val = st.getItem(key);
          if (!val || val.length > 10000) continue;
          try {
            var obj = JSON.parse(val);
            var n = tryName(obj); if (n) return n;
            if (obj && typeof obj === 'object') {
              var keys = ['user','profile','me','account','self','data','info','currentUser'];
              for (var k = 0; k < keys.length; k++) { n = tryName(obj[keys[k]]); if (n) return n; }
            }
          } catch(e) {}
        }
        return null;
      }
      try {
        // 1. localStorage
        var r = scanStorage(localStorage); if (r) return r;
        // 2. sessionStorage
        r = scanStorage(sessionStorage); if (r) return r;
        // 3. Cookies — ищем имя в cookie
        try {
          var cookies = document.cookie.split(';');
          for (var c = 0; c < cookies.length; c++) {
            var parts = cookies[c].trim().split('=');
            if (/user|name|profile|nick/i.test(parts[0])) {
              var cv = decodeURIComponent(parts.slice(1).join('='));
              if (cv.startsWith('{')) { var n = tryName(JSON.parse(cv)); if (n) return n; }
              else if (cv.length > 1 && cv.length < 60 && !/^[0-9a-f-]+$/i.test(cv)) return cv;
            }
          }
        } catch(e) {}
        // 4. fetch API — пробуем типовые endpoints (выполняется с cookies сессии MAX)
        var endpoints = ['/api/me','/api/profile','/api/user','/api/v1/me','/api/v1/account'];
        for (var ep = 0; ep < endpoints.length; ep++) {
          try {
            var resp = await fetch(endpoints[ep], {credentials:'include'});
            if (resp.ok) {
              var data = await resp.json();
              var n = tryName(data); if (n) return n;
              if (data.result) { n = tryName(data.result); if (n) return n; }
              if (data.data) { n = tryName(data.data); if (n) return n; }
            }
          } catch(e) {}
        }
        // 5. DOM — навигация профиля (кнопка "Профиль" может иметь aria-label/title)
        var navSels = [
          'a[href*="profile"]','a[href*="settings"]','button[aria-label*="рофил"]',
          '[class*="profile"] [class*="name"]','[class*="Profile"] [class*="Name"]',
          'nav [class*="avatar"] + *','aside [class*="avatar"] + *',
          '[class*="sidebar"] [class*="user"]','[class*="Sidebar"] [class*="User"]'
        ];
        for (var s = 0; s < navSels.length; s++) {
          try {
            var el = document.querySelector(navSels[s]);
            if (!el) continue;
            var t = (el.getAttribute('aria-label') || el.title || el.textContent || '').trim();
            if (t && t.length > 1 && t.length < 60 && !/профил|настрой|setting/i.test(t)) return t;
          } catch(e) {}
        }
      } catch(e) {}
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
