// v0.84.3: Extracted from monitor.preload.js — DOM selectors & chat container detection

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

// v0.60.0: Кэш найденного контейнера чата — для структурного DOM-фильтра (решение #3)
let _chatContainerEl = null

function getChatContainerEl() { return _chatContainerEl }
function setChatContainerEl(el) { _chatContainerEl = el }

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

// Фильтр sidebar-мутаций (для fallback на document.body)
// v0.59.1: реальные VK классы из DOM Inspector: ConvoList, ConvoListItem, MessagePreview
// v0.60.0: + scrollListContent/scrollListScrollable — MAX sidebar (521 чатов, НЕ область сообщений)
const _sidebarRe = /dialog|chat-?list|sidebar|peer-?list|conv-?list|left-?col|nav-?panel|im-page--dialogs|contacts|im-page--nav|ChatList|Sidebar|ConvoList|LeftAds|LeftMenu|ConvoListItem|MessagePreview|scrollListContent|scrollListScrollable|chatListItem|_ak9p|_ak8q|_ak8o|_ak8i|left_nav|_page_sidebar|page_block|leftMenu|counts_module|HeaderNav/i

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

module.exports = { CHAT_CONTAINER_SELECTORS, findChatContainer, isSidebarNode, getChatContainerEl, setChatContainerEl }
