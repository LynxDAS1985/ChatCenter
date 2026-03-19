// v0.47.0 — ChatMonitor: enriched addedNodes — имя отправителя + аватарка из DOM активного чата
// Бейдж считает ВСЕ непрочитанные (включая muted), уведомления — только не-muted
// Cooldown 10 сек при запуске, чтобы не слать старые сообщения как новые
const { ipcRenderer } = require('electron')

// ── САМОЕ ПЕРВОЕ: перехват Notification + Audio в main world ────────────────
// <script> tag из preload выполняется в main world (DOM общий между мирами).
// Это происходит ДО скриптов мессенджера → VK/WhatsApp не смогут вызвать
// нативный new Notification() (он заменён на console.log → console-message).
// console.log пересекает context isolation через event 'console-message' на <webview>.
;(function injectNotifHook() {
  try {
    const s = document.createElement('script')
    s.textContent = '(' + function() {
      if (window.__cc_notif_hooked) return
      window.__cc_notif_hooked = true
      // Лог всех Notification для отладки (доступен через контекстное меню вкладки)
      window.__cc_notif_log = window.__cc_notif_log || []
      function _logNotif(status, title, body, tag, icon, reason, enrichedTitle) {
        var entry = { ts: Date.now(), status: status, title: title || '', body: (body || '').slice(0, 200), tag: tag || '', reason: reason || '', enrichedTitle: enrichedTitle || '' }
        if (icon) entry.hasIcon = true
        window.__cc_notif_log.push(entry)
        if (window.__cc_notif_log.length > 100) window.__cc_notif_log.shift()
      }
      // Поиск аватарки по имени отправителя в DOM (fallback когда icon не передан)
      function findAvatar(name) {
        if (!name) return ''
        try {
          // 1. Ищем чат-элемент содержащий имя отправителя
          var items = document.querySelectorAll('[class*="chat" i], [class*="dialog" i], [class*="conversation" i], [class*="item" i], [class*="peer" i], [class*="contact" i], li')
          for (var j = 0; j < items.length && j < 150; j++) {
            var txt = items[j].textContent || ''
            if (txt.indexOf(name) === -1 && !(name.length > 4 && txt.indexOf(name.substring(0, Math.min(name.length, 8))) !== -1)) continue
            // a) img внутри элемента (любой http src, не emoji/sticker)
            var img = items[j].querySelector('img[src^="http"]')
            if (img && img.src && !img.src.includes('emoji') && !img.src.includes('sticker')) return img.src
            // b) элемент с class*="avatar" — img внутри или background-image
            var avEl = items[j].querySelector('[class*="avatar" i], [class*="photo" i]')
            if (avEl) {
              var aImg = avEl.querySelector('img[src^="http"]') || (avEl.tagName === 'IMG' && avEl.src && avEl.src.startsWith('http') ? avEl : null)
              if (aImg && aImg.src) return aImg.src
              try {
                var bg = getComputedStyle(avEl).backgroundImage
                if (bg && bg !== 'none') { var m = bg.match(/url\(["']?(https?:\/\/[^"')]+)/); if (m) return m[1] }
              } catch(e2) {}
            }
          }
          // 2. Fallback: ищем все img с class*="avatar" на странице — берём из ближайшего к тексту
          var allAvatars = document.querySelectorAll('[class*="avatar" i] img[src^="http"], img[class*="avatar" i][src^="http"]')
          for (var k = 0; k < allAvatars.length && k < 50; k++) {
            var parent = allAvatars[k].closest('[class*="chat" i], [class*="dialog" i], [class*="item" i], [class*="peer" i], li')
            if (parent && parent.textContent && parent.textContent.indexOf(name) !== -1) return allAvatars[k].src
          }
        } catch(e) {}
        return ''
      }
      // Поиск имени отправителя и аватарки в chatlist по preview-тексту сообщения
      function findSenderInChatlist(body) {
        if (!body || body.length < 2) return null
        var bodySlice = body.slice(0, 30)
        try {
          // 1. Telegram/MAX: .chatlist-chat + .peer-title
          var chats = document.querySelectorAll('.chatlist-chat')
          for (var i = 0; i < chats.length && i < 50; i++) {
            if ((chats[i].textContent || '').indexOf(bodySlice) === -1) continue
            var pt = chats[i].querySelector('.peer-title')
            var nm = pt ? (pt.textContent || '').trim() : ''
            if (!nm) continue
            return { name: nm, avatar: _findAvatarInEl(chats[i]) }
          }
          // 2. VK/Generic: dialog/conversation/chat-item элементы
          var generic = document.querySelectorAll('[class*="dialog" i], [class*="im_dialog" i], [class*="conversation" i], [class*="chat-item" i], [class*="chatlist" i]')
          for (var j = 0; j < generic.length && j < 80; j++) {
            var el = generic[j]
            if ((el.textContent || '').indexOf(bodySlice) === -1) continue
            var nameEl = el.querySelector('[class*="title" i], [class*="name" i], [class*="peer" i], b, strong')
            var sn = nameEl ? (nameEl.textContent || '').trim() : ''
            if (!sn || sn.length < 2 || sn.length > 60) continue
            if (sn === body.trim() || body.indexOf(sn) === 0) continue
            return { name: sn, avatar: _findAvatarInEl(el) }
          }
        } catch(e) {}
        return null
      }
      function _findAvatarInEl(el) {
        try {
          var avEl = el.querySelector('img.avatar-photo, [class*="avatar"] img, canvas.avatar-photo, img[class*="photo" i]')
          if (avEl && avEl.tagName === 'IMG' && avEl.src && avEl.naturalWidth > 10) return avEl.src
          if (avEl && avEl.tagName === 'CANVAS' && avEl.width > 10) {
            try { return avEl.toDataURL('image/png') } catch(e) {}
          }
          var avDiv = el.querySelector('[class*="avatar" i], [class*="photo" i]')
          if (avDiv) {
            var bg = getComputedStyle(avDiv).backgroundImage
            if (bg && bg !== 'none') {
              var m = bg.match(/url\(["']?(.+?)["']?\)/)
              if (m && m[1] && m[1].startsWith('http')) return m[1]
            }
            var img2 = avDiv.querySelector('img[src]')
            if (img2 && img2.src && img2.naturalWidth > 10) return img2.src
          }
        } catch(e) {}
        return ''
      }
      // Проверка: title — это название мессенджера, а не имя отправителя
      var _appTitles = /^(ma[xк][cс]?|telegram|whatsapp|vk|viber|вконтакте|вк)/i
      // Фильтр спам-текстов: статусы online, исходящие ("Вы: ..."), системные
      var _spamBody = /^(\d+\s*(непрочитанн|новы[хе]?\s*сообщ)|минуту?\s+назад|секунд\w*\s+назад|час\w*\s+назад|только\s+что|online|в\s+сети|был[аи]?\s+(в\s+сети|online)|печата|записыва|набира|пишет|typing|ожидани[ея]\s+сети|connecting|reconnecting|updating|загрузк[аи]|обновлени[ея]|подключени[ея])/i
      // v0.71.6: MAX системные/onboarding сообщения (фантомы)
      var _maxPhantom = /сообщений\s+пока\s+нет|напишите\s+(сообщение|что[- ]нибудь)|отправьте\s+(этот\s+)?стикер|теперь\s+в\s+max|новые\s+сообщения\s+сегодня|начните\s+общени[ея]|добро\s+пожаловать/i
      // v0.72.0: "ред." / "edited" — пометка редактирования сообщения (не новое сообщение)
      var _editedMark = /^(\d{1,2}:\d{2}\s*)?ред\.?\s*$/i
      var _outgoing = /^(вы:\s|you:\s)/i
      // v0.58.0: статусы "Имя В сети", системные "Сообщение", "Пропущенный вызов"
      var _statusEnd = /\s+(в\s+сети|online|offline|был[аи]?\s+(в\s+сети|недавно|давно))\s*$/i
      var _sysText = /^(сообщение|пропущенный\s*(вызов|звонок)|входящий\s*(вызов|звонок)|missed\s*call|message)$/i
      function isSpamNotif(body) {
        if (!body || body.length < 2) return 'empty'
        var t = body.trim()
        if (_spamBody.test(t)) return 'system'
        if (_maxPhantom.test(t)) return 'maxPhantom'
        if (_editedMark.test(t)) return 'edited'
        if (_outgoing.test(t)) return 'outgoing'
        if (_statusEnd.test(t)) return 'status'
        if (_sysText.test(t)) return 'sysText'
        return ''
      }
      function enrichNotif(title, body, tag, icon) {
        var realTitle = title
        var realIcon = icon
        if (!title || _appTitles.test(title.trim())) {
          var sender = findSenderInChatlist(body)
          if (sender) {
            realTitle = sender.name
            if (!realIcon && sender.avatar) realIcon = sender.avatar
          }
        }
        if (!realIcon) realIcon = findAvatar(realTitle)
        return { title: realTitle, icon: realIcon }
      }
      // Перехват Notification → console.log('__CC_NOTIF__...')
      var _N = window.Notification
      window.Notification = function(title, opts) {
        try {
          var body = (opts && opts.body) || ''
          var tag = (opts && opts.tag) || ''
          var icon = (opts && opts.icon) || (opts && opts.image) || (opts && opts.badge) || ''
          var spam = isSpamNotif(body)
          if (spam) {
            _logNotif('blocked', title, body, tag, icon, spam, '')
            return
          }
          var enriched = enrichNotif(title, body, tag, icon)
          _logNotif('passed', title, body, tag, icon, '', enriched.title)
          console.log('__CC_NOTIF__' + JSON.stringify({
            t: enriched.title || '', b: body, i: enriched.icon, g: tag
          }))
        } catch(e) {}
      }
      window.Notification.permission = 'granted'
      window.Notification.requestPermission = function(cb) {
        if (cb) cb('granted'); return Promise.resolve('granted')
      }
      Object.defineProperty(window.Notification, 'permission', {
        get: function() { return 'granted' }, set: function() {}
      })
      // Перехват ServiceWorker showNotification (MAX и другие SvelteKit-приложения)
      try {
        var _show = ServiceWorkerRegistration.prototype.showNotification
        ServiceWorkerRegistration.prototype.showNotification = function(title, opts) {
          try {
            var body = (opts && opts.body) || ''
            var tag = (opts && opts.tag) || ''
            var icon = (opts && opts.icon) || (opts && opts.image) || (opts && opts.badge) || ''
            var spam = isSpamNotif(body)
            if (spam) {
              _logNotif('blocked', title, body, tag, icon, spam, '')
              return Promise.resolve()
            }
            var enriched = enrichNotif(title, body, tag, icon)
            _logNotif('passed', title, body, tag, icon, '', enriched.title)
            console.log('__CC_NOTIF__' + JSON.stringify({
              t: enriched.title || '', b: body, i: enriched.icon, g: tag
            }))
          } catch(e) {}
          return Promise.resolve()
        }
      } catch(e) {}
      // v0.73.9: Блокируем Badge API из page context.
      // Telegram Web вызывает navigator.setAppBadge(N) напрямую из page —
      // Chromium транслирует в ITaskbarList3::SetOverlayIcon, перебивая наш overlay.
      if (navigator.setAppBadge) {
        navigator.setAppBadge = function(n) {
          console.log('__CC_BADGE_BLOCKED__:' + n)
          return Promise.resolve()
        }
      }
      if (navigator.clearAppBadge) {
        navigator.clearAppBadge = function() { return Promise.resolve() }
      }
      // Блокируем Service Worker — страховка от SW-вызовов setAppBadge
      if (navigator.serviceWorker) {
        var _origReg = navigator.serviceWorker.register
        navigator.serviceWorker.register = function() {
          console.log('__CC_SW_BLOCKED__')
          return Promise.reject(new Error('blocked'))
        }
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          regs.forEach(function(r) { r.unregister() })
        }).catch(function() {})
      }
      // Перехват Audio → volume=0 (глушим звуки мессенджера)
      // 1) new Audio(src)
      var _A = window.Audio
      window.Audio = function(src) { var a = new _A(src); a.volume = 0; return a }
      window.Audio.prototype = _A.prototype
      // 2) document.createElement('audio')
      var _ce = document.createElement.bind(document)
      document.createElement = function(tag) {
        var el = _ce.apply(document, arguments)
        if (tag && tag.toLowerCase() === 'audio') { el.volume = 0; el.muted = true }
        return el
      }
      // 3) AudioContext / webkitAudioContext → createGain().gain.value = 0
      ;['AudioContext','webkitAudioContext'].forEach(function(name) {
        var _Ctx = window[name]
        if (!_Ctx) return
        var _createGain = _Ctx.prototype.createGain
        _Ctx.prototype.createGain = function() {
          var g = _createGain.call(this); g.gain.value = 0; return g
        }
      })
    } + ')()'
    ;(document.head || document.documentElement).appendChild(s)
    s.remove()
  } catch(e) {}
})()

// Debounce для MutationObserver (не пересчитывать на каждый пиксель скролла)
let updateTimer = null
const UPDATE_DEBOUNCE = 300 // ms

// Селекторы счётчиков непрочитанных для каждого мессенджера
const UNREAD_SELECTORS = {
  telegram: [
    '.badge.badge-unread',
    '.unread',
    '.dialogs-badge',
  ],
  whatsapp: [
    '[data-testid="icon-unread-count"]',
    '.unread-count',
    'span[aria-label*="unread"]',
  ],
  vk: [
    // VK VKUI (2024–2026)
    '.vkuiCounter',
    '.ConversationItem__unread',
    '.im_nav_badge',
    // VK legacy
    '.im-page--chat-unread-count',
    '.MessagesNavItem--unread .MessagesNavItem__unreadCounter',
    '.vkuiBadge',
  ],
  max: [
    // MAX (бывший VK Мессенджер) — generic селекторы
    '[class*="unread"]',
    '[class*="badge"]',
    '[class*="counter"]',
  ],
}

// Селекторы для извлечения текста последнего входящего сообщения
const LAST_MESSAGE_SELECTORS = {
  telegram: [
    // Telegram Web K (старый)
    '.message.last-in .text-content',
    // Telegram Web A (новый) — входящие пузыри
    '.bubble.is-in:last-of-type .message',
    // fallback
    '.last-message .message-text',
  ],
  whatsapp: [
    // Входящие сообщения (не наши)
    '.message-in:last-of-type .selectable-text span[dir]',
    '.message-in:last-of-type .copyable-text span',
  ],
  vk: [
    // VK VKUI (2024–2026) — входящие пузыри
    '.im-mess--in:last-child .im-mess--text',
    '.im_msg_stack--in:last-child .im-mess_text',
    // VK legacy
    '.im-mes-stack--in:last-child .im-mes__text',
    '.MessagesMes--in:last-child .MessagesMes__text',
  ],
  max: [
    // MAX (бывший VK Мессенджер) — generic селекторы
    '[class*="message-in"] [class*="text"]',
    '[class*="message"]:last-child [class*="text"]',
  ],
}

function getMessengerType() {
  const h = location.hostname
  if (h.includes('telegram')) return 'telegram'
  if (h.includes('whatsapp')) return 'whatsapp'
  if (h.includes('vk.com')) return 'vk'
  if (h.includes('max.ru')) return 'max'
  return null
}

// Проверяет, находится ли элемент-бейдж внутри приглушённого (muted) диалога
// Поддерживает Telegram Web K и Web A
function isBadgeInMutedDialog(el, type) {
  if (type !== 'telegram') return false
  try {
    // Ищем ближайший контейнер диалога в боковой панели
    const dialog = el.closest([
      '.chatlist-chat',           // Telegram Web K
      '.ListItem',                // Telegram Web A
      '[class*="chat-item"]',
      '[class*="dialog-row"]',
      'li[class]',
    ].join(','))
    if (!dialog) return false
    // Класс is-muted (Telegram Web K)
    if (dialog.classList.contains('is-muted')) return true
    // Иконки muted/silent внутри диалога
    if (dialog.querySelector([
      '.icon-mute',
      '.icon-muted',
      '[class*="muted-icon"]',
      '[class*="silent"]',
      '[data-icon="mute"]',
    ].join(','))) return true
  } catch {}
  return false
}

// Проверяет — является ли текущий ОТКРЫТЫЙ чат приглушённым (Telegram)
function isActiveChatMuted(type) {
  if (type !== 'telegram') return false
  try {
    // Активный диалог в боковом списке
    const activeDialog = document.querySelector([
      '.chatlist-chat.active',
      '.ListItem.active',
      '[class*="chat-item"][class*="active"]',
      '[class*="dialog-row"][class*="active"]',
    ].join(','))
    if (!activeDialog) return false
    if (activeDialog.classList.contains('is-muted')) return true
    if (activeDialog.querySelector('.icon-mute, .icon-muted, [class*="muted-icon"], [data-icon="mute"]')) return true
  } catch {}
  return false
}

// Определяет тип диалога: 'personal' | 'channel' | 'group'
// Используется для раздельного счётчика и умного фильтра
function getChatType(dialogEl) {
  if (!dialogEl) return 'personal'
  try {
    // Telegram Web K: data-peer-type атрибут
    const pt = dialogEl.dataset?.peerType || dialogEl.getAttribute('data-peer-type')
    if (pt === 'channel') return 'channel'
    if (pt === 'chat' || pt === 'megagroup' || pt === 'supergroup') return 'group'
    if (pt === 'user') return 'personal'
    // Иконки в DOM: канал имеет мегафон/broadcast
    if (dialogEl.querySelector('.icon-channel, .icon-broadcast, [class*="channel-icon"]')) return 'channel'
    if (dialogEl.querySelector('.icon-group')) return 'group'
  } catch {}
  return 'personal'
}

// Проверяет — является ли текущий ОТКРЫТЫЙ чат каналом/группой (умный фильтр)
function isActiveChatChannel(type) {
  if (type !== 'telegram') return false
  try {
    const activeDialog = document.querySelector([
      '.chatlist-chat.active',
      '.ListItem.active',
      '[class*="chat-item"][class*="active"]',
    ].join(','))
    const chatType = getChatType(activeDialog)
    return chatType === 'channel' || chatType === 'group'
  } catch {}
  return false
}

// Возвращает { personal, channels, total, allTotal } — раздельный подсчёт непрочитанных
// allTotal — для бейджа вкладки (все непрочитанные), personal/channels — без muted (для уведомлений)
function countUnread(type) {
  // Telegram — отдельная логика
  if (type === 'telegram') return countUnreadTelegram()
  // VK — отдельная логика (VKUI часто меняет классы)
  if (type === 'vk') return countUnreadVK()
  // MAX — только title parsing (generic селекторы считают лишние бейджи: меню, иконки)
  if (type === 'max') return countUnreadMAX()

  // WhatsApp и другие — стандартный подсчёт по querySelectorAll
  const sels = UNREAD_SELECTORS[type] || []
  let personal = 0, channels = 0, mutedTotal = 0
  for (const sel of sels) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        const n = parseInt(el.textContent?.trim(), 10)
        const count = (!isNaN(n) && n > 0) ? n : (el.offsetParent !== null ? 1 : 0)
        if (count === 0) return
        mutedTotal += count
        const isMuted = isBadgeInMutedDialog(el, type)
        if (isMuted) return
        personal += count
      })
      if (mutedTotal > 0) break
    } catch {}
  }

  // Fallback: WhatsApp может ставить "(N)" в title
  if (mutedTotal === 0) {
    try {
      const m = document.title.match(/\((\d+)\)/)
      if (m) { mutedTotal = parseInt(m[1], 10) || 0; personal = mutedTotal }
    } catch {}
  }

  return { personal, channels, total: personal + channels, allTotal: mutedTotal }
}

// ── VK: поиск непрочитанных в боковом меню + fallback'и ──────────────────
function countUnreadVK() {
  let allTotal = 0
  let source = 'none'

  // 1. Title: VK иногда ставит "(N)" в title
  try {
    const m = document.title.match(/\((\d+)\)/)
    if (m) { allTotal = parseInt(m[1], 10) || 0; if (allTotal > 0) source = 'title' }
  } catch {}

  // 2. Найти пункт "Мессенджер" в боковом меню VK — число в бейдже рядом
  if (allTotal === 0) {
    try {
      // Перебираем все ссылки/элементы бокового меню
      const candidates = document.querySelectorAll('a[href*="/im"], a[href*="im"], [class*="LeftMenu"] a, nav a, [role="navigation"] a, aside a')
      for (const el of candidates) {
        const text = (el.textContent || '').trim()
        if (/мессенджер/i.test(text) || /messenger/i.test(text)) {
          // Ищем число внутри этого элемента
          const nums = text.match(/(\d+)/)
          if (nums) { allTotal = parseInt(nums[1], 10) || 0; source = 'nav-messenger'; break }
          // Или ищем дочерний элемент-бейдж
          const badge = el.querySelector('[class*="ounter"], [class*="badge"], [class*="Badge"]')
          if (badge) {
            const n = parseInt(badge.textContent?.trim(), 10)
            if (!isNaN(n) && n > 0) { allTotal = n; source = 'nav-badge'; break }
          }
        }
      }
    } catch {}
  }

  // 3. Широкий поиск: любые элементы с числом-бейджом в навигации
  if (allTotal === 0) {
    try {
      // Ищем все счётчики рядом со ссылками на /im
      const imLinks = document.querySelectorAll('a[href*="/im"]')
      for (const link of imLinks) {
        const parent = link.closest('li, div, [class*="Item"], [class*="item"]') || link
        const counters = parent.querySelectorAll('[class*="ounter"], [class*="badge"], [class*="Badge"], [class*="counter"]')
        for (const c of counters) {
          const n = parseInt(c.textContent?.trim(), 10)
          if (!isNaN(n) && n > 0) { allTotal = n; source = 'im-link-counter'; break }
        }
        if (allTotal > 0) break
        // Или число прямо в тексте ссылки
        const nums = (link.textContent || '').match(/(\d+)/)
        if (nums) {
          const n = parseInt(nums[1], 10)
          if (n > 0 && n < 10000) { allTotal = n; source = 'im-link-text'; break }
        }
      }
    } catch {}
  }

  // 4. CSS-селекторы (старые и новые VK)
  if (allTotal === 0) {
    const sels = UNREAD_SELECTORS.vk
    for (const sel of sels) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const n = parseInt(el.textContent?.trim(), 10)
          if (!isNaN(n) && n > 0) allTotal += n
        })
        if (allTotal > 0) { source = 'css:' + sel; break }
      } catch {}
    }
  }

  countUnreadVK._lastSource = source
  return { personal: allTotal, channels: 0, total: allTotal, allTotal }
}

// ── MAX (web.max.ru): Svelte SPA — классы типа svelte-xxx, нельзя искать по class*="badge" ──
function countUnreadMAX() {
  let allTotal = 0
  let source = 'none'

  // 1. Title: MAX может ставить "(N)" в title
  try {
    const m = document.title.match(/\((\d+)\)/)
    if (m) { allTotal = parseInt(m[1], 10) || 0; if (allTotal > 0) source = 'title' }
  } catch {}

  // 2. Навигация: вкладка "Все" / "Чаты" — ищем дочерние span/div с числом (Svelte-safe)
  if (allTotal === 0) {
    try {
      const navItems = document.querySelectorAll('nav a, nav button, aside a, aside button, [role="tablist"] [role="tab"], [class*="nav"] a, [class*="Nav"] a')
      for (const el of navItems) {
        const fullText = (el.textContent || '').trim()
        const cleanText = fullText.replace(/\d+/g, '').trim()
        if (/^все$/i.test(cleanText) || /^чаты$/i.test(cleanText)) {
          // Svelte-safe: ищем числовые дочерние элементы (не по классу, а по содержимому)
          const children = el.querySelectorAll('span, div')
          for (const ch of children) {
            const ct = ch.textContent.trim()
            if (/^\d+$/.test(ct)) {
              const n = parseInt(ct, 10)
              if (n > 0 && n < 10000) { allTotal = n; source = 'nav-child-num'; break }
            }
          }
          if (allTotal > 0) break
          // Число в тексте самого элемента: "Все 1"
          const nums = fullText.match(/(\d+)/)
          if (nums) {
            const n = parseInt(nums[1], 10)
            if (n > 0 && n < 10000) { allTotal = n; source = 'nav-all-text'; break }
          }
        }
      }
    } catch {}
  }

  // 3. Sidebar: суммируем числовые бейджи на чатах в левой части экрана
  // MAX Svelte: нет стабильных class-имён → ищем маленькие элементы с числом
  if (allTotal === 0) {
    try {
      const halfW = window.innerWidth * 0.5
      const spans = document.querySelectorAll('a span, li span, a div, li div')
      for (const span of spans) {
        const text = span.textContent.trim()
        if (!/^\d+$/.test(text)) continue
        const n = parseInt(text, 10)
        if (n <= 0 || n >= 10000) continue
        // Фильтр: маленький элемент в sidebar (левая часть экрана)
        const rect = span.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (rect.width > 45 || rect.height > 28) continue
        if (rect.left > halfW) continue
        allTotal += n
      }
      if (allTotal > 0) source = 'sidebar-spans'
    } catch {}
  }

  // v0.72.5: Логирование source для диагностики
  if (source !== countUnreadMAX._lastSource || allTotal !== countUnreadMAX._lastCount) {
    try { console.log('__CC_DIAG__unread_max source=' + source + ' count=' + allTotal + ' title="' + document.title.slice(0, 30) + '"') } catch {}
  }
  countUnreadMAX._lastSource = source
  countUnreadMAX._lastCount = allTotal
  return { personal: allTotal, channels: 0, total: allTotal, allTotal }
}

// ── Telegram: адаптивный поиск — title → folder tabs → badges вне chatlist ──
function countUnreadTelegram() {
  let allTotal = 0
  let personal = 0
  let source = 'none' // для диагностики: откуда взяли число
  let domTotal = 0    // v0.75.3: DOM-подсчёт (приоритетнее title)

  // 1. document.title = "(26) Telegram Web" — быстрый и надёжный источник
  try {
    const m = document.title.match(/\((\d+)\)/)
    if (m) { allTotal = parseInt(m[1], 10) || 0; if (allTotal > 0) source = 'title' }
  } catch {}

  // 2. Folder tab badges — горизонтальные и вертикальные папки
  if (allTotal === 0) {
    // 2a. Горизонтальные табы
    const tabSelectors = ['.tabs-tab', '.menu-horizontal-div-item']
    for (const sel of tabSelectors) {
      try {
        const tabs = document.querySelectorAll(sel)
        if (tabs.length > 1) {
          const badge = tabs[0].querySelector('.badge, [class*="badge"]')
          if (badge) {
            const n = parseInt(badge.textContent?.trim(), 10)
            if (!isNaN(n) && n > 0) { allTotal = n; source = 'tab:' + sel; break }
          }
        }
      } catch {}
    }

    // 2b. Вертикальные папки (#folders-sidebar) — бейджи внутри scrollable-position
    if (allTotal === 0) {
      try {
        const scrollable = document.querySelector('.folders-sidebar__scrollable-position, #folders-sidebar .scrollable')
        if (scrollable) {
          // Первая папка = "Все чаты" — её бейдж = общее число непрочитанных
          const firstFolder = scrollable.querySelector('.folders-sidebar__folder-item, .sidebar-tools-button')
          if (firstFolder) {
            const badge = firstFolder.querySelector('.badge, [class*="badge"]')
            if (badge) {
              const n = parseInt(badge.textContent?.trim(), 10)
              if (!isNaN(n) && n > 0) { allTotal = n; source = 'vertical-folder' }
            }
          }
        }
      } catch {}
    }
  }

  // 3. АДАПТИВНЫЙ: .badge элементы НЕ внутри chatlist = folder tab badges
  if (allTotal === 0) {
    try {
      for (const b of document.querySelectorAll('.badge')) {
        if (b.closest('.chatlist-chat, .chatlist, .ListItem, [class*="chat-item"]')) continue
        const n = parseInt(b.textContent?.trim(), 10)
        if (!isNaN(n) && n > 0) { allTotal = n; source = 'adaptive'; break }
      }
    } catch {}
  }

  // 4. Сумма видимых chatlist badges
  if (allTotal === 0) {
    try {
      let chatlistSum = 0
      document.querySelectorAll('.badge.badge-unread, .badge-unread').forEach(b => {
        const n = parseInt(b.textContent?.trim(), 10)
        if (!isNaN(n) && n > 0) chatlistSum += n
        else if (b.offsetParent !== null) chatlistSum += 1
      })
      if (chatlistSum > 0) { allTotal = chatlistSum; source = 'chatlist-sum' }
    } catch {}
  }

  // Split: personal из folder tab "Личные"
  // v0.74.2: Отслеживаем НАШЛИ ли вкладку "Личные". Если нашли но бейджа нет —
  // personal=0 КОРРЕКТНО (нет личных). Fallback personal=allTotal только если вкладка НЕ найдена.
  let personalTabFound = false
  try {
    const tryTabs = (sel) => {
      for (const tab of document.querySelectorAll(sel)) {
        const label = (tab.textContent || '').replace(/\d+/g, '').trim()
        if (/личн/i.test(label) || /personal/i.test(label)) {
          personalTabFound = true
          const badge = tab.querySelector('.badge, [class*="badge"]')
          if (badge) {
            const n = parseInt(badge.textContent?.trim(), 10)
            if (!isNaN(n) && n > 0) personal = n
          }
          return true
        }
      }
      return false
    }
    tryTabs('.tabs-tab') || tryTabs('.menu-horizontal-div-item') || tryTabs('.sidebar-tools-button')
  } catch {}

  // Fallback: если вкладка "Личные" НЕ найдена — считаем всё личным (старый Telegram / нет папок)
  if (personal === 0 && !personalTabFound) personal = allTotal
  const channels = Math.max(0, allTotal - personal)

  // Сохраняем source для диагностики
  countUnreadTelegram._lastSource = source

  return { personal, channels, total: allTotal, allTotal }
}

// ── Диагностика DOM: сбор информации о бейджах и селекторах ──────────────
let diagSent = false
function runDiagnostics(type) {
  if (diagSent) return
  diagSent = true
  try {
    const diag = {
      type,
      title: document.title,
      titleMatch: document.title.match(/\((\d+)\)/)?.[1] || null,
      url: location.href,
    }

    if (type === 'telegram') {
      diag.tabsTabCount = document.querySelectorAll('.tabs-tab').length
      diag.menuHorizCount = document.querySelectorAll('.menu-horizontal-div-item').length
      diag.sidebarBtnCount = document.querySelectorAll('.sidebar-tools-button').length
      diag.countSource = countUnreadTelegram._lastSource || 'unknown'
      diag.allBadges = []
      diag.folderBadges = []
      let badgeIdx = 0
      document.querySelectorAll('.badge').forEach(b => {
        if (badgeIdx++ > 50) return
        const text = b.textContent?.trim() || ''
        const inChatlist = !!b.closest('.chatlist-chat, .chatlist, .ListItem, [class*="chat-item"]')
        const p = b.parentElement
        const entry = { text, cls: (b.className || '').substring(0, 60), parentCls: (p?.className || '').substring(0, 60), inChatlist }
        diag.allBadges.push(entry)
        if (!inChatlist) diag.folderBadges.push(entry)
      })
    } else {
      // Диагностика для VK / WhatsApp / других
      const unreadSels = UNREAD_SELECTORS[type] || []
      const msgSels = LAST_MESSAGE_SELECTORS[type] || []
      diag.unreadSelectors = {}
      for (const sel of unreadSels) {
        try { diag.unreadSelectors[sel] = document.querySelectorAll(sel).length } catch { diag.unreadSelectors[sel] = -1 }
      }
      diag.messageSelectors = {}
      for (const sel of msgSels) {
        try {
          const els = document.querySelectorAll(sel)
          diag.messageSelectors[sel] = { count: els.length, lastText: els.length > 0 ? (els[els.length - 1].textContent?.trim() || '').substring(0, 60) : null }
        } catch { diag.messageSelectors[sel] = { count: -1, lastText: null } }
      }
      // Пробуем найти хоть какие-то бейджи-счётчики на странице
      diag.genericCounters = []
      let idx = 0
      document.querySelectorAll('[class*="counter"], [class*="unread"], [class*="badge"], [class*="Counter"]').forEach(el => {
        if (idx++ > 30) return
        const text = el.textContent?.trim() || ''
        if (text.length > 10) return
        diag.genericCounters.push({ text, cls: (el.className || '').substring(0, 80) })
      })

      // VK-специфика: источник счётчика, generic текст сообщения, классы чат-области
      if (type === 'vk') {
        diag.countSource = countUnreadVK._lastSource || 'unknown'
        diag.genericLastMsg = getVKLastIncomingText()
        // Элементы с "mes"/"msg" в классах (показать какие вообще есть)
        diag.chatElements = []
        let ci = 0
        document.querySelectorAll('[class*="im-mes"], [class*="im_msg"], [class*="Message"], [class*="ChatBody"], [class*="im-page"]').forEach(el => {
          if (ci++ > 20) return
          diag.chatElements.push((el.className || '').substring(0, 100))
        })
        // Nav links с /im
        diag.imLinks = []
        document.querySelectorAll('a[href*="/im"]').forEach(a => {
          diag.imLinks.push({ href: (a.getAttribute('href') || '').substring(0, 40), text: (a.textContent || '').trim().substring(0, 40) })
        })
      }
    }

    ipcRenderer.sendToHost('monitor-diag', diag)
  } catch (e) {
    try { ipcRenderer.sendToHost('monitor-diag', { error: e.message }) } catch {}
  }
}

function getLastMessageText(type) {
  // Сначала пробуем CSS-селекторы
  const sels = LAST_MESSAGE_SELECTORS[type] || []
  for (const sel of sels) {
    try {
      const els = document.querySelectorAll(sel)
      if (els.length > 0) {
        const last = els[els.length - 1]
        const text = last.textContent?.trim()
        if (text && text.length > 0 && text.length < 2000) {
          // Пропускаем чистые timestamps (v0.56.1: MAX selector возвращал "18:22")
          if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) continue
          // v0.71.6: Пропускаем MAX onboarding/системные фантомы
          if (/сообщений\s+пока\s+нет|напишите\s+(сообщение|что[- ]нибудь)|отправьте\s+(этот\s+)?стикер|теперь\s+в\s+max/i.test(text)) continue
          // v0.72.0: Пропускаем "ред." (отредактированное сообщение)
          if (/^(\d{1,2}:\d{2}\s*)?ред\.?\s*$/i.test(text)) continue
          return text
        }
      }
    } catch {}
  }
  // VK fallback: generic поиск по DOM чата
  if (type === 'vk') return getVKLastIncomingText()
  return null
}

// ── VK: generic поиск последнего входящего сообщения ──────────────────────
// VK часто меняет CSS-классы, поэтому ищем по структуре DOM:
// - Сообщения находятся в скроллируемой области чата
// - Входящие обычно выровнены влево, исходящие — вправо
// - Ищем последний текстовый элемент, который НЕ от текущего пользователя
function getVKLastIncomingText() {
  try {
    // Стратегия 1: найти область чата с сообщениями
    // v0.59.2: VK реальный класс — ConvoMain__history (784 children)
    const chatContainers = document.querySelectorAll(
      '.ConvoMain__history, [class*="ConvoMain__history"], ' +
      '[class*="im-page--chat-body"], [class*="im_msg_list"], [class*="ChatBody"], ' +
      '[class*="im-history"], [class*="ConversationBody"], [class*="chat-body"]'
    )
    for (const container of chatContainers) {
      // Берём последние элементы с текстом
      const textEls = container.querySelectorAll('[class*="text"], [class*="Text"], p, span')
      for (let i = textEls.length - 1; i >= Math.max(0, textEls.length - 20); i--) {
        const t = textEls[i].textContent?.trim()
        if (t && t.length > 1 && t.length < 500) {
          // Пропускаем служебные тексты
          if (/^\d{1,2}:\d{2}$/.test(t)) continue // время "12:08"
          if (/^сегодня$/i.test(t)) continue
          if (/^вчера$/i.test(t)) continue
          if (/^новые сообщения$/i.test(t)) continue
          if (/^сообщение$/i.test(t)) continue // placeholder поля ввода
          return t
        }
      }
    }

    // Стратегия 2: ищем любой элемент, содержащий текст сообщения
    // В VK чат-сообщения обычно внутри элементов с class содержащим "mes" или "msg"
    const msgEls = document.querySelectorAll(
      '[class*="im-mess"], [class*="im_msg"], [class*="im-mes"], ' +
      '[class*="Message"], [class*="message"]'
    )
    for (let i = msgEls.length - 1; i >= Math.max(0, msgEls.length - 10); i--) {
      const el = msgEls[i]
      // Пропускаем исходящие (обычно содержат "--out" или "--own" в классе)
      const cls = el.className || ''
      if (/out|own|self|sent/i.test(cls)) continue
      // Ищем текстовый контент
      const textEl = el.querySelector('[class*="text"], [class*="Text"], p') || el
      const t = textEl.textContent?.trim()
      if (t && t.length > 1 && t.length < 500) {
        if (/^\d{1,2}:\d{2}$/.test(t)) continue
        return t
      }
    }
  } catch {}
  return null
}

let lastCount = -1
let lastSentText = null
let lastActiveMessageText = null  // для детекции сообщений в активном чате
let lastActiveMessageTime = 0     // cooldown: не спамить уведомлениями
let observer = null

// ── Quick addedNodes detection (v0.46.3) ─────────────────────────────────────
// MAX и другие мессенджеры НЕ вызывают Notification для каждого сообщения,
// И unread count НЕ растёт когда чат открыт в WebView.
// Решение: наблюдаем addedNodes в MutationObserver — при появлении нового
// DOM-элемента с текстом → считаем как новое сообщение → new-message IPC.
let lastQuickMsgText = ''
let lastQuickMsgTime = 0

// Извлечь имя отправителя из заголовка активного чата (preload world имеет доступ к DOM)
function getActiveChatSender() {
  try {
    // 1. Header активного чата — расширенные селекторы (TG/VK/MAX/Generic)
    const headerSels = [
      // v0.59.2: VK реальные классы — ConvoHeader__info содержит "Имя\nonline"
      '.ConvoHeader__info',
      // v0.60.0: MAX — .topbar .headerWrapper содержит "Окно чата с ИмяФамилия"
      '.topbar .headerWrapper',
      '.chat-info .peer-title', '.topbar .peer-title',
      '.topbar [class*="info" i] [class*="title" i]',
      '.topbar [class*="info" i] [class*="name" i]',
      '[class*="chat-header" i] [class*="title" i]',
      '[class*="top-bar" i] [class*="title" i]',
      '[class*="topbar" i] [class*="name" i]',
      '[class*="chat-header" i] [class*="name" i]',
      'header [class*="title" i]', 'header [class*="name" i]'
    ]
    for (const sel of headerSels) {
      const h = document.querySelector(sel)
      if (h) {
        let name = (h.textContent || '').trim()
        // v0.59.2: VK ConvoHeader__info содержит "Имяonline"/"Имябыл(а) в сети" — чистим
        name = name.replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|печатает|typing)\s*$/i, '').trim()
        // v0.60.0: MAX "Окно чата с ИмяФамилия" → убираем префикс
        name = name.replace(/^окно\s+чата\s+с\s+/i, '').trim()
        if (name && name.length >= 2 && name.length <= 80) return name
      }
    }
    // MAX fallback: .topbar содержит имя чата — ищем первый child div с коротким текстом
    const tb = document.querySelector('.topbar')
    if (tb) {
      const tbKids = tb.querySelectorAll('div, span, h1, h2, h3')
      for (let i = 0; i < tbKids.length && i < 20; i++) {
        const t = (tbKids[i].textContent || '').trim()
        if (t.length < 2 || t.length > 60) continue
        if (/^(был|была|в сети|online|offline|печатает|typing|окно чата)/i.test(t)) continue
        return t
      }
    }
    // 2. Активный/выделенный чат в sidebar
    const activeSels = ['.chatlist-chat.active', '.chatlist-chat.selected', '[class*="chat"][class*="active" i]', '[class*="dialog"][class*="active" i]']
    for (const sel of activeSels) {
      const act = document.querySelector(sel)
      if (!act) continue
      const pt = act.querySelector('.peer-title, [class*="title" i], [class*="name" i]')
      const nm = pt ? (pt.textContent || '').trim() : ''
      if (nm && nm.length >= 2 && nm.length <= 80) return nm
    }
  } catch (e) {}
  return ''
}

// Извлечь аватарку из заголовка активного чата
function getActiveChatAvatar() {
  try {
    // 1. Header: аватарка в chat-info/topbar/header
    const avImg = document.querySelector('.chat-info img.avatar-photo, .topbar img.avatar-photo, .chat-info [class*="avatar" i] img, [class*="chat-header" i] img[class*="avatar" i], header img[class*="avatar" i], header [class*="avatar" i] img')
    if (avImg && avImg.src && avImg.src.startsWith('http') && !avImg.src.includes('emoji')) return avImg.src
    // Canvas avatar
    const avCanvas = document.querySelector('.chat-info canvas.avatar-photo, .topbar canvas.avatar-photo')
    if (avCanvas && avCanvas.width > 10) {
      try { return avCanvas.toDataURL('image/png') } catch (e) {}
    }
    // 2. Активный чат в sidebar
    const act = document.querySelector('.chatlist-chat.active, .chatlist-chat.selected, [class*="chat"][class*="active" i]')
    if (act) {
      const avAct = act.querySelector('img.avatar-photo, [class*="avatar"] img, canvas.avatar-photo')
      if (avAct && avAct.tagName === 'IMG' && avAct.src && avAct.src.startsWith('http')) return avAct.src
      if (avAct && avAct.tagName === 'CANVAS' && avAct.width > 10) {
        try { return avAct.toDataURL('image/png') } catch (e) {}
      }
    }
  } catch (e) {}
  return ''
}

// Извлечь чистый текст сообщения из DOM-ноды (убрать timestamps, служебные тексты)
function extractMsgText(node) {
  const raw = (node.textContent || '').trim()
  if (raw.length < 2 || raw.length > 500) return ''
  // Убираем встроенные timestamps из текста (MAX: "Ааа18:22" → "Ааа")
  const clean = raw.replace(/\s*\d{1,2}:\d{2}(:\d{2})?\s*/g, '').trim()
  if (clean.length < 2) return ''
  // Пропускаем чистые timestamp'ы
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) return ''
  // Пропускаем служебные тексты
  if (/^(typing|печатает|был[а]? в сети|online|в сети|оффлайн|offline|не в сети|ожидани[ея]\s+сети|connecting|reconnecting|updating|загрузк[аи]|обновлени[ея]|подключени[ея])$/i.test(clean)) return ''
  // v0.58.1: "три минуты назад", "час назад" — VK пишет время словами
  if (/\s+назад\s*$/i.test(clean) || /^(час|минуту?|секунду?)\s+назад$/i.test(clean)) return ''
  // v0.58.1: VK UI — секции, даты, навигация
  if (/^(недавние|избранные|все (диалоги|чаты|сообщения)|непрочитанные|архив|чаты)$/i.test(clean)) return ''
  if (/^(сегодня|вчера|позавчера)\s*(в\s*)?$/i.test(clean)) return ''
  // v0.71.6: MAX onboarding/системные фантомы
  if (/сообщений\s+пока\s+нет|напишите\s+(сообщение|что[- ]нибудь)|отправьте\s+(этот\s+)?стикер|теперь\s+в\s+max|начните\s+общени[ея]|добро\s+пожаловать/i.test(clean)) return ''
  // v0.72.0: "ред." / "edited" — пометка редактирования (не новый текст)
  if (/^ред\.?\s*$/i.test(clean) || /^edited\.?\s*$/i.test(clean)) return ''
  // v0.74.3: WhatsApp артефакты иконок (alt-текст) — status-dblcheck, status-check, status-time и т.д.
  // Пример: "status-dblcheckic-imageНаш график..." — текст начинается с alt иконки статуса доставки
  if (/^status-(dblcheck|check|time|read|delivered|seen|pending)/i.test(clean)) return ''
  return clean
}

// v0.59.0: Селекторы КОНТЕЙНЕРА ЧАТА (область с пузырями сообщений)
// quickNewMsgCheck наблюдает ТОЛЬКО за этим контейнером, а не за всем document.body
const CHAT_CONTAINER_SELECTORS = {
  vk: [
    // v0.59.2: Реальные VK классы из DOM Inspector (март 2026)
    '.ConvoMain__history',                // ← 784 children, основной контейнер сообщений
    '[class*="ConvoMain__history"]',      // fallback с prefix
    // Legacy VK классы (могут вернуться)
    '[class*="im-page--chat-body"]', '[class*="im_msg_list"]', '[class*="ChatBody"]',
    '[class*="im-history"]', '[class*="ConversationBody"]', '[class*="chat-body"]',
    '[class*="im-page--chat"]', '[class*="HistoryMessages"]'
  ],
  max: [
    // v0.60.0: Реальные MAX классы из DOM Inspector (март 2026)
    // .history (870 children) — контейнер сообщений, .openedChat (914) — parent
    // ВНИМАНИЕ: scrollListContent это SIDEBAR (510 чатов), НЕ область сообщений!
    '.history',                                 // ← 870 children, контейнер сообщений (SvelteKit)
    '[class*="history"][class*="svelte"]',      // fallback с svelte hash
    '.openedChat',                              // parent контейнер чата
    '[class*="openedChat"]',                    // fallback
    // Generic
    '[class*="messages-container"]', '[class*="chat-body"]', '[class*="message-list"]',
    '[class*="bubbles"]'
  ],
  whatsapp: [
    // v0.76.0: WhatsApp Web / Business (март 2026)
    // #main появляется ТОЛЬКО при открытом чате
    '#main',
    'div[data-testid="conversation-panel-messages"]',
    '[role="application"]',
    // НЕ используем #app — слишком широкий, sidebar-фильтр не применяется для "container" режима
    // Если #main не найден → body-fallback + sidebar-фильтр (role=grid/row/gridcell, #side, _ak8o/_ak8i)
  ],
  telegram: []
}

function findChatContainer(type) {
  const sels = CHAT_CONTAINER_SELECTORS[type] || []
  for (const sel of sels) {
    try {
      const el = document.querySelector(sel)
      if (el) return el
    } catch {}
  }
  // v0.60.0: Fallback для SvelteKit (MAX) — ищем parent элементов .message
  // DOM Inspector показал: .message.svelte-fxkkld — отдельное сообщение.
  // Его parent = контейнер сообщений (то что нам нужно).
  // Проверяем: parent должен содержать ≥3 .message (чтобы не поймать случайный .message из sidebar)
  if (type === 'max' || type === 'generic') {
    try {
      const msgEl = document.querySelector('.message[class*="svelte"]')
      if (msgEl && msgEl.parentElement) {
        const parent = msgEl.parentElement
        const msgCount = parent.querySelectorAll('.message[class*="svelte"]').length
        if (msgCount >= 3) {
          try { console.log('__CC_DIAG__findChatContainer: MAX parent of .message | class=' + (parent.className || '').slice(0, 80) + ' | msgs=' + msgCount) } catch {}
          return parent
        }
      }
    } catch {}
  }
  return null
}

function quickNewMsgCheck(mutations, type) {
  const now = Date.now()
  if (now - lastQuickMsgTime < 3000) return // cooldown 3 сек — не спамить

  // v0.60.0 Решение #3: Обновить кэш контейнера чата если он потерялся (SPA навигация)
  if (!_chatContainerEl || !_chatContainerEl.isConnected) {
    _chatContainerEl = findChatContainer(type)
  }

  for (let mi = mutations.length - 1; mi >= 0; mi--) {
    const m = mutations[mi]
    if (m.type !== 'childList' || !m.addedNodes.length) continue
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue
      // Пропускаем UI-элементы: кнопки, инпуты, иконки, стили, скрипты
      const tag = node.tagName
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' ||
          tag === 'SVG' || tag === 'IMG' || tag === 'STYLE' || tag === 'SCRIPT' || tag === 'LINK') continue
      // v0.60.0 Решение #3: структурный DOM-фильтр
      // Если chatObserver на body fallback И контейнер чата известен —
      // пропускаем ноды ВНЕ контейнера (UI кнопки "Это не я", контекстное меню, sidebar)
      if (chatObserverTarget === 'body-fallback' && _chatContainerEl && !_chatContainerEl.contains(node)) continue

      let text = ''
      const childCount = node.querySelectorAll ? node.querySelectorAll('*').length : 0

      if (childCount <= 40) {
        // Простой node — берём textContent напрямую
        text = extractMsgText(node)
      } else if (childCount <= 200) {
        // Deep scan для SvelteKit/MAX: addedNode — контейнер с >40 children
        // Ищем внутри маленькие текстовые элементы (пузыри сообщений)
        const candidates = node.querySelectorAll('[class*="message" i] [class*="text" i], [class*="bubble" i], [class*="msg" i] span, p, [class*="content" i]')
        // Берём последний подходящий текст (новое сообщение = внизу)
        for (let ci = candidates.length - 1; ci >= Math.max(0, candidates.length - 10); ci--) {
          const t = extractMsgText(candidates[ci])
          if (t && t !== lastQuickMsgText && t !== lastSentText && t !== lastActiveMessageText) {
            text = t
            break
          }
        }
        // Fallback: ищем любой короткий текстовый node внизу DOM
        if (!text) {
          const allText = node.querySelectorAll('span, p, div')
          for (let ti = allText.length - 1; ti >= Math.max(0, allText.length - 20); ti--) {
            const el = allText[ti]
            // Пропускаем элементы с children (не leaf nodes)
            if (el.children && el.children.length > 2) continue
            const t = extractMsgText(el)
            if (t && t.length >= 2 && t.length <= 200 && t !== lastQuickMsgText && t !== lastSentText && t !== lastActiveMessageText) {
              text = t
              break
            }
          }
        }
      } else {
        continue // >200 children — слишком сложный контейнер (модалки, целые страницы)
      }

      if (!text) continue
      // Dedup: не повторяем тот же текст
      if (text === lastQuickMsgText || text === lastSentText || text === lastActiveMessageText) continue

      // Это новый DOM-элемент с текстом → вероятно новое сообщение
      lastQuickMsgText = text
      lastQuickMsgTime = now
      lastSentText = text
      lastActiveMessageText = text
      lastActiveMessageTime = now
      try { ipcRenderer.sendToHost('new-message', text) } catch {}
      // Эмиттим __CC_MSG__ — App.jsx обогатит через executeJavaScript (v0.55.1)
      // НЕ эмиттим __CC_NOTIF__ — чтобы не задедупить enriched версию из showNotification override
      try { console.log('__CC_MSG__' + text) } catch {}
      return // одно сообщение за callback — не спамить
    }
  }
}

// Защита от ложных срабатываний при загрузке страницы:
// первые 10 секунд не сообщаем о "новых" сообщениях — страница ещё грузится
let monitorReady = false
setTimeout(() => {
  monitorReady = true
  // Инициализируем lastActiveMessageText текущим текстом в DOM
  // чтобы первое обнаруженное сообщение (старое!) не считалось "новым"
  const type = getMessengerType()
  if (type) {
    try {
      const text = getLastMessageText(type)
      if (text) { lastActiveMessageText = text; lastSentText = text }
    } catch {}
  }
}, 10000)

function sendUpdate(type) {
  const { personal, channels, total, allTotal } = countUnread(type)
  if (allTotal !== lastCount) {
    const increased = total > lastCount && lastCount >= 0 && monitorReady
    lastCount = allTotal
    // Общий счётчик (для бейджа) — ВСЕ непрочитанные, включая muted
    try { ipcRenderer.sendToHost('unread-count', allTotal) } catch {}
    // Раздельный счётчик (личные vs каналы/группы) — без muted
    try { ipcRenderer.sendToHost('unread-split', { personal, channels }) } catch {}

    // Умный фильтр: уведомляем только если НЕ-muted чат с ростом (не канал, не muted)
    if (increased && !isActiveChatMuted(type) && !isActiveChatChannel(type)) {
      const text = getLastMessageText(type)
      if (text && text !== lastSentText) {
        lastSentText = text
        lastActiveMessageText = text  // синхронизируем
        try { ipcRenderer.sendToHost('new-message', text) } catch {}
        // Backup: дублируем через console.log для main-process перехвата (v0.39.5)
        try { console.log('__CC_MSG__' + text) } catch {}
      }
    }
  }

  // v0.59.1: Path 2 — детекция НОВОГО сообщения в АКТИВНОМ чате (когда unread count не растёт)
  // Корень проблемы: если пользователь на вкладке мессенджера и чат открыт → VK/WhatsApp
  // НЕ считают сообщение непрочитанным → count не растёт → Path 1 не работает.
  // Path 2 вызывает getLastMessageText() при каждом debounced sendUpdate и сравнивает с lastActiveMessageText.
  // Защита от мусора: текст берётся из CSS-селекторов СООБЩЕНИЙ (не sidebar), cooldown 3 сек.
  if (monitorReady && type !== 'telegram') {
    const inText = getLastMessageText(type)
    if (inText && inText !== lastActiveMessageText && inText !== lastSentText) {
      const now = Date.now()
      if (now - lastActiveMessageTime > 3000) {
        lastSentText = inText
        lastActiveMessageText = inText
        lastActiveMessageTime = now
        try { ipcRenderer.sendToHost('new-message', inText) } catch {}
        try { console.log('__CC_MSG__' + inText) } catch {}
      }
    }
    // Обновляем lastActiveMessageText для dedup (даже если не отправили)
    if (inText) lastActiveMessageText = inText
  } else if (monitorReady && type === 'telegram') {
    const inText = getLastMessageText(type)
    if (inText) lastActiveMessageText = inText
  }
}

// v0.59.1: Отдельный observer для области чата (пузыри сообщений)
// Привязывается к контейнеру чата. Если не найден — fallback на document.body с фильтрацией sidebar
let chatObserver = null
let chatObserverTarget = null // 'container' | 'body' — для диагностики
let chatObserverRetries = 0
const CHAT_OBSERVER_MAX_RETRIES = 5 // 5 попыток × 3 сек = 15 сек
// Фильтр sidebar-мутаций (для fallback на document.body)
// v0.59.1: реальные VK классы из DOM Inspector: ConvoList, ConvoListItem, MessagePreview
// v0.60.0: + scrollListContent/scrollListScrollable — MAX sidebar (521 чатов, НЕ область сообщений)
const _sidebarRe = /dialog|chat-?list|sidebar|peer-?list|conv-?list|left-?col|nav-?panel|im-page--dialogs|contacts|im-page--nav|ChatList|Sidebar|ConvoList|LeftAds|LeftMenu|ConvoListItem|MessagePreview|scrollListContent|scrollListScrollable|chatListItem|_ak9p|_ak8q|_ak8o|_ak8i/i
function isSidebarNode(node) {
  let el = node
  for (let i = 0; i < 8 && el && el !== document.body; i++) {
    // v0.74.3: WhatsApp #side — sidebar списка чатов
    if (el.id === 'side') return true
    const cls = el.className
    if (typeof cls === 'string' && _sidebarRe.test(cls)) return true
    if (el.getAttribute) {
      const role = el.getAttribute('role')
      if (role === 'navigation' || role === 'complementary' || role === 'grid' || role === 'row' || role === 'gridcell') return true
      // v0.74.3: WhatsApp role="grid" внутри #side — список чатов (68 rows)
      if (role === 'grid' && el.closest && el.closest('#side')) return true
    }
    el = el.parentElement
  }
  return false
}

// v0.60.0: Кэш найденного контейнера чата — для структурного DOM-фильтра (решение #3)
let _chatContainerEl = null

function startChatObserver(type) {
  if (chatObserver) { chatObserver.disconnect(); chatObserver = null }
  if (type === 'telegram') return // TG работает через __CC_NOTIF__

  const container = findChatContainer(type)
  chatObserverRetries++

  if (container) {
    _chatContainerEl = container // кэшируем для структурного фильтра
    // Нашли контейнер чата — наблюдаем только его
    chatObserverTarget = 'container:' + (container.className || container.tagName).slice(0, 60)
    chatObserver = new MutationObserver((mutations) => {
      if (monitorReady) quickNewMsgCheck(mutations, type)
    })
    chatObserver.observe(container, { childList: true, subtree: true })
    // Логируем в Pipeline
    try { console.log('__CC_DIAG__chatObserver: привязан к контейнеру | ' + chatObserverTarget + ' | попытка ' + chatObserverRetries) } catch {}
    return
  }

  if (chatObserverRetries < CHAT_OBSERVER_MAX_RETRIES) {
    // Контейнер не найден — retry через 3 сек
    try { console.log('__CC_DIAG__chatObserver: контейнер не найден, retry ' + chatObserverRetries + '/' + CHAT_OBSERVER_MAX_RETRIES) } catch {}
    setTimeout(() => startChatObserver(type), 3000)
    return
  }

  // Fallback: контейнер не найден после N попыток → наблюдаем document.body с sidebar-фильтром
  chatObserverTarget = 'body-fallback'
  _chatContainerEl = null
  // v0.74.3: Grace period — игнорируем мутации 5 сек после fallback (начальный рендер)
  let _fallbackGraceUntil = Date.now() + 5000
  try { console.log('__CC_DIAG__chatObserver: FALLBACK на document.body (контейнер не найден за ' + (chatObserverRetries * 3) + ' сек) | фильтрация sidebar включена | grace 5с') } catch {}
  chatObserver = new MutationObserver((mutations) => {
    if (!monitorReady) return
    // v0.74.3: Grace period — пропускаем мутации начального рендера
    if (Date.now() < _fallbackGraceUntil) return
    // Фильтруем мутации — пропускаем sidebar/chatlist
    const filtered = []
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i]
      if (m.type !== 'childList' || !m.addedNodes.length) continue
      // v0.60.0 Решение #3: структурный DOM-фильтр — если контейнер чата известен,
      // пропускаем мутации ВНЕ контейнера (UI кнопки, контекстное меню, sidebar)
      if (_chatContainerEl && !_chatContainerEl.contains(m.target)) continue
      if (!isSidebarNode(m.target)) filtered.push(m)
    }
    if (filtered.length > 0) quickNewMsgCheck(filtered, type)
  })
  chatObserver.observe(document.body, { childList: true, subtree: true })
}

// v0.60.0 Решение #1: Re-attach chatObserver при навигации (SPA)
// VK/MAX — SPA, URL меняется через pushState без перезагрузки страницы.
// При переходе в чат (/im/convo/...) появляется ConvoMain__history — нужно переподключить observer.
// ВАЖНО: context isolation — preload world не может перехватить history.pushState из main world.
// Используем polling location.href (каждые 2 сек) — SPA навигации редкие, нагрузка минимальна.
function setupNavigationWatcher(type) {
  if (type === 'telegram') return
  let lastUrl = location.href

  setInterval(() => {
    const newUrl = location.href
    if (newUrl === lastUrl) return
    try { console.log('__CC_DIAG__navigation: ' + lastUrl.slice(-30) + ' → ' + newUrl.slice(-30)) } catch {}
    lastUrl = newUrl

    // Сбрасываем retries и пробуем найти контейнер заново (с задержкой для рендера)
    chatObserverRetries = 0
    _chatContainerEl = null
    // Даём VK/MAX время отрисовать новую страницу
    setTimeout(() => startChatObserver(type), 1500)
    // Повторная попытка через 4 сек (если DOM ещё не готов)
    setTimeout(() => {
      if (chatObserverTarget === 'body-fallback' || !_chatContainerEl) {
        chatObserverRetries = 0
        startChatObserver(type)
      }
    }, 4000)
  }, 2000)
}

function startMonitor() {
  const type = getMessengerType()
  if (!type) return

  sendUpdate(type)

  // Диагностика DOM — отправляем через 15 сек (страница полностью загрузится)
  setTimeout(() => { sendUpdate(type); runDiagnostics(type) }, 15000)

  if (observer) return
  // Основной observer — для sendUpdate (unread count). Наблюдает document.body
  observer = new MutationObserver((mutations) => {
    clearTimeout(updateTimer)
    updateTimer = setTimeout(() => sendUpdate(type), UPDATE_DEBOUNCE)
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'aria-label']
  })

  // v0.59.0: Отдельный observer ТОЛЬКО для контейнера чата
  // quickNewMsgCheck теперь НЕ ловит sidebar/chatlist мутации
  setTimeout(() => startChatObserver(type), 5000) // ждём загрузку DOM

  // v0.60.0 Решение #1: Слежение за навигацией (SPA) для переподключения chatObserver
  setupNavigationWatcher(type)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMonitor)
} else {
  startMonitor()
}

// ── IPC: ручной запуск диагностики из App.jsx (через webview.send) ────────
ipcRenderer.on('run-diagnostics', () => {
  diagSent = false
  const type = getMessengerType()
  if (type) runDiagnostics(type)
})

// ── Перехват Notification API ─────────────────────────────────────────────
// УДАЛЁН из preload (v0.27.0): <script> injection + CustomEvent НЕ работает —
// context isolation изолирует JS events между preload world и main world.
// НОВОЕ РЕШЕНИЕ: App.jsx → webview.executeJavaScript() (main world) →
// console.log('__CC_NOTIF__...') → event 'console-message' на <webview> элементе.
// См. App.jsx: setWebviewRef() → dom-ready + console-message handlers.

// ── Зум WebView: Ctrl+колёсико и Ctrl+клавиши → IPC к хосту ──────────────
document.addEventListener('wheel', function(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  try { ipcRenderer.sendToHost('zoom-change', { delta: e.deltaY < 0 ? 5 : -5 }) } catch(ex) {}
}, { passive: false })

document.addEventListener('keydown', function(e) {
  if (!e.ctrlKey) return
  if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    try { ipcRenderer.sendToHost('zoom-change', { delta: 10 }) } catch(ex) {}
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    try { ipcRenderer.sendToHost('zoom-change', { delta: -10 }) } catch(ex) {}
  } else if (e.key === '0') {
    e.preventDefault()
    try { ipcRenderer.sendToHost('zoom-reset') } catch(ex) {}
  }
})
