// VK-only deep diagnostics for the active chat DOM.
// This module does not emit notifications. It only writes evidence to monitor-diag.

const VK_CHAT_CONTAINER_SELECTORS = [
  '.ConvoMain__history',
  '[class*="ConvoMain__history"]',
  '[class*="im-page--chat-body"]',
  '[class*="im_msg_list"]',
  '[class*="ChatBody"]',
  '[class*="im-history"]',
  '[class*="ConversationBody"]',
  '[class*="chat-body"]',
  '[class*="im-page--chat"]',
  '[class*="HistoryMessages"]',
]

const VK_MESSAGE_SELECTORS = [
  '[data-msgid]',
  '[data-message-id]',
  '[class*="ConvoMessage"]',
  '[class*="im-mess"]',
  '[class*="im_msg"]',
  '[class*="im-mes"]',
  '[class*="Message"]',
  '[class*="message"]',
]

function cls(el) {
  return typeof el?.className === 'string' ? el.className : ''
}

function attr(el, name) {
  try { return el?.getAttribute?.(name) || '' } catch { return '' }
}

function vkOutgoingMarker(el) {
  let cur = el
  for (let i = 0; i < 8 && cur; i++) {
    const c = cls(cur)
    const dataOut = attr(cur, 'data-out') || attr(cur, 'data-outgoing') || attr(cur, 'data-own')
    const aria = attr(cur, 'aria-label')
    const classMatch = c.match(/(^|\s)(ConvoStack--out|ConvoMessage--out|im-mess_out|message_out)(\s|$)/i)
    if (classMatch) return { result: true, reason: `class:${classMatch[2]}`, className: c }
    if (/^(1|true|yes)$/i.test(dataOut)) return { result: true, reason: 'data-outgoing', className: c, dataOut }
    if (/вы отправили|you sent|исходящ/i.test(aria)) return { result: true, reason: 'aria-outgoing', className: c, aria }
    cur = cur.parentElement
  }
  return { result: false, reason: '', className: '' }
}

function rectInfo(el) {
  try {
    const r = el?.getBoundingClientRect?.()
    if (!r) return ''
    return `rect=${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}`
  } catch {
    return ''
  }
}

function nodeName(el) {
  if (!el) return 'null'
  const bits = [String(el.tagName || el.nodeName || 'node').toLowerCase()]
  if (el.id) bits.push(`#${el.id}`)
  const c = cls(el)
  if (c) bits.push(`.${c.replace(/\s+/g, '.')}`)
  const role = attr(el, 'role')
  const aria = attr(el, 'aria-label')
  const testId = attr(el, 'data-testid')
  const msgId = attr(el, 'data-msgid') || attr(el, 'data-message-id') || attr(el, 'data-id')
  if (role) bits.push(`role=${role}`)
  if (testId) bits.push(`testid=${testId}`)
  if (msgId) bits.push(`msgid=${msgId}`)
  if (aria) bits.push(`aria=${aria}`)
  const rect = rectInfo(el)
  if (rect) bits.push(rect)
  return bits.join(' ')
}

function parentChain(el, stop) {
  const chain = []
  let cur = el
  for (let i = 0; i < 8 && cur; i++) {
    chain.push(nodeName(cur))
    if (cur === stop) break
    cur = cur.parentElement
  }
  return chain.join(' <= ')
}

function findVkChatContainer() {
  for (const selector of VK_CHAT_CONTAINER_SELECTORS) {
    try {
      const el = document.querySelector(selector)
      if (el) return { el, selector }
    } catch {}
  }
  return { el: null, selector: '' }
}

function findMessageEl(node, container) {
  if (!node || node.nodeType !== 1) return null
  for (const selector of VK_MESSAGE_SELECTORS) {
    try {
      if (node.matches?.(selector)) return node
      const closest = node.closest?.(selector)
      if (closest && (!container || container.contains(closest))) return closest
      const inner = node.querySelector?.(selector)
      if (inner && (!container || container.contains(inner))) return inner
    } catch {}
  }
  return null
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function extractLeafText(root) {
  if (!root) return ''
  const selectors = [
    '[class*="text"]',
    '[class*="Text"]',
    '[class*="body"]',
    '[class*="Body"]',
    '[class*="content"]',
    '[class*="Content"]',
    'p',
    'span',
  ]
  const candidates = []
  for (const selector of selectors) {
    try { candidates.push(...Array.from(root.querySelectorAll(selector))) } catch {}
  }
  if (!candidates.length) candidates.push(root)
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i]
    const text = cleanText(el.textContent)
    if (!text || text.length < 1) continue
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) continue
    if (/^(сегодня|вчера|позавчера|новые сообщения)$/i.test(text)) continue
    if (/^(online|в сети|печатает|typing)$/i.test(text)) continue
    return text
  }
  return ''
}

function isOutgoingMessage(el) {
  return vkOutgoingMarker(el).result
}

function outgoingEvidence(el) {
  const marker = vkOutgoingMarker(el)
  const c = marker.className || cls(el)
  const dataOut = attr(el, 'data-out') || attr(el, 'data-outgoing') || attr(el, 'data-own')
  const aria = attr(el, 'aria-label')
  const classMatch = marker.reason.startsWith('class:') ? marker.reason.slice(6) : ''
  const dataMatch = /^(1|true|yes)$/i.test(dataOut)
  const ariaMatch = /you sent/i.test(aria) || /вы отправили|исходящ/i.test(aria)
  return {
    result: !!(marker.result || dataMatch || ariaMatch),
    reason: marker.reason || (dataMatch ? 'data-outgoing' : ariaMatch ? 'aria-outgoing' : ''),
    className: c,
    dataOut,
    aria,
    checks: {
      classBroadOutOwnSelfSent: !!classMatch,
      classExactVkOutgoing: !!classMatch,
      dataOutTrue: dataMatch,
      ariaOutgoing: ariaMatch,
    },
  }
}

function authorFromMessage(el) {
  if (!el) return ''
  const selectors = [
    '[class*="ConvoMessageHeader"] [class*="PeerTitle"]',
    '[class*="ConvoMessageHeader"] [class*="author"]',
    '[class*="ConvoMessageHeader"] a',
    '[class*="PeerTitle"]',
    '[class*="author"]',
  ]
  for (const selector of selectors) {
    try {
      const node = el.querySelector?.(selector)
      const text = cleanText(node?.textContent)
      if (text && text.length < 120) return text
    } catch {}
  }
  const raw = cleanText(el.textContent)
  const leaf = extractLeafText(el)
  if (raw && leaf && raw !== leaf && raw.endsWith(leaf)) return cleanText(raw.slice(0, raw.length - leaf.length))
  return ''
}

function buildNotifyDecision(info) {
  const decision = {
    source: 'vk-dom-diagnostics',
    wouldEmit: false,
    emitBlockedBy: '',
    expectedNext: '',
  }
  if (info.reason === 'outside-container' || info.reason === 'no-message-node') {
    decision.emitBlockedBy = info.reason
    return decision
  }
  if (!info.text) {
    decision.emitBlockedBy = 'no-text'
    return decision
  }
  if (info.baselineHit) {
    decision.emitBlockedBy = 'baseline-existing-message'
    return decision
  }
  if (info.outgoing) {
    decision.emitBlockedBy = 'outgoing-own-message'
    return decision
  }
  decision.emitBlockedBy = 'diagnostic-read-only'
  decision.expectedNext = 'notification event is not emitted by vkDiagnostics'
  return decision
}

function messageId(el) {
  return attr(el, 'data-msgid') || attr(el, 'data-message-id') || attr(el, 'data-id') || ''
}

function fingerprintMessage(el) {
  if (!el) return ''
  const id = messageId(el)
  if (id) return `id:${id}`
  return [
    isOutgoingMessage(el) ? 'out' : 'in',
    cls(el),
    extractLeafText(el),
  ].join('|')
}

function getHeaderSnapshot() {
  const nameSelectors = [
    '[class*="ConvoHeader"] [class*="Title"]',
    '[class*="ConvoHeader"] [class*="title"]',
    '[class*="ConvoMain"] [class*="Title"]',
    '[class*="im-page--title"]',
    'h1',
    'h2',
  ]
  let sender = ''
  for (const selector of nameSelectors) {
    try {
      const el = document.querySelector(selector)
      const text = cleanText(el?.textContent)
      if (text && text.length < 120) { sender = text; break }
    } catch {}
  }
  let avatar = ''
  try {
    const img = document.querySelector('[class*="ConvoHeader"] img[src], [class*="ConvoMain"] img[src], img[src*="vkuser"], img[src*="userapi"]')
    avatar = img?.src || ''
  } catch {}
  return { sender, avatar, title: document.title || '', url: location.href }
}

function collectBaseline(container) {
  const set = new Set()
  let total = 0
  let incoming = 0
  let outgoing = 0
  for (const selector of VK_MESSAGE_SELECTORS) {
    let nodes = []
    try { nodes = Array.from(container.querySelectorAll(selector)) } catch {}
    for (const node of nodes) {
      const fp = fingerprintMessage(node)
      if (!fp || set.has(fp)) continue
      set.add(fp)
      total += 1
      if (isOutgoingMessage(node)) outgoing += 1
      else incoming += 1
    }
  }
  return { set, total, incoming, outgoing }
}

function describeCandidate(node, messageEl, container, baseline, reason) {
  const text = extractLeafText(messageEl || node)
  const outgoingInfo = messageEl ? outgoingEvidence(messageEl) : outgoingEvidence(node)
  const outgoing = !!(messageEl && outgoingInfo.result)
  const fp = messageEl ? fingerprintMessage(messageEl) : ''
  const header = getHeaderSnapshot()
  const info = {
    reason,
    text,
    authorFromMessage: authorFromMessage(messageEl),
    nodeTextRaw: node?.textContent || '',
    messageTextRaw: messageEl?.textContent || '',
    messageOuterHTML: messageEl?.outerHTML || '',
    outgoing,
    outgoingEvidence: outgoingInfo,
    baselineHit: !!(fp && baseline?.has(fp)),
    fingerprint: fp,
    messageId: messageEl ? messageId(messageEl) : '',
    node: nodeName(node),
    messageNode: nodeName(messageEl),
    parentChain: parentChain(messageEl || node, container),
    headerSender: header.sender,
    headerAvatar: header.avatar,
    title: header.title,
    url: header.url,
  }
  info.notifyDecision = buildNotifyDecision(info)
  info.wouldEmit = info.notifyDecision.wouldEmit
  info.emitBlockedBy = info.notifyDecision.emitBlockedBy
  return info
}

function stringifyDetails(obj) {
  try { return JSON.stringify(obj) } catch { return String(obj) }
}

function createVkDiagnostics(options = {}) {
  const sendMonitorDiag = options.sendMonitorDiag || function() {}
  const isMonitorReady = options.isMonitorReady || function() { return false }
  let observer = null
  let baseline = new Set()
  let boundContainer = null
  let boundSelector = ''
  let bindTs = 0
  let mutationSeq = 0

  function log(label, payload) {
    sendMonitorDiag(`[VK-DIAG] ${label} ${stringifyDetails(payload)}`)
  }

  function stop(reason = 'stop') {
    if (observer) {
      try { observer.disconnect() } catch {}
      observer = null
      log('observer-stop', { reason, selector: boundSelector, url: location.href })
    }
    boundContainer = null
    boundSelector = ''
    baseline = new Set()
  }

  function start(reason = 'start') {
    stop(`restart:${reason}`)
    const found = findVkChatContainer()
    if (!found.el) {
      log('container-not-found', {
        reason,
        url: location.href,
        title: document.title || '',
        checkedSelectors: VK_CHAT_CONTAINER_SELECTORS,
        header: getHeaderSnapshot(),
      })
      return false
    }
    boundContainer = found.el
    boundSelector = found.selector
    bindTs = Date.now()
    const snap = collectBaseline(boundContainer)
    baseline = snap.set
    const header = getHeaderSnapshot()
    log('observer-bound', {
      reason,
      selector: boundSelector,
      container: nodeName(boundContainer),
      baselineTotal: snap.total,
      baselineIncoming: snap.incoming,
      baselineOutgoing: snap.outgoing,
      baselineFingerprints: Array.from(baseline),
      header,
      url: location.href,
      monitorReady: isMonitorReady(),
    })
    observer = new MutationObserver((mutations) => {
      mutationSeq += 1
      const added = []
      const changed = []
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of Array.from(m.addedNodes || [])) {
            if (node.nodeType === 1) added.push(node)
          }
        } else if (m.type === 'characterData' && m.target?.parentElement) {
          changed.push(m.target.parentElement)
        }
      }
      log('mutation-start', {
        seq: mutationSeq,
        sinceBindMs: Date.now() - bindTs,
        mutationCount: mutations.length,
        addedCount: added.length,
        characterDataCount: changed.length,
        monitorReady: isMonitorReady(),
        selector: boundSelector,
        url: location.href,
      })
      const nodes = added.concat(changed)
      if (!nodes.length) {
        log('mutation-empty', { seq: mutationSeq })
        return
      }
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (!boundContainer || !boundContainer.contains(node)) {
          const info = describeCandidate(node, null, boundContainer, baseline, 'outside-container')
          log('notify-decision', info.notifyDecision)
          log('candidate-skip', info)
          continue
        }
        const msg = findMessageEl(node, boundContainer)
        if (!msg) {
          const info = describeCandidate(node, null, boundContainer, baseline, 'no-message-node')
          log('notify-decision', info.notifyDecision)
          log('candidate-skip', info)
          continue
        }
        const info = describeCandidate(node, msg, boundContainer, baseline, 'candidate')
        if (!info.text) {
          info.reason = 'no-text'
          info.notifyDecision = buildNotifyDecision(info)
          info.wouldEmit = info.notifyDecision.wouldEmit
          info.emitBlockedBy = info.notifyDecision.emitBlockedBy
          log('notify-decision', info.notifyDecision)
          log('candidate-skip', info)
          continue
        }
        if (info.baselineHit) {
          info.reason = 'baseline-existing-message'
          info.notifyDecision = buildNotifyDecision(info)
          info.wouldEmit = info.notifyDecision.wouldEmit
          info.emitBlockedBy = info.notifyDecision.emitBlockedBy
          log('notify-decision', info.notifyDecision)
          log('candidate-skip', info)
          continue
        }
        if (info.outgoing) {
          info.reason = 'outgoing-own-message'
          info.notifyDecision = buildNotifyDecision(info)
          info.wouldEmit = info.notifyDecision.wouldEmit
          info.emitBlockedBy = info.notifyDecision.emitBlockedBy
          log('notify-decision', info.notifyDecision)
          log('candidate-skip', info)
          baseline.add(info.fingerprint)
          continue
        }
        info.reason = 'new-incoming-candidate-no-emit'
        info.notifyDecision = buildNotifyDecision(info)
        info.wouldEmit = info.notifyDecision.wouldEmit
        info.emitBlockedBy = info.notifyDecision.emitBlockedBy
        log('notify-decision', info.notifyDecision)
        log('candidate-new-incoming', info)
        if (info.fingerprint) baseline.add(info.fingerprint)
      }
    })
    observer.observe(boundContainer, { childList: true, subtree: true, characterData: true })
    return true
  }

  function onNavigation(oldUrl, newUrl) {
    log('navigation', { oldUrl, newUrl, title: document.title || '' })
    stop('navigation')
  }

  function runManual() {
    const found = findVkChatContainer()
    const snap = found.el ? collectBaseline(found.el) : { set: new Set(), total: 0, incoming: 0, outgoing: 0 }
    log('manual-snapshot', {
      found: !!found.el,
      selector: found.selector,
      container: nodeName(found.el),
      currentBaselineTotal: baseline.size,
      domTotal: snap.total,
      domIncoming: snap.incoming,
      domOutgoing: snap.outgoing,
      domFingerprints: Array.from(snap.set),
      header: getHeaderSnapshot(),
      url: location.href,
      title: document.title || '',
      observerActive: !!observer,
      boundSelector,
      boundContainer: nodeName(boundContainer),
    })
  }

  return { start, stop, onNavigation, runManual }
}

module.exports = { createVkDiagnostics }
