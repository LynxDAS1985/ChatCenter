/**
 * Обработка сообщений — чистые функции без React зависимостей.
 * Дедупликация, sender-strip, фильтр своих сообщений.
 */

/**
 * Проверяет дедупликацию по точному ключу.
 * @returns {boolean} true = дубль, блокировать
 */
export function isDuplicateExact(messengerId, text, recentMap, ttlMs = 10000) {
  const key = messengerId + ':' + text.slice(0, 60)
  const now = Date.now()
  const prev = recentMap.get(key)
  if (prev && now - prev < ttlMs) return { blocked: true, age: now - prev }
  return { blocked: false, key, now }
}

/**
 * Проверяет дедупликацию по подстроке — VK parent+child.
 * "Елена ДугинаТекст" (parent) + "Текст" (child) → дубль.
 * @returns {{ blocked: boolean, prevLen?: number, age?: number }}
 */
export function isDuplicateSubstring(messengerId, text, recentMap, ttlMs = 5000) {
  const textShort = text.slice(0, 80)
  const now = Date.now()
  const prefix = messengerId + ':'
  for (const [k, ts] of recentMap) {
    if (now - ts > ttlMs || !k.startsWith(prefix)) continue
    const prevText = k.slice(prefix.length)
    if (prevText.length > 5 && textShort.length > 5 && (prevText.includes(textShort) || textShort.includes(prevText))) {
      return { blocked: true, prevLen: prevText.length, age: now - ts }
    }
  }
  return { blocked: false }
}

/**
 * Убирает имя sender из начала текста (VK склеивает имя+текст).
 * @returns {{ text: string, stripped: boolean }}
 */
/**
 * Убирает статус VK из имени sender.
 * "Елена Дугиназаходила 6 минут назад" → "Елена Дугина"
 * "Елена Дугинаonline" → "Елена Дугина"
 */
export function cleanSenderStatus(name) {
  if (!name) return name
  return name
    // v0.80.4: "заходил/а" с или без "назад" (enrichment может обрезать)
    .replace(/(заходил[аи]?\s*.*)/i, '')
    .replace(/\s*(online|offline|был[аи]?\s*(в\s+сети)?|в\s+сети|печатает|typing|записывает голосовое)\s*$/i, '')
    .trim()
}

export function stripSenderFromText(text, senderName) {
  if (!senderName || senderName.length < 3) return { text, stripped: false }
  if (text.startsWith(senderName)) {
    const clean = text.slice(senderName.length).trim()
    return { text: clean, stripped: true }
  }
  return { text, stripped: false }
}

/**
 * Определяет является ли сообщение "своим" (от пользователя, не от собеседника).
 * Работает для VK личных чатов: текст начинается с "Имя Фамилия" но НЕ с sender.
 * @returns {boolean} true = своё сообщение, блокировать
 */
export function isOwnMessage(text, senderName, fromNotifAPI) {
  if (!senderName || senderName.length < 3 || fromNotifAPI) return false
  if (text.startsWith(senderName)) return false // чужое
  return /^[А-ЯA-Z][а-яa-z]+\s[А-ЯA-Z][а-яa-z]/.test(text)
}

/**
 * Очищает старые записи из recentMap (>ttlMs).
 */
export function cleanupRecentMap(recentMap, ttlMs = 30000) {
  const now = Date.now()
  if (recentMap.size > 50) {
    for (const [k, ts] of recentMap) {
      if (now - ts > ttlMs) recentMap.delete(k)
    }
  }
}
