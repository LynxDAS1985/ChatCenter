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
    })
  }

  if (active.length === 0) return null

  if (active.length === 1) {
    return `${active[0].name} печатает...`
  }
  if (active.length === 2) {
    return `${active[0].name} и ${active[1].name} печатают...`
  }
  if (active.length === 3) {
    return `${active[0].name}, ${active[1].name} и ${active[2].name} печатают...`
  }
  // 4+: «N человек печатают»
  return `${active.length} человек печатают...`
}
