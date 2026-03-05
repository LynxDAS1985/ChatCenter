// v0.22.0 — ChatMonitor: диагностика DOM + адаптивный поиск folder-tab badges
// Бейдж считает ВСЕ непрочитанные (включая muted), уведомления — только не-muted
// Cooldown 10 сек при запуске, чтобы не слать старые сообщения как новые
const { ipcRenderer } = require('electron')

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
    '.im-page--chat-unread-count',
    '.MessagesNavItem--unread .MessagesNavItem__unreadCounter',
    '.vkuiBadge',
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
    // VK Web
    '.im-mes-stack--in:last-child .im-mes__text',
    '.MessagesMes--in:last-child .MessagesMes__text',
  ],
}

function getMessengerType() {
  const h = location.hostname
  if (h.includes('telegram')) return 'telegram'
  if (h.includes('whatsapp')) return 'whatsapp'
  if (h.includes('vk.com')) return 'vk'
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
  // Telegram — отдельная логика с persistent Map (виртуализация DOM)
  if (type === 'telegram') return countUnreadTelegram()

  // WhatsApp / VK — стандартный подсчёт по querySelectorAll
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
  return { personal, channels, total: personal + channels, allTotal: mutedTotal }
}

// ── Telegram: адаптивный поиск — title → folder tabs → badges вне chatlist ──
function countUnreadTelegram() {
  let allTotal = 0
  let personal = 0
  let source = 'none' // для диагностики: откуда взяли число

  // 1. document.title = "(26) Telegram Web"
  try {
    const m = document.title.match(/\((\d+)\)/)
    if (m) { allTotal = parseInt(m[1], 10) || 0; if (allTotal > 0) source = 'title' }
  } catch {}

  // 2. Folder tab badges — пробуем разные селекторы layout'ов TG Web K
  if (allTotal === 0) {
    const tabSelectors = [
      '.tabs-tab',                     // горизонтальные табы (стандарт)
      '.menu-horizontal-div-item',     // альт. горизонтальные
      '.sidebar-tools-button',         // вертикальные кнопки сбоку
    ]
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
  }

  // 3. АДАПТИВНЫЙ: .badge элементы НЕ внутри chatlist = folder tab badges
  //    Первый такой бейдж = "Все чаты" = общее кол-во непрочитанных
  if (allTotal === 0) {
    try {
      for (const b of document.querySelectorAll('.badge')) {
        if (b.closest('.chatlist-chat, .chatlist, .ListItem, [class*="chat-item"]')) continue
        const n = parseInt(b.textContent?.trim(), 10)
        if (!isNaN(n) && n > 0) { allTotal = n; source = 'adaptive'; break }
      }
    } catch {}
  }

  // 4. Last fallback: сумма видимых chatlist badges (не точно, но лучше чем 0)
  if (allTotal === 0) {
    try {
      document.querySelectorAll('.badge.badge-unread').forEach(b => {
        const n = parseInt(b.textContent?.trim(), 10)
        if (!isNaN(n) && n > 0) allTotal += n
        else if (b.offsetParent !== null) allTotal += 1
      })
      if (allTotal > 0) source = 'chatlist-sum'
    } catch {}
  }

  // Split: personal из folder tab "Личные"
  try {
    const tryTabs = (sel) => {
      for (const tab of document.querySelectorAll(sel)) {
        const label = (tab.textContent || '').replace(/\d+/g, '').trim()
        if (/личн/i.test(label) || /personal/i.test(label)) {
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

  if (personal === 0) personal = allTotal
  const channels = Math.max(0, allTotal - personal)

  // Сохраняем source для диагностики
  countUnreadTelegram._lastSource = source

  return { personal, channels, total: allTotal, allTotal }
}

// ── Диагностика DOM: сбор информации о бейджах и folder tabs ──────────────
let diagSent = false
function runDiagnostics() {
  if (diagSent) return
  diagSent = true
  try {
    const diag = {
      title: document.title,
      titleMatch: document.title.match(/\((\d+)\)/)?.[1] || null,
      url: location.href,
      tabsTabCount: document.querySelectorAll('.tabs-tab').length,
      menuHorizCount: document.querySelectorAll('.menu-horizontal-div-item').length,
      sidebarBtnCount: document.querySelectorAll('.sidebar-tools-button').length,
      countSource: countUnreadTelegram._lastSource || 'unknown',
      allBadges: [],
      folderBadges: [],
    }

    // Собираем ВСЕ .badge элементы с контекстом (до 50 шт.)
    let badgeIdx = 0
    document.querySelectorAll('.badge').forEach(b => {
      if (badgeIdx++ > 50) return
      const text = b.textContent?.trim() || ''
      const inChatlist = !!b.closest('.chatlist-chat, .chatlist, .ListItem, [class*="chat-item"]')
      const p = b.parentElement
      const gp = p?.parentElement
      const entry = {
        text,
        cls: (b.className || '').substring(0, 60),
        parentTag: p?.tagName || '?',
        parentCls: (p?.className || '').substring(0, 60),
        gpCls: (gp?.className || '').substring(0, 60),
        inChatlist,
      }
      diag.allBadges.push(entry)
      if (!inChatlist) diag.folderBadges.push(entry)
    })

    // Sidebar контейнер
    const sb = document.querySelector('#column-left, .sidebar-left, [class*="sidebar"]')
    if (sb) {
      diag.sidebarCls = (sb.className || '').substring(0, 80)
    }

    ipcRenderer.sendToHost('monitor-diag', diag)
  } catch (e) {
    try { ipcRenderer.sendToHost('monitor-diag', { error: e.message }) } catch {}
  }
}

function getLastMessageText(type) {
  const sels = LAST_MESSAGE_SELECTORS[type] || []
  for (const sel of sels) {
    try {
      const els = document.querySelectorAll(sel)
      if (els.length > 0) {
        const last = els[els.length - 1]
        const text = last.textContent?.trim()
        if (text && text.length > 0 && text.length < 2000) return text
      }
    } catch {}
  }
  return null
}

let lastCount = -1
let lastSentText = null
let observer = null

// Защита от ложных срабатываний при загрузке страницы:
// первые 10 секунд не сообщаем о "новых" сообщениях — страница ещё грузится
let monitorReady = false
setTimeout(() => { monitorReady = true }, 10000)

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
        try { ipcRenderer.sendToHost('new-message', text) } catch {}
      }
    }
  }
}

function startMonitor() {
  const type = getMessengerType()
  if (!type) return

  sendUpdate(type)

  // Диагностика DOM — отправляем через 15 сек (страница полностью загрузится)
  if (type === 'telegram') {
    setTimeout(() => { sendUpdate(type); runDiagnostics() }, 15000)
  }

  if (observer) return
  observer = new MutationObserver(() => {
    // Debounce: при скролле Telegram DOM меняется сотни раз в секунду
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMonitor)
} else {
  startMonitor()
}

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
