// v0.95.21: бейдж непрочитанных для списка чатов.
//
// Для обычных чатов это просто `chat.unreadCount` от TDLib.
//
// Для форум-групп (`chat.isForum=true`) TDLib `chat.unread_count` агрегирует
// ВСЮ историю по всем темам — включая темы которые юзер никогда не открывал.
// Это может давать огромные числа (например 6.2K), не имеющие смысла для юзера.
//
// Telegram Desktop / Web в форум-группах показывают **число тем с непрочитанным**.
// Например, у форум-чата 2 темы имеют unread > 0 → бейдж = 2 (а не сумма
// сообщений 6200 и не сумма по темам 10).
//
// Эта функция возвращает то же что Telegram Desktop. Источник данных —
// `store.forumTopics[chatId]` (живой массив, обновляется при push/markTopicRead).
// Пока темы не загружены — возвращает 0 (Telegram Desktop тоже так делает).
//
// chat.unreadCount остаётся как было (TDLib aggregate) — НЕ трогаем, чтобы не
// сломать логику markRead/chat-unread-sync.

export function getDisplayUnreadCount(chat, forumTopics) {
  if (!chat) return 0
  if (chat.isForum) {
    const topics = forumTopics?.[chat.id]
    if (!Array.isArray(topics) || topics.length === 0) return 0
    let count = 0
    for (const t of topics) {
      if ((Number(t?.unreadCount) || 0) > 0) count++
    }
    return count
  }
  return Number(chat.unreadCount) || 0
}
