// v0.87.87: вынесено из unreadCounters.js — Telegram-специфичная логика подсчёта.
// Самая сложная из всех мессенджеров: 4 источника (title, folder tabs, adaptive,
// chatlist sum) + split personal/channels через папку «Личные» или data-peer-id.
// Также telegram-only helpers: isBadgeInMutedDialog, isActiveChatMuted, getChatType.

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
function getChatType(dialogEl) {
  if (!dialogEl) return 'personal'
  try {
    const pt = dialogEl.dataset?.peerType || dialogEl.getAttribute('data-peer-type')
    if (pt === 'channel') return 'channel'
    if (pt === 'chat' || pt === 'megagroup' || pt === 'supergroup') return 'group'
    if (pt === 'user') return 'personal'
    // v0.76.2: Fallback на data-peer-id — положительный = user/bot, отрицательный = group/channel
    const peerId = dialogEl.dataset?.peerId || dialogEl.getAttribute('data-peer-id')
    if (peerId) {
      return peerId.startsWith('-') ? 'channel' : 'personal'
    }
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

// v0.76.7: Извлекает число непрочитанных из chatlist-chat элемента
// Ищем .badge с textContent = ТОЛЬКО число (не обёрточный .badge с текстом чата)
function _extractUnreadFromChat(chat) {
  try {
    const badges = chat.querySelectorAll('.badge')
    for (let i = 0; i < badges.length; i++) {
      const t = (badges[i].textContent || '').trim()
      if (/^\d+$/.test(t)) return parseInt(t, 10)
    }
  } catch {}
  return 0
}

// Telegram: адаптивный поиск — title → folder tabs → badges вне chatlist
function countUnreadTelegram() {
  let allTotal = 0
  let personal = 0
  let source = 'none' // для диагностики: откуда взяли число

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
    if (!personalTabFound) {
      tryTabs('.folders-sidebar__scrollable-position .folders-sidebar__folder-item')
    }
  } catch {}

  // v0.76.4: Метод 2 — подсчёт по chatlist + data-peer-id
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

  countUnreadTelegram._lastSource = source

  // v0.76.4: Лог для отладки — виден в Pipeline через __CC_DIAG__
  if (allTotal !== countUnreadTelegram._prevTotal || personal !== countUnreadTelegram._prevPersonal) {
    try { console.log(`__CC_DIAG__unread_tg source=${source} all=${allTotal} personal=${personal} ch=${channels} tabFound=${personalTabFound}`) } catch {}
    countUnreadTelegram._prevTotal = allTotal
    countUnreadTelegram._prevPersonal = personal
  }

  return { personal, channels, total: allTotal, allTotal }
}

module.exports = {
  isBadgeInMutedDialog,
  isActiveChatMuted,
  isActiveChatChannel,
  getChatType,
  _extractUnreadFromChat,
  countUnreadTelegram,
}
