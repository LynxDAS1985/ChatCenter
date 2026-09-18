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
// v1.2.474: ИСКЛЮЧЕНИЕ MAX ОСЛАБЛЕНО ТОЧЕЧНО — копия MAX кросс-ключ СМОТРИТ, но НЕ КЛАДЁТ,
// и при совпадении СЪЕДАЕТ его (одноразовый пропуск, поле `consumeKey`).
//
// ЖАЛОБА 2026-09-17: на одно сообщение МАКСа («Жди оплату» от 15:25) пришли ДВЕ карточки, причём
// на одной было фото отправителя, а на другой — логотип МАКСа. Журнал показал ровно это:
//   • копия из быстрого наблюдателя — БЕЗ номера сообщения, метка `sender:…`, фото из нашего кэша;
//   • копия из наблюдателя списка чатов — с событийным номером `max-sidebar:…`, метка `mid:…`,
//     фото только ССЫЛКОЙ (`https://i.oneme.ru/…`) → карточка показалась с логотипом.
// Кросс-ключ («мессенджер+отправитель+текст») поймал бы эту пару, но для MAX он был выключен
// ЦЕЛИКОМ — и на чтение тоже. Первая копия ключ положила, вторая его не посмотрела.
//
// ПОЧЕМУ ИМЕННО «СМОТРИТ, НО НЕ КЛАДЁТ, И СЪЕДАЕТ»:
//   • НЕ КЛАДЁТ → две подряд ОДИНАКОВЫЕ сообщения из списка чатов (у них РАЗНЫЕ событийные
//     номера) никогда не столкнутся по кросс-ключу — защита v1.2.55/v1.2.319 цела;
//   • СЪЕДАЕТ → ключ, положенный быстрым наблюдателем, гасит ровно ОДНУ парную копию. Следующее
//     такое же сообщение снова положит свой ключ и снова покажется. Без съедания второе
//     одинаковое сообщение пропало бы совсем.
//
// v1.2.319 (история): MAX был исключён из кросс-ключа. MAX намеренно кодирует событие в messageId
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
  const crossKey = (messengerId && messengerId !== 'native_cc')
    ? messengerId + ':web:' + normalizeScopePart(senderName || title) + ':' + bodyPart
    : null
  // Кладут кросс-ключ все веб-мессенджеры, КРОМЕ копий MAX с событийным номером (см. шапку).
  const keysToSet = (crossKey && !isMaxEventId) ? [dedupKey, crossKey] : [dedupKey]
  for (const k of [dedupKey, crossKey]) {
    if (k && dedupMap.has(k) && now - dedupMap.get(k) < ttlMs) {
      const viaCross = k === crossKey && k !== dedupKey
      return {
        duplicate: true, hitKey: k, age: now - dedupMap.get(k),
        // Одноразовость — только для MAX: гасим ровно одну парную копию, следующее такое же
        // сообщение снова покажется (иначе был бы регресс v1.2.55).
        consumeKey: (viaCross && isMaxEventId) ? k : null,
        reason: viaCross
          ? (isMaxEventId ? 'та же пара «отправитель+текст» из другой двери (MAX)' : 'кросс-детекторный дубль')
          : 'тот же ключ',
      }
    }
  }
  return { duplicate: false, keysToSet }
}

/**
 * v1.2.474: какой УЖЕ ПОКАЗАННОЙ карточке не хватает фото отправителя.
 *
 * Зачем: когда вторую копию гасим как дубль, у неё может быть фото, которого не было у первой
 * (жалоба 2026-09-17: одна карточка с фото, другая с логотипом). Вместо потерянного фото —
 * дошлём его в уже висящую карточку.
 *
 * @param {Array} items — notifItems (последние показанные карточки)
 * @param {{messengerId:string, senderName:string, title:string, body:string}} p
 * @returns {string|null} id карточки, которой нужно фото; null — карточки нет либо фото уже есть
 */
export function findCardToImproveIcon(items, { messengerId, senderName, title, body }) {
  const who = normalizeScopePart(senderName || title), what = String(body || '').slice(0, 60)
  const list = Array.isArray(items) ? items : []
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]
    if (!it || it.messengerId !== messengerId) continue
    if (normalizeScopePart(it.senderName || it.title) !== who) continue
    if (String(it.body || '').slice(0, 60) !== what) continue
    return it.iconDataUrl ? null : (it.id || null)   // фото уже есть — улучшать нечего
  }
  return null
}
