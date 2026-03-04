// v0.16 — ChatMonitor: непрочитанные сообщения + текст нового сообщения для AI/авто-ответа
// Фикс: cooldown 10 сек при запуске, чтобы не слать старые сообщения как новые
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

function countUnread(type) {
  const sels = UNREAD_SELECTORS[type] || []
  let total = 0
  for (const sel of sels) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        // Пропускаем бейджи приглушённых диалогов
        if (isBadgeInMutedDialog(el, type)) return
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

// Защита от ложных срабатываний при загрузке страницы:
// первые 10 секунд не сообщаем о "новых" сообщениях — страница ещё грузится
let monitorReady = false
setTimeout(() => { monitorReady = true }, 10000)

function sendUpdate(type) {
  const count = countUnread(type)
  if (count !== lastCount) {
    const increased = count > lastCount && lastCount >= 0 && monitorReady
    lastCount = count
    try { ipcRenderer.sendToHost('unread-count', count) } catch {}

    // Если количество непрочитанных выросло — пробуем извлечь текст последнего сообщения
    // Не отправляем если открытый чат приглушён
    if (increased && !isActiveChatMuted(type)) {
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
