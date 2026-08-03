// v0.95.31: множественный typing-индикатор «Иван и Маша печатают...»
//
// Эталоны (production messengers 2026):
// - Telegram Web K: 1 → "Иван печатает", 2-3 → "Иван и Маша печатают", 4+ → "3 печатают"
// - Telegram Desktop: тот же паттерн (history_widget.cpp showSendAction)
// - WhatsApp Web: 1 → "Иван печатает", 2+ → "несколько печатают"
// - Discord: 1-3 → "Иван, Маша и Петя печатают", 4+ → "Несколько людей печатают"
//
// Берём Telegram-style как самый узнаваемый юзеру.
//
// Вход: { [userId]: { senderName, at } } — Map / object от nativeStoreIpc handler tg:typing.
// Старые typing-записи (> TYPING_TIMEOUT_MS старые) считаются истёкшими — TDLib шлёт
// updateChatAction каждые 5-6 сек, если давно не было — юзер скорее всего закончил.
//
// Возвращает строку или null если никто не печатает.

const TYPING_TIMEOUT_MS = 6500 // 6.5с — TDLib шлёт обновление каждые 5-6с

// v1.2.170: глагол под тип действия собеседника (ключ приходит от бэкенда, tdlibClient.js).
// Неизвестный/пустой ключ → «печатает...» (безопасный откат, старое поведение).
const ACTION_VERB = {
  typing: 'печатает...',
  voice: 'записывает голосовое...',
  video_note: 'записывает видеосообщение...',
  video: 'отправляет видео...',
  photo: 'отправляет фото...',
  document: 'отправляет файл...',
  sticker: 'выбирает стикер...',
  game: 'играет...',
  location: 'выбирает геопозицию...',
  contact: 'выбирает контакт...',
}

// v1.2.171: множественная форма — когда НЕСКОЛЬКО собеседников делают ОДНО и то же
// действие («Иван и Маша записывают голосовое...»). Если действия разные — общий откат
// «печатают...» (нельзя одним глаголом описать «печатает» + «отправляет фото»).
const ACTION_VERB_PLURAL = {
  typing: 'печатают...',
  voice: 'записывают голосовое...',
  video_note: 'записывают видеосообщение...',
  video: 'отправляют видео...',
  photo: 'отправляют фото...',
  document: 'отправляют файл...',
  sticker: 'выбирают стикер...',
  game: 'играют...',
  location: 'выбирают геопозицию...',
  contact: 'выбирают контакт...',
}

// Общий глагол для группы: если у ВСЕХ активных одно действие — его множественная
// форма; иначе безопасный откат «печатают...».
function pluralVerb(active) {
  const first = active[0].action
  const same = active.every(a => a.action === first)
  return (same && ACTION_VERB_PLURAL[first]) || 'печатают...'
}

export function formatTypingUsers(typingMap, { nowMs = Date.now() } = {}) {
  if (!typingMap || typeof typingMap !== 'object') return null

  // Собираем активных (не истёкшие). senderName может быть пустым — Telegram fallback "Кто-то".
  const active = []
  for (const userId of Object.keys(typingMap)) {
    const entry = typingMap[userId]
    if (!entry) continue
    const at = Number(entry.at) || 0
    if (at && nowMs - at > TYPING_TIMEOUT_MS) continue
    active.push({
      userId,
      name: (entry.senderName && String(entry.senderName).trim()) || 'Кто-то',
      action: entry.action || 'typing',
    })
  }

  if (active.length === 0) return null

  if (active.length === 1) {
    // v1.2.170: один собеседник — показываем КОНКРЕТНОЕ действие («записывает голосовое...» и т.п.)
    return `${active[0].name} ${ACTION_VERB[active[0].action] || ACTION_VERB.typing}`
  }
  // v1.2.171: несколько собеседников — общий глагол, если действие у всех одно
  const verb = pluralVerb(active)
  if (active.length === 2) {
    return `${active[0].name} и ${active[1].name} ${verb}`
  }
  if (active.length === 3) {
    return `${active[0].name}, ${active[1].name} и ${active[2].name} ${verb}`
  }
  // 4+: «N человек печатают/отправляют фото…»
  return `${active.length} человек ${verb}`
}
