// v0.84.3: Extracted from monitor.preload.js — DOM diagnostics

const { ipcRenderer } = require('electron')
const { UNREAD_SELECTORS, LAST_MESSAGE_SELECTORS, countUnreadTelegram, countUnreadVK } = require('./unreadCounters')

// ── Диагностика DOM: сбор информации о бейджах и селекторах ──────────────
let diagSent = false

function runDiagnostics(type, deps) {
  if (diagSent) return
  diagSent = true
  // deps.getVKLastIncomingText — injected from messageRetrieval to avoid circular
  var getVKLastIncomingText = (deps && deps.getVKLastIncomingText) || function() { return null }
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
      // v0.76.1: Диагностика data-peer-type на чатах с бейджами
      diag.chatPeerTypes = []
      let ptIdx = 0
      document.querySelectorAll('.chatlist-chat').forEach((chat) => {
        if (ptIdx >= 15) return
        const badge = chat.querySelector('.badge, [class*="badge"]')
        const badgeText = badge ? badge.textContent?.trim() : null
        const peerType = chat.dataset?.peerType || chat.getAttribute('data-peer-type') || 'none'
        const name = (chat.querySelector('.peer-title')?.textContent || '').slice(0, 20)
        if (badgeText || ptIdx < 5) {
          diag.chatPeerTypes.push({ name, peerType, badge: badgeText })
        }
        ptIdx++
      })
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
        diag.genericCounters.push({ text, cls: (typeof el.className === 'string' ? el.className : '').substring(0, 80) })
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
          diag.chatElements.push((typeof el.className === 'string' ? el.className : '').substring(0, 100))
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

function resetDiagnostics() {
  diagSent = false
}

module.exports = { runDiagnostics, resetDiagnostics }
