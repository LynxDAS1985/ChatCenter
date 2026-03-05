// v0.29.1 — ChatMonitor: ранняя <script> injection для перехвата Notification/Audio
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
      // Перехват Notification → console.log('__CC_NOTIF__...')
      var _N = window.Notification
      window.Notification = function(title, opts) {
        try {
          console.log('__CC_NOTIF__' + JSON.stringify({
            t: title || '', b: (opts && opts.body) || '', i: (opts && opts.icon) || ''
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
      // Перехват Audio → volume=0 (глушим звуки мессенджера)
      var _A = window.Audio
      window.Audio = function(src) { var a = new _A(src); a.volume = 0; return a }
      window.Audio.prototype = _A.prototype
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
  // Telegram — отдельная логика
  if (type === 'telegram') return countUnreadTelegram()
  // VK — отдельная логика (VKUI часто меняет классы)
  if (type === 'vk') return countUnreadVK()

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
        if (text && text.length > 0 && text.length < 2000) return text
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
    // VK chat container: обычно содержит элементы с временными метками
    const chatContainers = document.querySelectorAll(
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
      }
    }
  }

  // Path 2: Детекция новых входящих сообщений в АКТИВНОМ чате
  // Когда чат открыт — VK/WhatsApp не считают сообщение непрочитанным, счётчик не растёт
  // Поэтому проверяем текст последнего входящего сообщения отдельно
  if (monitorReady) {
    const inText = getLastMessageText(type)
    if (inText && inText !== lastSentText && inText !== lastActiveMessageText) {
      const now = Date.now()
      // Cooldown 3 сек — не спамить при прокрутке
      if (now - lastActiveMessageTime > 3000) {
        lastSentText = inText
        lastActiveMessageText = inText
        lastActiveMessageTime = now
        try { ipcRenderer.sendToHost('new-message', inText) } catch {}
      }
    }
    // Обновляем lastActiveMessageText даже без отправки — чтобы не уведомлять повторно
    if (inText) lastActiveMessageText = inText
  }
}

function startMonitor() {
  const type = getMessengerType()
  if (!type) return

  sendUpdate(type)

  // Диагностика DOM — отправляем через 15 сек (страница полностью загрузится)
  setTimeout(() => { sendUpdate(type); runDiagnostics(type) }, 15000)

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
