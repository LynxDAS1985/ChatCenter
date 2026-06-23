function shortText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit || 120)
}

function maxNodeLabel(el) {
  if (!el) return 'none'
  try {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null
    const tag = el.tagName || 'node'
    const c = typeof el.className === 'string' ? el.className.replace(/\s+/g, '.').slice(0, 60) : ''
    return tag + (c ? '.' + c : '') + '@' + Math.round(r && r.left || 0) + ',' + Math.round(r && r.top || 0) + ',' + Math.round(r && r.width || 0) + 'x' + Math.round(r && r.height || 0)
  } catch(e) { return 'node' }
}

function maxImageSummary(root) {
  try {
    const media = Array.from((root || document).querySelectorAll('img,canvas')).slice(0, 4)
    return media.map((el, i) => {
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null
      const src = el.src ? String(el.src).slice(0, 45) : ''
      return i + ':' + el.tagName + ':' + (el.naturalWidth || el.width || Math.round(r && r.width || 0)) + 'x' + (el.naturalHeight || el.height || Math.round(r && r.height || 0)) + ':' + src
    }).join(',')
  } catch(e) { return 'imgErr=' + shortText(e.message || e, 60) }
}

function maxLeafItems(root, limit) {
  const out = []
  try {
    const nodes = (root || document).querySelectorAll('span, div, p, h1, h2, h3, time')
    for (let i = 0; i < nodes.length && out.length < (limit || 80); i++) {
      const n = nodes[i]
      if (n.children && n.children.length > 4) continue
      const t = shortText(n.textContent, 100)
      if (!t) continue
      const r = n.getBoundingClientRect ? n.getBoundingClientRect() : null
      const c = typeof n.className === 'string' ? n.className.replace(/\s+/g, '.').slice(0, 40) : ''
      out.push({ text: t, cls: c, left: Math.round(r && r.left || 0), top: Math.round(r && r.top || 0), width: Math.round(r && r.width || 0), height: Math.round(r && r.height || 0) })
    }
  } catch(e) {}
  return out
}

function maxUnreadBadgeFromItems(items) {
  const nums = items.filter(x => /^[1-9]\d{0,3}$/.test(x.text) && (x.width <= 42 || /badge|indicator|counter/i.test(x.cls)))
  return nums.length ? nums[nums.length - 1].text : ''
}

function maxSidebarRows(limit) {
  const rows = []
  try {
    let roots = Array.from(document.querySelectorAll('nav, aside, [class*="navigation" i], [class*="sidebar" i], [class*="scrollListContent" i]'))
    if (!roots.length) roots = [document.body]
    const candidates = []
    roots.forEach(root => candidates.push(...Array.from(root.querySelectorAll('[class*="wrapper--withActions"], [role="listitem"], [role="presentation"], a, button'))))
    for (let i = 0; i < candidates.length && rows.length < (limit || 12); i++) {
      const row = candidates[i]
      const rect = row.getBoundingClientRect ? row.getBoundingClientRect() : null
      if (!rect || rect.width < 80 || rect.height < 28 || rect.height > 150 || rect.left > Math.max(560, window.innerWidth * 0.55)) continue
      const items = maxLeafItems(row, 30)
      const badge = maxUnreadBadgeFromItems(items)
      const hasAvatar = !!row.querySelector('img,canvas')
      const textItems = items.filter(x => x.text !== badge).slice(0, 5).map(x => x.text).join(' / ')
      if (!badge && !hasAvatar && textItems.length < 3) continue
      rows.push('#' + i + ' badge=' + (badge || '-') + ' avatar=' + hasAvatar + ' box=' + Math.round(rect.left) + ',' + Math.round(rect.top) + ',' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ' text=' + textItems.slice(0, 180) + ' media=' + maxImageSummary(row).slice(0, 160))
    }
  } catch(e) { rows.push('ERR ' + shortText(e.message || e, 100)) }
  return rows
}

function maxActiveMessages(limit) {
  const out = []
  try {
    const selectors = ['.history', '[class*="history" i]', '.openedChat', '[class*="openedChat" i]', '[class*="messageWrapper" i]', '[class*="messages" i]']
    let container = null
    for (let i = 0; i < selectors.length; i++) {
      const nodes = Array.from(document.querySelectorAll(selectors[i]))
      container = nodes.find(n => {
        const r = n.getBoundingClientRect ? n.getBoundingClientRect() : null
        return r && r.width > 250 && r.height > 180
      })
      if (container) break
    }
    if (!container) return ['container=none']
    const nodes = Array.from(container.querySelectorAll('[class*="message" i], [class*="bubble" i], [class*="text" i], p, span, div'))
    for (let i = nodes.length - 1; i >= 0 && out.length < (limit || 12); i--) {
      const n = nodes[i]
      if (n.children && n.children.length > 8) continue
      const t = shortText(n.textContent, 160)
      if (!t) continue
      const c = typeof n.className === 'string' ? n.className.replace(/\s+/g, '.').slice(0, 60) : ''
      const r = n.getBoundingClientRect ? n.getBoundingClientRect() : null
      out.push('msg@' + Math.round(r && r.left || 0) + ',' + Math.round(r && r.top || 0) + ',' + Math.round(r && r.width || 0) + 'x' + Math.round(r && r.height || 0) + ' cls=' + c + ' text=' + t)
    }
    out.unshift('container=' + maxNodeLabel(container) + ' nodes=' + nodes.length)
  } catch(e) { out.push('ERR ' + shortText(e.message || e, 100)) }
  return out
}

function createMaxSnapshotSender({ sendMonitorDiag, getMessengerType, getChatContainerEl, countUnread, getObserverTarget, isMonitorReady }) {
  let lastMaxSnapshotAt = 0
  return function sendMaxSnapshot(reason, force) {
    try {
      if (getMessengerType() !== 'max') return
      const now = Date.now()
      if (!force && now - lastMaxSnapshotAt < 2500) return
      lastMaxSnapshotAt = now
      const container = getChatContainerEl()
      const headerRoot = document.querySelector('.topbar, header')
      const activeHeader = shortText(headerRoot && headerRoot.textContent, 180)
      const unread = (() => { try { return JSON.stringify(countUnread('max')) } catch(e) { return 'countErr=' + shortText(e.message || e, 80) } })()
      sendMonitorDiag('[MAX-SNAPSHOT] reason=' + reason + ' url=' + location.href.slice(0, 120) + ' title=' + shortText(document.title, 80) + ' hidden=' + document.hidden + ' ready=' + isMonitorReady() + ' observer=' + (getObserverTarget() || 'unset') + ' cached=' + maxNodeLabel(container) + ' unread=' + unread + ' header=' + activeHeader + ' headerMedia=' + maxImageSummary(headerRoot).slice(0, 200) + ' rows=' + maxSidebarRows(8).join(' || ') + ' active=' + maxActiveMessages(10).join(' || '))
    } catch(e) {
      sendMonitorDiag('[MAX-SNAPSHOT] error=' + shortText(e.message || e, 120))
    }
  }
}

module.exports = { createMaxSnapshotSender, maxNodeLabel, shortText }
