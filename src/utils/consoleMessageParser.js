/**
 * Парсер console-message из WebView.
 * Распознаёт __CC_ префиксы и извлекает данные.
 */

/**
 * Определяет тип console-message из WebView.
 * @returns {{ type: string, data: any } | null}
 */
export function parseConsoleMessage(msg) {
  if (!msg || !msg.startsWith('__CC_')) return null

  // __CC_BADGE_BLOCKED__:N
  if (msg.startsWith('__CC_BADGE_BLOCKED__:')) {
    const val = parseInt(msg.split(':')[1], 10)
    return { type: 'badge_blocked', value: isNaN(val) ? null : val }
  }

  // __CC_ACCOUNT__:name
  if (msg.startsWith('__CC_ACCOUNT__:')) {
    return { type: 'account', name: msg.slice(15).trim() }
  }

  // __CC_SW_UNREGISTERED__:N
  if (msg.startsWith('__CC_SW_UNREGISTERED__:')) {
    return { type: 'sw_unregistered', count: parseInt(msg.split(':')[1], 10) || 0 }
  }

  // __CC_NOTIF_HOOK_OK__
  if (msg.startsWith('__CC_NOTIF_HOOK_OK__')) {
    return { type: 'notif_hook_ok' }
  }

  // __CC_NOTIF__JSON
  if (msg.startsWith('__CC_NOTIF__')) {
    try {
      const data = JSON.parse(msg.slice(12))
      return { type: 'notification', title: data.t || '', body: data.b || '', icon: data.i || '', tag: data.g || '' }
    } catch (e) {
      return { type: 'notification_error', error: e.message }
    }
  }

  // __CC_MSG__text
  if (msg.startsWith('__CC_MSG__')) {
    return { type: 'message', text: msg.slice(10).trim() }
  }

  // __CC_DIAG__text
  if (msg.startsWith('__CC_DIAG__')) {
    return { type: 'diagnostic', text: msg.slice(11).trim() }
  }

  // __CC_DOM_SCAN__JSON
  if (msg.startsWith('__CC_DOM_SCAN__')) {
    try {
      return { type: 'dom_scan', data: JSON.parse(msg.slice(14)) }
    } catch (e) {
      return { type: 'dom_scan', data: null }
    }
  }

  // Общий __CC_ префикс
  const prefixEnd = msg.indexOf('__', 4)
  const prefix = prefixEnd > 0 ? msg.slice(0, prefixEnd + 2) : msg.slice(0, 12)
  const body = msg.slice(prefix.length).trim()
  return { type: 'debug', prefix: prefix.trim(), body }
}

/**
 * Извлекает __CC_ prefix и body из сообщения.
 */
export function extractCCPrefix(msg) {
  if (!msg || !msg.startsWith('__CC_')) return null
  const prefixEnd = msg.indexOf('__', 4)
  const prefix = prefixEnd > 0 ? msg.slice(0, prefixEnd + 2) : msg.slice(0, 12)
  return { prefix: prefix.trim(), body: msg.slice(prefix.length).trim() }
}
