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
    // v0.76.2: Fallback на data-peer-id — положительный = user/bot, отрицательный = group/channel
    const peerId = dialogEl.dataset?.peerId || dialogEl.getAttribute('data-peer-id')
    if (peerId) {
      return peerId.startsWith('-') ? 'channel' : 'personal'
    }
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

// v0.76.7: Извлекает число непрочитанных из chatlist-chat элемента
// Ищем .badge с textContent = ТОЛЬКО число (не обёрточный .badge с текстом чата)
function _extractUnreadFromChat(chat) {
  try {
    // Перебираем ВСЕ .badge внутри чата — ищем тот у которого текст = число
    const badges = chat.querySelectorAll('.badge')
    for (let i = 0; i < badges.length; i++) {
      const t = (badges[i].textContent || '').trim()
      if (/^\d+$/.test(t)) return parseInt(t, 10)
    }
  } catch {}
  return 0
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

  // 3. АДАПТИВНЫЙ: .badge НЕ внутри chatlist = folder tab badges
  // v0.76.5: Только если chatlist НЕ загружен (нет .chatlist-chat)
  // Если chatlist есть — adaptive ненадёжен (ловит folder badges как фантомы)
  const chatlistLoaded = document.querySelectorAll('.chatlist-chat').length > 0
  if (allTotal === 0 && !chatlistLoaded) {
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

  // v0.76.2: Split personal/channels — ДВА метода:
  // Метод 1: Папка "Личные" (если есть) — точный бейдж
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
    // v0.76.2: Также ищем в вертикальных папках
    if (!personalTabFound) {
      tryTabs('.folders-sidebar__scrollable-position .folders-sidebar__folder-item')
    }
  } catch {}

  // v0.76.4: Метод 2 — подсчёт по chatlist + data-peer-id
  // Парсим число непрочитанных из КОНЦА textContent каждого чата
  // (в TG Web K число всегда в конце: "Текст сообщения...24")
  if (!personalTabFound) {
    try {
      const chats = document.querySelectorAll('.chatlist-chat')
      if (chats.length > 0) {
        let chatlistPersonal = 0
        chats.forEach(chat => {
          const unread = _extractUnreadFromChat(chat)
          if (unread <= 0) return
          const peerId = chat.dataset?.peerId || chat.getAttribute('data-peer-id')
          if (peerId && !peerId.startsWith('-')) {
            chatlistPersonal += unread // положительный peer-id = personal
          }
        })
        personal = chatlistPersonal
        personalTabFound = true
      }
    } catch {}
  }

  // Fallback: если НИ папки НИ chatlist нет — считаем всё личным (ранняя загрузка)
  if (personal === 0 && !personalTabFound) personal = allTotal

  const channels = Math.max(0, allTotal - personal)

  // Сохраняем source для диагностики
  countUnreadTelegram._lastSource = source

  // v0.76.4: Лог для отладки — виден в Pipeline через __CC_DIAG__
  if (allTotal !== countUnreadTelegram._prevTotal || personal !== countUnreadTelegram._prevPersonal) {
    try { console.log(`__CC_DIAG__unread_tg source=${source} all=${allTotal} personal=${personal} ch=${channels} tabFound=${personalTabFound}`) } catch {}
    countUnreadTelegram._prevTotal = allTotal
    countUnreadTelegram._prevPersonal = personal
  }

  return { personal, channels, total: allTotal, allTotal }
}

// v0.82.3: Вынесено из monitor.preload.js
module.exports = { UNREAD_SELECTORS, LAST_MESSAGE_SELECTORS, getMessengerType, isBadgeInMutedDialog, isActiveChatMuted, isActiveChatChannel, getChatType, countUnread, countUnreadVK, countUnreadMAX, countUnreadTelegram, _extractUnreadFromChat }
