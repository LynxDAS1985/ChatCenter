// v0.87.87 — Refactored: Telegram-логика вынесена в unreadTelegram.js.
// Этот файл — диспетчер + VK + MAX + WhatsApp + общие селекторы.
// Telegram-helpers (isBadgeInMutedDialog, isActiveChatMuted, isActiveChatChannel,
// getChatType, countUnreadTelegram, _extractUnreadFromChat) — re-export из unreadTelegram.js
// для обратной совместимости (monitor.preload.cjs импортирует их по старым именам).

// v0.87.87: локальный main/preloads/utils/package.json с "type":"commonjs"
// переопределяет корневой type:module → require/module.exports работают.
const tg = require('./unreadTelegram.js')

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
  // v0.87.87: защита для Node-test контекста (smokeTest require'ит preload — там нет location)
  if (typeof location === 'undefined') return null
  const h = location.hostname
  if (h.includes('telegram')) return 'telegram'
  if (h.includes('whatsapp')) return 'whatsapp'
  if (h.includes('vk.com')) return 'vk'
  if (h.includes('max.ru')) return 'max'
  return null
}

// Возвращает { personal, channels, total, allTotal } — раздельный подсчёт непрочитанных
// allTotal — для бейджа вкладки (все непрочитанные), personal/channels — без muted (для уведомлений)
function countUnread(type) {
  // Telegram — отдельная логика в unreadTelegram.js
  if (type === 'telegram') return tg.countUnreadTelegram()
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
        const isMuted = tg.isBadgeInMutedDialog(el, type)
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

// VK: поиск непрочитанных в боковом меню + fallback'и
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
      const candidates = document.querySelectorAll('a[href*="/im"], a[href*="im"], [class*="LeftMenu"] a, nav a, [role="navigation"] a, aside a')
      for (const el of candidates) {
        const text = (el.textContent || '').trim()
        if (/мессенджер/i.test(text) || /messenger/i.test(text)) {
          const nums = text.match(/(\d+)/)
          if (nums) { allTotal = parseInt(nums[1], 10) || 0; source = 'nav-messenger'; break }
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
      const imLinks = document.querySelectorAll('a[href*="/im"]')
      for (const link of imLinks) {
        const parent = link.closest('li, div, [class*="Item"], [class*="item"]') || link
        const counters = parent.querySelectorAll('[class*="ounter"], [class*="badge"], [class*="Badge"], [class*="counter"]')
        for (const c of counters) {
          const n = parseInt(c.textContent?.trim(), 10)
          if (!isNaN(n) && n > 0) { allTotal = n; source = 'im-link-counter'; break }
        }
        if (allTotal > 0) break
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

// MAX (web.max.ru): Svelte SPA — классы типа svelte-xxx, нельзя искать по class*="badge"
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
          const children = el.querySelectorAll('span, div')
          for (const ch of children) {
            const ct = ch.textContent.trim()
            if (/^\d+$/.test(ct)) {
              const n = parseInt(ct, 10)
              if (n > 0 && n < 10000) { allTotal = n; source = 'nav-child-num'; break }
            }
          }
          if (allTotal > 0) break
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
  if (allTotal === 0) {
    try {
      const halfW = window.innerWidth * 0.5
      const spans = document.querySelectorAll('a span, li span, a div, li div')
      for (const span of spans) {
        const text = span.textContent.trim()
        if (!/^\d+$/.test(text)) continue
        const n = parseInt(text, 10)
        if (n <= 0 || n >= 10000) continue
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

// v0.82.3: Вынесено из monitor.preload.js
// v0.87.87: Telegram-helpers re-export из unreadTelegram.js — обратная совместимость
module.exports = {
  UNREAD_SELECTORS, LAST_MESSAGE_SELECTORS,
  getMessengerType,
  countUnread, countUnreadVK, countUnreadMAX,
  // Telegram (re-export)
  isBadgeInMutedDialog: tg.isBadgeInMutedDialog,
  isActiveChatMuted: tg.isActiveChatMuted,
  isActiveChatChannel: tg.isActiveChatChannel,
  getChatType: tg.getChatType,
  countUnreadTelegram: tg.countUnreadTelegram,
  _extractUnreadFromChat: tg._extractUnreadFromChat,
}
