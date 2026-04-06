/**
 * Конфигурации мессенджеров — уникальные настройки для каждого мессенджера.
 *
 * Каждый мессенджер имеет свою DOM-структуру, способы определения
 * имени аккаунта, обогащения сообщений и диагностики.
 *
 * Определение типа мессенджера: по URL страницы.
 */

// ── Определение типа мессенджера по URL ──────────────────────────────────
export function detectMessengerType(url) {
  if (!url) return 'unknown'
  if (url.includes('web.telegram.org')) return 'telegram'
  if (url.includes('web.whatsapp.com')) return 'whatsapp'
  if (url.includes('vk.com')) return 'vk'
  if (url.includes('web.max.ru')) return 'max'
  if (url.includes('viber.com')) return 'viber'
  return 'unknown'
}

// ── Спам-фильтр сообщений ────────────────────────────────────────────────
// v0.79.4: Паттерны из shared/spamPatterns.json (общие для preload + renderer)
import spamPatternsRaw from '../../shared/spamPatterns.json'

// Компилируем regex один раз при загрузке модуля
const SP = {}
for (const [k, v] of Object.entries(spamPatternsRaw)) {
  if (k.startsWith('_')) continue // пропускаем _comment
  try { SP[k] = new RegExp(v, 'i') } catch (e) { console.warn(`[spamPatterns] bad regex ${k}:`, e) }
}

export function isSpamText(text, source) {
  if (!text) return true
  if (SP.time && SP.time.test(text)) return true
  if (SP.date && SP.date.test(text)) return true
  if (SP.weekdays && SP.weekdays.test(text)) return true
  if (SP.statuses && SP.statuses.test(text)) return true
  if (SP.outgoing && SP.outgoing.test(text)) return true
  if (SP.statusSuffix && SP.statusSuffix.test(text)) return true
  if (SP.agoSuffix && SP.agoSuffix.test(text)) return true
  if (SP.agoExact && SP.agoExact.test(text)) return true
  if (SP.calls && SP.calls.test(text)) return true
  if (SP.system && SP.system.test(text)) return true
  // Только для __CC_MSG__ (MutationObserver)
  if (source === 'msg') {
    if (SP.vkMenu && SP.vkMenu.test(text)) return true
    if (SP.vkMenuPartial && SP.vkMenuPartial.test(text) && text.length < 100) return true
    if (SP.whatsappAlt && SP.whatsappAlt.test(text.split(/\s/)[0]) && !/\s/.test(text.trim()) && text.length < 60) return true
  }
  return false
}

// ── Скрипты accountScript (получение имени профиля) ─────────────────────
// Каждый мессенджер — свой способ найти имя аккаунта
export const ACCOUNT_SCRIPTS = {
  telegram: `(function() {
    // v0.85.8: Telegram: user_auth.id → localStorage кэш → peer-title fallback
    var CK = '__cc_account_name';
    // 1. Проверяем кэш (если уже нашли ранее через IndexedDB)
    var cached = localStorage.getItem(CK);
    if (cached && cached.length > 1 && cached.length < 60) return cached;
    // 2. peer-title fallback (быстрый, но может быть неточный)
    var pt = document.querySelector('.peer-title');
    if (pt) return pt.textContent.trim().substring(0, 40);
    return '';
  })()`,

  vk: `(function() {
    // v0.80.2: VK accountScript — полное имя профиля
    try {
      // 1. window.vk — самый надёжный (если есть)
      if (window.vk && window.vk.first_name && window.vk.last_name) return (window.vk.first_name + ' ' + window.vk.last_name).trim();
      if (window.vk && window.vk.name) return window.vk.name;
      // 2. Кнопка профиля → img alt (только имя)
      var btn = document.querySelector('[data-testid="header-profile-menu-button"]');
      var firstName = '';
      if (btn) {
        var title = btn.title || btn.getAttribute('aria-label') || '';
        if (title && title.length > 2 && title.length < 40) firstName = title;
        if (!firstName) { var img = btn.querySelector('img'); if (img && img.alt && img.alt.length > 2) firstName = img.alt.trim(); }
      }
      // 3. Ищем полное имя в chatlist (VK показывает "Совершён вход в аккаунт Имя Фамилия")
      if (firstName) {
        var items = document.querySelectorAll('.ConvoListItem__message, [class*="ConvoListItem__message"]');
        for (var i = 0; i < items.length; i++) {
          var t = (items[i].textContent || '').trim();
          var m = t.match(new RegExp(firstName + '\\\\s+([А-ЯЁA-Z][а-яёa-z]+)'));
          if (m && m[1]) return firstName + ' ' + m[1];
        }
        return firstName;
      }
      // 4. Мета-теги
      var meta = document.querySelector('meta[property="og:title"]');
      if (meta && meta.content) return meta.content.trim().substring(0, 40);
    } catch(e) {}
    return '';
  })()`,

  whatsapp: `(function() {
    // WhatsApp: header-кнопка профиля → нет стандартного API
    // Используем title страницы или drawer профиля
    try {
      var header = document.querySelector('header [data-testid="chatlist-header-profile-btn"]');
      if (header) {
        var img = header.querySelector('img');
        if (img && img.alt) return img.alt.trim();
      }
    } catch(e) {}
    return '';
  })()`,

  max: `(function() {
    // MAX: кнопка профиля или Svelte component
    try {
      var profile = document.querySelector('button.profile, [class*="profile"] [class*="name"]');
      if (profile) return profile.textContent.trim().substring(0, 40);
      var CK = '__cc_account_name';
      var cached = localStorage.getItem(CK);
      if (cached && cached.length > 1) return cached;
    } catch(e) {}
    return '';
  })()`,
}

// ── Скрипты DOM-диагностики ─────────────────────────────────────────────
// Каждый мессенджер — свои селекторы и проверки
export const DOM_SCAN_SCRIPTS = {
  telegram: `(function() {
    var r = { url: location.href, title: document.title, ts: Date.now(), type: 'telegram' };
    try {
      // Папки (горизонтальные и вертикальные)
      r.folders = {};
      r.folders.hasVertical = document.body.classList.contains('has-vertical-folders');
      var tabs = document.querySelectorAll('.tabs-tab, .menu-horizontal-div-item, .folders-sidebar__folder-item');
      r.folders.tabCount = tabs.length;
      r.folders.tabs = [];
      for (var i = 0; i < Math.min(tabs.length, 10); i++) {
        var badge = tabs[i].querySelector('.badge');
        r.folders.tabs.push({ text: (tabs[i].textContent||'').trim().slice(0,30), badge: badge ? (badge.textContent||'').trim() : null });
      }
      // Chatlist + peer-id
      r.chatlist = [];
      var chats = document.querySelectorAll('.chatlist-chat');
      for (var j = 0; j < Math.min(chats.length, 15); j++) {
        var peerId = chats[j].getAttribute('data-peer-id') || '';
        var pTitle = chats[j].querySelector('.peer-title');
        r.chatlist.push({ name: pTitle ? (pTitle.textContent||'').slice(0,25) : '', peerId: peerId.slice(0,15), personal: peerId && !peerId.startsWith('-') });
      }
      // Профиль
      r.profile = {};
      var pt = document.querySelector('.peer-title');
      if (pt) r.profile.peerTitle = (pt.textContent||'').trim().slice(0,40);
    } catch(e) { r.error = e.message; }
    return JSON.stringify(r);
  })()`,

  vk: `(function() {
    var r = { url: location.href, title: document.title, ts: Date.now(), type: 'vk' };
    try {
      // Профиль
      r.profile = {};
      var btn = document.querySelector('[data-testid="header-profile-menu-button"]');
      if (btn) {
        r.profile.href = (btn.href || btn.getAttribute('href') || '').slice(0,60);
        r.profile.title = (btn.title || btn.getAttribute('aria-label') || '').slice(0,40);
        var img = btn.querySelector('img');
        if (img) r.profile.imgAlt = (img.alt || '').slice(0,40);
      }
      try { if (window.vk) { r.profile.vkId = window.vk.id; r.profile.vkName = window.vk.name || ''; } } catch(e2) {}
      // Chatlist (ConvoListItem)
      r.chatlist = [];
      var items = document.querySelectorAll('.ConvoListItem');
      for (var i = 0; i < Math.min(items.length, 10); i++) {
        var titleEl = items[i].querySelector('.ConvoListItem__title, [class*="title"]');
        var msgEl = items[i].querySelector('.ConvoListItem__message, [class*="message"]');
        r.chatlist.push({
          name: titleEl ? (titleEl.textContent||'').trim().slice(0,30) : '',
          msg: msgEl ? (msgEl.textContent||'').trim().slice(0,50) : '',
          selected: items[i].classList.contains('ConvoListItem--selected')
        });
      }
      // Открытый чат
      r.chat = {};
      var header = document.querySelector('.ConvoHeader');
      if (header) { r.chat.header = (header.textContent||'').trim().slice(0,40); }
      var hist = document.querySelector('.ConvoMain__history, .ConvoHistory__flow');
      if (hist) {
        r.chat.historyChildren = hist.children.length;
        // v0.80.7: Диагностика CSS-классов пузырей
        r.chat.bubbles = [];
        var allEls = hist.querySelectorAll('*');
        var seen = {};
        for (var bi = 0; bi < allEls.length && r.chat.bubbles.length < 10; bi++) {
          var bel = allEls[bi];
          var bcls = (typeof bel.className === 'string' ? bel.className : '').trim();
          if (!bcls || bcls.length < 3) continue;
          var key = bcls.split(' ')[0];
          if (seen[key]) continue;
          seen[key] = true;
          var hasOut = /out|Out|own|Own|self|Self|right|Right/i.test(bcls);
          var hasIn = /in\b|In\b|peer|Peer|left|Left/i.test(bcls);
          var txt = (bel.textContent || '').trim().slice(0, 40);
          if (txt.length > 2) {
            r.chat.bubbles.push({ cls: bcls.slice(0, 100), out: hasOut, inp: hasIn, text: txt });
          }
        }
      }
    } catch(e) { r.error = e.message; }
    return JSON.stringify(r);
  })()`,

  whatsapp: `(function() {
    var r = { url: location.href, title: document.title, ts: Date.now(), type: 'whatsapp' };
    try {
      // Sidebar
      r.sidebar = {};
      var side = document.getElementById('side');
      if (side) { r.sidebar.exists = true; r.sidebar.children = side.children.length; }
      var grid = document.querySelector('[role="grid"]');
      if (grid) { r.sidebar.gridChildren = grid.children.length; }
      // Фильтры (Все, Непрочитанное, Избранное, Группы)
      r.filters = [];
      var tabs = document.querySelectorAll('[role="tab"]');
      for (var i = 0; i < tabs.length; i++) {
        r.filters.push({ id: tabs[i].id || '', text: (tabs[i].textContent||'').trim().slice(0,20) });
      }
      // Профиль
      r.profile = {};
      var profBtn = document.querySelector('[data-testid="chatlist-header-profile-btn"]');
      if (profBtn) {
        var img = profBtn.querySelector('img');
        if (img) r.profile.imgAlt = (img.alt||'').slice(0,40);
      }
    } catch(e) { r.error = e.message; }
    return JSON.stringify(r);
  })()`,

  max: `(function() {
    var r = { url: location.href, title: document.title, ts: Date.now(), type: 'max' };
    try {
      // Чаты (Svelte)
      r.chatlist = [];
      var items = document.querySelectorAll('[role="listitem"], [role="presentation"]');
      for (var i = 0; i < Math.min(items.length, 10); i++) {
        r.chatlist.push({ cls: (items[i].className||'').slice(0,60), text: (items[i].textContent||'').trim().slice(0,40) });
      }
      // Профиль
      r.profile = {};
      var prof = document.querySelector('button.profile, [class*="profile"] [class*="name"]');
      if (prof) r.profile.name = (prof.textContent||'').trim().slice(0,40);
      // Chat container
      r.chat = {};
      var hist = document.querySelector('.history, [class*="history"]');
      if (hist) { r.chat.historyChildren = hist.children.length; r.chat.cls = (hist.className||'').slice(0,60); }
    } catch(e) { r.error = e.message; }
    return JSON.stringify(r);
  })()`,

  // Fallback для неизвестных мессенджеров
  unknown: `(function() {
    var r = { url: location.href, title: document.title, ts: Date.now(), type: 'unknown' };
    try {
      r.bodyClass = (document.body.className||'').slice(0,120);
      r.bodyChildren = document.body.children.length;
      r.allImages = document.querySelectorAll('img').length;
      r.allButtons = document.querySelectorAll('button').length;
      r.allInputs = document.querySelectorAll('input, textarea').length;
    } catch(e) { r.error = e.message; }
    return JSON.stringify(r);
  })()`,
}

// ── Скрипты полной диагностики (Хранилище) ──────────────────────────────
export const DIAG_FULL_SCRIPTS = {
  // Общий скрипт — localStorage, cookies, аватарки (одинаков для всех)
  common: `(async function() {
    var r = { url: location.href, title: document.title };
    r.localStorage = {};
    try {
      for (var i = 0; i < Math.min(localStorage.length, 50); i++) {
        var k = localStorage.key(i);
        r.localStorage[k] = (localStorage.getItem(k)||'').substring(0,200);
      }
    } catch(e) { r.localStorageError = e.message; }
    r.cookies = [];
    try { r.cookies = document.cookie.split(';').slice(0,30).map(function(c){ return c.trim().split('=')[0]; }); } catch(e) {}
    r.avatarImages = [];
    try {
      var imgs = document.querySelectorAll('img');
      for (var i = 0; i < imgs.length && i < 20; i++) {
        if (imgs[i].width >= 20 && imgs[i].width <= 80)
          r.avatarImages.push({ src: (imgs[i].src||'').substring(0,200), size: imgs[i].width+'x'+imgs[i].height, cls: (imgs[i].className||'').substring(0,60) });
      }
    } catch(e) {}
    return JSON.stringify(r, null, 2);
  })()`,
}

// ── Конфигурация enrichment (обогащение сообщений) ──────────────────────
// Селекторы для поиска sender и аватарки в chatlist
export const ENRICHMENT_SELECTORS = {
  telegram: {
    chatItem: '.chatlist-chat',
    title: '.peer-title',
    avatar: 'img.avatar-photo, canvas.avatar-photo',
    activeChat: '.chatlist-chat.active',
  },
  vk: {
    chatItem: '.ConvoListItem',
    title: '.ConvoListItem__title, [class*="ConvoListItem__title"]',
    avatar: '.ConvoListItem__avatar img, [class*="ConvoListItem__avatar"] img',
    activeChat: '.ConvoListItem--selected',
    // VK-специфичное: sender в тексте сообщения
    stripSenderFromText: true,
    filterOwnMessages: true,
  },
  whatsapp: {
    chatItem: '[role="row"]',
    title: '[class*="matched-text"], span[title]',
    avatar: 'img[draggable="false"]',
    activeChat: '[aria-selected="true"]',
  },
  max: {
    chatItem: '[role="listitem"], [role="presentation"]',
    title: '[class*="title"]',
    avatar: 'img',
    activeChat: '[class*="active"]',
  },
}
