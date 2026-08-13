// v1.2.232: «Заметка о клиенте» в карточке контакта.
// Хранится ЛОКАЛЬНО в localStorage (как цветовая тема — themeColor.js), на этом
// компьютере. Ключ — по полному chatId ('{accountId}:{rawId}'), чтобы заметки не
// путались между разными контактами и аккаунтами. Наружу (в сеть) НЕ уходит.
//
// Пустая заметка стирает запись (не копим мусор). Любой сбой хранилища — тихий
// откат к пустой строке (карточка продолжает работать без заметки).
const KEY = (chatId) => `cc:contact-note:${chatId}`

export function getContactNote(chatId) {
  if (!chatId) return ''
  try { return localStorage.getItem(KEY(chatId)) || '' } catch (_) { return '' }
}

export function setContactNote(chatId, note) {
  if (!chatId) return
  try {
    const v = String(note ?? '')
    if (v.trim()) localStorage.setItem(KEY(chatId), v)
    else localStorage.removeItem(KEY(chatId))
  } catch (_) { /* приватный режим / переполнение — заметка просто не сохранится */ }
}
