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
      try {
        // 1. localStorage — MAX может хранить profile data
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          var val = localStorage.getItem(key);
          if (!val || val.length > 5000) continue;
          try {
            var obj = JSON.parse(val);
            // Ищем объект с именем пользователя
            if (obj && typeof obj === 'object') {
              var name = obj.name || obj.displayName || obj.first_name || obj.firstName;
              if (name && typeof name === 'string' && name.length > 1 && name.length < 60) return name;
              // Вложенный объект user/profile
              var inner = obj.user || obj.profile || obj.me || obj.account;
              if (inner) {
                name = inner.name || inner.displayName || inner.first_name || inner.firstName;
                if (name && typeof name === 'string' && name.length > 1 && name.length < 60) return name;
              }
            }
          } catch(e) {}
        }
        // 2. IndexedDB — перебираем все БД
        var dbs = [];
        try { if (typeof indexedDB.databases === 'function') dbs = await indexedDB.databases(); } catch(e) {}
        for (var d = 0; d < dbs.length; d++) {
          var db;
          try {
            db = await new Promise(function(ok) {
              var r = indexedDB.open(dbs[d].name);
              r.onsuccess = function(){ok(r.result)};
              r.onerror = function(){ok(null)};
              r.onupgradeneeded = function(){r.transaction.abort();ok(null)};
            });
          } catch(e) { continue; }
          if (!db) continue;
          var stores = Array.from(db.objectStoreNames);
          var us = stores.find(function(n){return /user|profile|account|me/i.test(n)});
          if (!us) { db.close(); continue; }
          try {
            var self = await new Promise(function(ok) {
              var tx = db.transaction(us,'readonly');
              var cur = tx.objectStore(us).openCursor();
              cur.onsuccess = function() {
                var c = cur.result;
                if (!c) { ok(null); return; }
                var u = c.value;
                if (u && (u.self || (u.pFlags && u.pFlags.self))) { ok(u); return; }
                c.continue();
              };
              cur.onerror = function(){ok(null)};
            });
            db.close();
            if (self) {
              var fn = self.first_name || self.firstName || self.name || self.displayName || '';
              var ln = self.last_name || self.lastName || '';
              if (fn) return (fn + ' ' + ln).trim();
            }
          } catch(e) { try{db.close();}catch(e2){} }
        }
        // 3. DOM — ищем имя на странице профиля (если открыта)
        var sels = ['[class*="profile"] [class*="name"]','[class*="Profile"] [class*="Name"]','input[name="name"]','input[placeholder*="Имя"]'];
        for (var s = 0; s < sels.length; s++) {
          var el = document.querySelector(sels[s]);
          var t = el ? (el.value || el.textContent || '').trim() : '';
          if (t && t.length > 1 && t.length < 60) return t;
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
