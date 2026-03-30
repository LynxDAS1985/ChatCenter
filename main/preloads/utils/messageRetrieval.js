// v0.84.3: Extracted from monitor.preload.js — last message text retrieval

const { LAST_MESSAGE_SELECTORS } = require('./unreadCounters')

function getLastMessageText(type) {
  // Сначала пробуем CSS-селекторы
  const sels = LAST_MESSAGE_SELECTORS[type] || []
  for (const sel of sels) {
    try {
      const els = document.querySelectorAll(sel)
      if (els.length > 0) {
        const last = els[els.length - 1]
        const text = last.textContent?.trim()
        if (text && text.length > 0 && text.length < 2000) {
          // Пропускаем чистые timestamps (v0.56.1: MAX selector возвращал "18:22")
          if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) continue
          // v0.71.6: Пропускаем MAX onboarding/системные фантомы
          if (/сообщений\s+пока\s+нет|напишите\s+(сообщение|что[- ]нибудь)|отправьте\s+(этот\s+)?стикер|теперь\s+в\s+max/i.test(text)) continue
          // v0.72.0: Пропускаем "ред." (отредактированное сообщение)
          if (/^(\d{1,2}:\d{2}\s*)?ред\.?\s*$/i.test(text)) continue
          return text
        }
      }
    } catch {}
  }
  // VK fallback: generic поиск по DOM чата
  if (type === 'vk') return getVKLastIncomingText()
  return null
}

// v0.81.1: VK поиск последнего ВХОДЯЩЕГО сообщения (пропускает out/own/self/sent)
function getVKLastIncomingText() {
  try {
    // Стратегия 1: найти область чата с сообщениями
    // v0.59.2: VK реальный класс — ConvoMain__history (784 children)
    const chatContainers = document.querySelectorAll(
      '.ConvoMain__history, [class*="ConvoMain__history"], ' +
      '[class*="im-page--chat-body"], [class*="im_msg_list"], [class*="ChatBody"], ' +
      '[class*="im-history"], [class*="ConversationBody"], [class*="chat-body"]'
    )
    for (const container of chatContainers) {
      // v0.81.1: Ищем пузыри сообщений, пропускаем исходящие (out)
      const bubbles = container.querySelectorAll('[class*="ConvoMessage"], [class*="im-mess"], [class*="im_msg"], [class*="message"]')
      for (let i = bubbles.length - 1; i >= Math.max(0, bubbles.length - 10); i--) {
        const bcls = typeof bubbles[i].className === 'string' ? bubbles[i].className : ''
        // v0.81.1: Пропускаем исходящие — VK помечает их классами out/own/self/sent
        if (/out|own|self|sent/i.test(bcls)) continue
        const textEl = bubbles[i].querySelector('[class*="text"], [class*="Text"], p, span')
        if (!textEl) continue
        const t = textEl.textContent?.trim()
        if (t && t.length > 1 && t.length < 500) {
          if (/^\d{1,2}:\d{2}$/.test(t)) continue
          if (/^сегодня$/i.test(t) || /^вчера$/i.test(t)) continue
          if (/^новые сообщения$/i.test(t) || /^сообщение$/i.test(t)) continue
          return t
        }
      }
    }

    // Стратегия 2: fallback — ищем элементы с "mes"/"msg" в классе, пропускаем исходящие
    const msgEls = document.querySelectorAll('[class*="im-mess"], [class*="im_msg"], [class*="im-mes"], [class*="Message"], [class*="message"]')
    for (let i = msgEls.length - 1; i >= Math.max(0, msgEls.length - 10); i--) {
      const el = msgEls[i]
      const cls = typeof el.className === 'string' ? el.className : ''
      if (/out|own|self|sent/i.test(cls)) continue
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

module.exports = { getLastMessageText, getVKLastIncomingText }
