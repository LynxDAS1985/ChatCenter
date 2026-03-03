// v0.8 — ChatMonitor: непрочитанные сообщения + текст нового сообщения для AI/авто-ответа
const { ipcRenderer } = require('electron')

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

function countUnread(type) {
  const sels = UNREAD_SELECTORS[type] || []
  let total = 0
  for (const sel of sels) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        const n = parseInt(el.textContent?.trim(), 10)
        if (!isNaN(n) && n > 0) total += n
        else if (el.offsetParent !== null) total += 1
      })
      if (total > 0) break
    } catch {}
  }
  return total
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

function sendUpdate(type) {
  const count = countUnread(type)
  if (count !== lastCount) {
    const increased = count > lastCount && lastCount >= 0
    lastCount = count
    try { ipcRenderer.sendToHost('unread-count', count) } catch {}

    // Если количество непрочитанных выросло — пробуем извлечь текст последнего сообщения
    if (increased) {
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

  if (observer) return
  observer = new MutationObserver(() => sendUpdate(type))
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
