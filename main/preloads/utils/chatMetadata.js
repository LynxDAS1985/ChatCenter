// v0.84.3: Extracted from monitor.preload.js — chat metadata (sender name, avatar)

// Извлечь имя отправителя из заголовка активного чата (preload world имеет доступ к DOM)
function getActiveChatSender() {
  try {
    // 1. Header активного чата — расширенные селекторы (TG/VK/MAX/Generic)
    const headerSels = [
      // v0.59.2: VK реальные классы — ConvoHeader__info содержит "Имя\nonline"
      '.ConvoHeader__info',
      // v0.60.0: MAX — .topbar .headerWrapper содержит "Окно чата с ИмяФамилия"
      '.topbar .headerWrapper',
      '.chat-info .peer-title', '.topbar .peer-title',
      '.topbar [class*="info" i] [class*="title" i]',
      '.topbar [class*="info" i] [class*="name" i]',
      '[class*="chat-header" i] [class*="title" i]',
      '[class*="top-bar" i] [class*="title" i]',
      '[class*="topbar" i] [class*="name" i]',
      '[class*="chat-header" i] [class*="name" i]',
      'header [class*="title" i]', 'header [class*="name" i]'
    ]
    for (const sel of headerSels) {
      const h = document.querySelector(sel)
      if (h) {
        let name = (h.textContent || '').trim()
        // v0.59.2: VK ConvoHeader__info содержит "Имяonline"/"Имябыл(а) в сети" — чистим
        name = name.replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|печатает|typing)\s*$/i, '').trim()
        // v0.60.0: MAX "Окно чата с ИмяФамилия" → убираем префикс
        name = name.replace(/^окно\s+чата\s+с\s+/i, '').trim()
        if (name && name.length >= 2 && name.length <= 80) return name
      }
    }
    // MAX fallback: .topbar содержит имя чата — ищем первый child div с коротким текстом
    const tb = document.querySelector('.topbar')
    if (tb) {
      const tbKids = tb.querySelectorAll('div, span, h1, h2, h3')
      for (let i = 0; i < tbKids.length && i < 20; i++) {
        const t = (tbKids[i].textContent || '').trim()
        if (t.length < 2 || t.length > 60) continue
        if (/^(был|была|в сети|online|offline|печатает|typing|окно чата)/i.test(t)) continue
        return t
      }
    }
    // 2. Активный/выделенный чат в sidebar
    const activeSels = ['.chatlist-chat.active', '.chatlist-chat.selected', '[class*="chat"][class*="active" i]', '[class*="dialog"][class*="active" i]']
    for (const sel of activeSels) {
      const act = document.querySelector(sel)
      if (!act) continue
      const pt = act.querySelector('.peer-title, [class*="title" i], [class*="name" i]')
      const nm = pt ? (pt.textContent || '').trim() : ''
      if (nm && nm.length >= 2 && nm.length <= 80) return nm
    }
  } catch (e) {}
  return ''
}

// Извлечь аватарку из заголовка активного чата
function getActiveChatAvatar() {
  try {
    // 1. Header: аватарка в chat-info/topbar/header
    const avImg = document.querySelector('.chat-info img.avatar-photo, .topbar img.avatar-photo, .chat-info [class*="avatar" i] img, [class*="chat-header" i] img[class*="avatar" i], header img[class*="avatar" i], header [class*="avatar" i] img')
    if (avImg && avImg.src && avImg.src.startsWith('http') && !avImg.src.includes('emoji')) return avImg.src
    // Canvas avatar
    const avCanvas = document.querySelector('.chat-info canvas.avatar-photo, .topbar canvas.avatar-photo')
    if (avCanvas && avCanvas.width > 10) {
      try { return avCanvas.toDataURL('image/png') } catch (e) {}
    }
    // 2. Активный чат в sidebar
    const act = document.querySelector('.chatlist-chat.active, .chatlist-chat.selected, [class*="chat"][class*="active" i]')
    if (act) {
      const avAct = act.querySelector('img.avatar-photo, [class*="avatar"] img, canvas.avatar-photo')
      if (avAct && avAct.tagName === 'IMG' && avAct.src && avAct.src.startsWith('http')) return avAct.src
      if (avAct && avAct.tagName === 'CANVAS' && avAct.width > 10) {
        try { return avAct.toDataURL('image/png') } catch (e) {}
      }
    }
  } catch (e) {}
  return ''
}

module.exports = { getActiveChatSender, getActiveChatAvatar }
