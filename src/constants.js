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
      // v1.2.282: сборка мини-аватара своего аккаунта из stripped_thumb (Telegram кладёт крошечную
      // копию фото в запись self в IndexedDB — на экране фото нет, а тут есть). Заголовок JPEG и место
      // размеров (160/162) сгенерированы проверенным скриптом; аватар квадратный, порядок ш/в не важен.
      var __ccHdr = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACgcHiMeGSgjISMtKygwPGRBPDc3PHtYXUlkkYCZlo+AjIqgtObDoKrarYqMyP/L2u71////m8H////6/+b9//j/2wBDASstLTw1PHZBQXb4pYyl+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj/wAARCAAAAAADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwA=';
      function __ccStrip(u8){ try {
        if(!u8||u8.length<3||u8[0]!==1) return null;
        var hb=atob(__ccHdr), h=new Uint8Array(hb.length); for(var i=0;i<hb.length;i++) h[i]=hb.charCodeAt(i);
        h[164]=u8[2]; h[166]=u8[1]; // v1.2.284: высота на 164, ширина на 166 (SOF0 после 2 таблиц качества)
        var body=u8.subarray(3), out=new Uint8Array(h.length+body.length+2);
        out.set(h,0); out.set(body,h.length); out[out.length-2]=255; out[out.length-1]=217;
        var bin=''; for(var j=0;j<out.length;j++) bin+=String.fromCharCode(out[j]);
        return 'data:image/jpeg;base64,'+btoa(bin);
      } catch(e){ return null; } }
      function __ccToU8(v){ try {
        if(!v) return null;
        if(v instanceof Uint8Array) return v;
        if(v instanceof ArrayBuffer) return new Uint8Array(v);
        if(v.buffer instanceof ArrayBuffer) return new Uint8Array(v.buffer);
        if(Array.isArray(v)) return Uint8Array.from(v);
        return null;
      } catch(e){ return null; } }
      try {
        // v1.2.285: одноразовый БЕЗОПАСНЫЙ разведчик меню (для будущего чёткого фото). Жмёт ТОЛЬКО
        // кнопку-гамбургер (открыть→закрыть — безвредно), читает названия пунктов и закрывает той же
        // кнопкой. Пункты меню (Выйти/Новая группа) НЕ жмёт. 1 раз. Результат → '__cc_avatar_diag'.
        try {
          if (!localStorage.getItem('__cc_tg_menu_scanned')) {
            var __burger = document.querySelector('.sidebar-header .btn-menu-toggle, button.btn-menu-toggle, #sidebar-left .btn-menu-toggle, .sidebar-header button.btn-icon');
            if (__burger) {
              localStorage.setItem('__cc_tg_menu_scanned', '1');
              __burger.click();
              setTimeout(function () {
                try {
                  var its = document.querySelectorAll('.btn-menu-item, .btn-menu .rp, [role="menuitem"], [class*="menu" i] [class*="item" i]');
                  var d = [];
                  for (var q = 0; q < its.length && d.length < 14; q++) {
                    var el = its[q], ic = el.querySelector('[class*="tgico" i], [class*="icon" i]');
                    d.push((el.textContent || '').trim().slice(0, 18) + '|' + (((ic && ic.className) || '') + '').slice(0, 30));
                  }
                  localStorage.setItem('__cc_avatar_diag', 'tgmenu(' + its.length + ')=' + d.join(' ;; '));
                } catch (e) {}
                try { __burger.click(); } catch (e) {} // закрыть меню тем же гамбургером (надёжно)
              }, 700);
            }
          }
        } catch (e) {}
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
              // v1.2.282: мини-аватар из stripped_thumb записи self → карман '__cc_account_avatar'
              // (значок читает его). Не вышло — кладём ключи photo в диаг-карман для прицельной доводки.
              try {
                var ph = self.photo || self.userProfilePhoto || null;
                var raw = ph && (ph.stripped_thumb || ph.strippedThumb || ph.stripped_thumb_bytes || ph.strippedBytes);
                var dj = __ccStrip(__ccToU8(raw));
                if (dj) localStorage.setItem('__cc_account_avatar', dj);
                else localStorage.setItem('__cc_avatar_diag', 'photoKeys=' + (ph ? Object.keys(ph).join(',') : 'no-photo') + ' selfKeys=' + Object.keys(self).slice(0,15).join(','));
              } catch(e) {}
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
    url: 'https://vk.ru/im', // v1.2.134: основной адрес ВК — vk.ru (vk.com редиректил сюда же)
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
      var CK = '__cc_account_name', AK = '__cc_account_avatar', TK = '__cc_avatar_tried';
      function send(n) { console.log('__CC_ACCOUNT__' + n); localStorage.setItem(CK, n); }
      var cached = localStorage.getItem(CK);
      // v1.2.282: заходим в настройки, если нет ИМЕНИ ИЛИ ещё не пробовали снять АВАТАР (он только там)
      // v1.2.439: флаг «уже пробовали» теперь с ДАТОЙ. По доке MDN у localStorage нет срока годности,
      // поэтому прежний вечный TK='1' НАВСЕГДА запрещал повтор: если первая съёмка не удалась (фото
      // не сохранилось), аватарка не появлялась НИКОГДА. Реальный случай 2026-09-09: у МАКСа имя
      // есть, TK стоит, а __cc_account_avatar пуст. Теперь: фото есть → не трогаем; фото нет →
      // пробуем снова, но не чаще раза в СУТКИ (старое TK='1' датой не является → одна попытка будет).
      var today = new Date().toISOString().slice(0, 10);
      if (cached && cached.length > 1 && cached.length < 60 && (localStorage.getItem(AK) || localStorage.getItem(TK) === today)) return cached;
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
            // v1.2.282: на экране настроек виден СВОЙ аватар — снимаем в base64 (готовый data: берём как есть,
            // иначе перезагрузка с crossOrigin от «испачканного» холста). TK='1' — чтобы не заходить каждый раз.
            try {
              localStorage.setItem(TK, today);  // v1.2.439: дата, а не '1' — повтор возможен на следующий день
              var av = document.querySelector('button.profile img.avatarImage, [class*="profile" i] img.avatarImage, img.avatarImage');
              if (av && av.src) {
                if (av.src.indexOf('data:image') === 0) { localStorage.setItem(AK, av.src); }
                else {
                  var im = new Image(); im.crossOrigin = 'anonymous';
                  im.onload = function(){ try { var c=document.createElement('canvas'); c.width=64;c.height=64; c.getContext('2d').drawImage(im,0,0,64,64); localStorage.setItem(AK, c.toDataURL('image/jpeg',0.85)); } catch(e){} };
                  im.src = av.src;
                }
              }
            } catch(e) {}
            history.back();
            window.__cc_extracting = false;
          }, 3000);
        }, 500);
      }
      return cached || null;
    })()`
  },
  // v1.2.321: Ozon-кабинет (сообщения покупателей) в каталоге «Добавить → веб». Открывается в
  // строгом режиме сессии (v1.2.320: реальный UA + сохранённый Service Worker — иначе антибот Ozon
  // блокирует встроенное окно). isDefault:false — в каталоге, но НЕ активная вкладка по умолчанию.
  // accountScript НЕ задаём: точный DOM Ozon не подтверждён (не гадаем). Хук/уведомления — отдельный шаг.
  {
    id: 'ozon',
    name: 'Ozon',
    url: 'https://seller.ozon.ru/app/messenger',
    color: '#005BFF',
    partition: 'persist:ozon',
    emoji: '📦',
    isDefault: false
  }
]

// Мессенджеры для быстрого добавления — только те, для которых настроен мониторинг
export const POPULAR_MESSENGERS = [
  { name: 'Telegram',  url: 'https://web.telegram.org/k/', color: '#2AABEE', emoji: '✈️' },
  { name: 'WhatsApp',  url: 'https://web.whatsapp.com/',    color: '#25D366', emoji: '💬' },
  { name: 'ВКонтакте', url: 'https://vk.ru/im',            color: '#4C75A3', emoji: '🔵' },
  { name: 'Макс',      url: 'https://web.max.ru/',          color: '#2688EB', emoji: '💎' },
]

export const PRESET_COLORS = [
  '#2AABEE', '#25D366', '#4C75A3', '#FF5722',
  '#9C27B0', '#FF9800', '#00BCD4', '#E91E63'
]

export const PRESET_EMOJIS = ['💬', '📱', '🌐', '📧', '💼', '📨', '🔔', '🌟', '💡', '🎯', '🛒', '🏪']
