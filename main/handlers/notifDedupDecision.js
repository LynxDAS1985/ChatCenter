// v1.2.318: чистое (без Electron) решение «показывать уведомление или это дубль».
// Вынесено из notificationManager.showCustomNotification, чтобы покрыть тестом
// (паттерн проекта: notifResizeDecision.js, dockGeometry.js — чистая логика отдельно).
//
// ЗАЧЕМ: у ВЕБ-мессенджеров (ВК/WhatsApp/МАКС) одно сообщение ловят несколько независимых
// детекторов (наблюдатель списка чатов + наблюдатель открытого чата). Они шлют РАЗНЫЙ
// messageId/chatTag для одного и того же сообщения, поэтому обычный scope-ключ (с messageId)
// их не склеивает → приходили ДВЕ одинаковые карточки (баг: две «Ёу мэээээн» в ВК).
// Доп. ключ БЕЗ messageId/chatTag — только «мессенджер + отправитель + текст» — ловит такие
// кросс-детекторные дубли.
//
// НАТИВНЫЙ Telegram (messengerId === 'native_cc') НАМЕРЕННО НЕ трогаем: там реальные messageId,
// и два быстрых ОДИНАКОВЫХ сообщения (например «ок» / «ок») должны показываться ОБА.
//
// v1.2.319: MAX ТОЖЕ исключён из кросс-ключа. MAX намеренно кодирует событие в messageId
// (`max-sidebar:<sender>:<unread>`, см. consoleMessageHandler.js) — так он отличает два ОДИНАКОВЫХ
// по тексту сообщения подряд (фикс v1.2.55). Кросс-ключ игнорирует messageId, поэтому без этого
// исключения он снова склеивал бы одинаковые MAX-сообщения (регресс v1.2.55). VK не затронут:
// у VK messageId — это отпечаток содержимого, он НЕ начинается с `max-sidebar:`.

export function normalizeScopePart(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Решает, является ли уведомление дублем недавнего, и какие ключи запомнить.
 * @param {Object} p
 * @param {string} p.dedupScope   — scope из buildNotificationScope (может включать mid:)
 * @param {string} p.messengerId
 * @param {string} p.senderName
 * @param {string} p.title
 * @param {string} p.normalizedBody — тело без времени
 * @param {string} p.body           — тело как есть (запасной вариант)
 * @param {string} p.messageId      — id сообщения (у MAX это `max-sidebar:...` — событийный)
 * @param {number} p.now            — Date.now()
 * @param {Map}    p.dedupMap       — Map<key, ts>
 * @param {number} [p.ttlMs=8000]
 * @returns {{duplicate:true, hitKey:string, age:number} | {duplicate:false, keysToSet:string[]}}
 */
export function decideNotifDedup({ dedupScope, messengerId, senderName, title, normalizedBody, body, messageId, now, dedupMap, ttlMs = 8000 }) {
  const bodyPart = (normalizedBody || body || '').slice(0, 60)
  const dedupKey = String(dedupScope || '') + ':' + bodyPart
  // Кросс-детекторный ключ ТОЛЬКО для веб-мессенджеров (не native), КРОМЕ MAX:
  // MAX сам отличает одинаковые сообщения через messageId `max-sidebar:...` (см. коммент выше).
  const isMaxEventId = String(messageId || '').startsWith('max-sidebar:')
  const crossKey = (messengerId && messengerId !== 'native_cc' && !isMaxEventId)
    ? messengerId + ':web:' + normalizeScopePart(senderName || title) + ':' + bodyPart
    : null
  for (const k of [dedupKey, crossKey]) {
    if (k && dedupMap.has(k) && now - dedupMap.get(k) < ttlMs) {
      return { duplicate: true, hitKey: k, age: now - dedupMap.get(k) }
    }
  }
  return { duplicate: false, keysToSet: crossKey ? [dedupKey, crossKey] : [dedupKey] }
}
