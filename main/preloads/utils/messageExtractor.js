// v0.84.3: Extracted from monitor.preload.js — message text extraction & spam filters

// v0.82.1: Per-messenger спам-паттерны для extractMsgText
// Каждый мессенджер имеет СВОИ дополнительные фильтры
const EXTRACT_SPAM = {
  max: [
    /сообщений\s+пока\s+нет|напишите\s+(сообщение|что[- ]нибудь)|отправьте\s+(этот\s+)?стикер|теперь\s+в\s+max|начните\s+общени[ея]|добро\s+пожаловать/i,
    /^ред\.?\s*$/i, /^edited\.?\s*$/i
  ],
  whatsapp: [
    /^status-(dblcheck|check|time|read|delivered|seen|pending)/i
  ],
  vk: [
    /^(недавние|избранные|все (диалоги|чаты|сообщения)|непрочитанные|архив|чаты)$/i,
    /^(сегодня|вчера|позавчера)\s*(в\s*)?$/i
  ],
  telegram: []
}

// Per-messenger deep scan селекторы для quickNewMsgCheck
const QUICK_MSG_SELECTORS = {
  max: '[class*="message" i] [class*="text" i], [class*="bubble" i], [class*="msg" i] span, p, [class*="content" i]',
  whatsapp: '[class*="message" i] [class*="text" i], [class*="copyable-text"] span, span[dir]',
  vk: '[class*="message" i] [class*="text" i], [class*="im-mess" i] span, p',
  telegram: '[class*="message" i] [class*="text" i], p, span'
}

function extractMsgText(node, type) {
  // v0.81.1: Если node содержит вложенные элементы с текстом — берём ТОЛЬКО leaf-текст
  // Это предотвращает склейку "Елена ДугинаА13:52" (имя+текст+время из wrapper)
  let raw = ''
  if (node.children && node.children.length > 2) {
    // Node-обёртка (>2 children) — ищем самый глубокий текстовый элемент
    const leaves = node.querySelectorAll ? node.querySelectorAll('span, p, [class*="text" i]') : []
    for (let li = leaves.length - 1; li >= Math.max(0, leaves.length - 5); li--) {
      if (leaves[li].children && leaves[li].children.length > 1) continue // не leaf
      const lt = (leaves[li].textContent || '').trim()
      if (lt.length >= 2 && lt.length <= 300 && !/^\d{1,2}:\d{2}$/.test(lt)) { raw = lt; break }
    }
  }
  if (!raw) raw = (node.textContent || '').trim()
  if (raw.length < 2 || raw.length > 500) return ''
  // Убираем встроенные timestamps из текста (MAX: "Ааа18:22" → "Ааа")
  const clean = raw.replace(/\s*\d{1,2}:\d{2}(:\d{2})?\s*/g, '').trim()
  if (clean.length < 2) return ''
  // Пропускаем чистые timestamp'ы
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) return ''
  // Пропускаем служебные тексты
  if (/^(typing|печатает|был[а]? в сети|online|в сети|оффлайн|offline|не в сети|ожидани[ея]\s+сети|connecting|reconnecting|updating|загрузк[аи]|обновлени[ея]|подключени[ея])$/i.test(clean)) return ''
  // v0.58.1: "три минуты назад", "час назад" — VK пишет время словами
  if (/\s+назад\s*$/i.test(clean) || /^(час|минуту?|секунду?)\s+назад$/i.test(clean)) return ''
  // v0.82.1: Per-messenger спам-фильтры (каждый мессенджер — свои паттерны)
  var perMsgSpam = EXTRACT_SPAM[type] || []
  for (var si = 0; si < perMsgSpam.length; si++) { if (perMsgSpam[si].test(clean)) return '' }
  return clean
}

module.exports = { EXTRACT_SPAM, QUICK_MSG_SELECTORS, extractMsgText }
