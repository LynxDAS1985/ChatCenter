// v0.6 — ChatMonitor: отслеживание непрочитанных сообщений через MutationObserver
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
      if (total > 0) break // нашли хотя бы один совпадающий селектор
    } catch {}
  }
  return total
}

let lastCount = -1
let observer = null

function sendUpdate(type) {
  const count = countUnread(type)
  if (count !== lastCount) {
    lastCount = count
    try { ipcRenderer.sendToHost('unread-count', count) } catch {}
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
