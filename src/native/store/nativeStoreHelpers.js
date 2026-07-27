// v1.1.9: pure helpers + константы для nativeStore.js, вынесены чтобы хост-файл
// влез в лимит. До v1.1.9 эти функции и константы жили внутри nativeStore.js
// (1327 строк) — переехали без изменения поведения.
//
// Все функции в этом файле:
// - чистые (без скрытого state)
// - не зависят от React hooks
// - можно тестировать в jsdom без mounting компонента

// ── КОНСТАНТЫ ──────────────────────────────────────────────────────────────

export const NATIVE_SLOW_MS = 10000
export const TOPIC_READ_REFRESH_DELAYS_MS = [0, 700, 1500, 3000]

// v0.88.0: лимит = жёсткий потолок Telegram MTProto messages.getHistory (100).
// Источник: core.telegram.org/api/offsets. Просить больше бесполезно — API всё равно отдаст 100.
// Раньше было 500 → баннер «100 из 138» застревал, т.к. код ждал страницу которая никогда не придёт.
export const UNREAD_WINDOW_MAX_MESSAGES = 100
export const UNREAD_WINDOW_EXTRA_MESSAGES = 30

// v0.88.0: догрузка вниз пачками по 100 (Telegram-style infinite scroll).
export const NEWER_PAGE_SIZE = 100
// v0.88.0: минимальный интервал между пачками вниз — защита от FLOOD_WAIT.
export const NEWER_PAGE_MIN_INTERVAL_MS = 300

// ── DEFAULT STATE ──────────────────────────────────────────────────────────

export const DEFAULT_STATE = {
  mode: 'inbox',
  accounts: [],
  activeAccountId: null,   // активный для нового login + подсветка в sidebar
  chatFilter: 'all',       // v0.87.105 (ADR-016): фильтр чатов в едином списке. 'all' | accountId
  chats: [],
  activeChatId: null,
  messages: {},
  forumTopics: {},        // { [chatId]: Topic[] } — Telegram forum groups
  forumTopicsLoading: {},
  forumTopicPanelChatId: null,
  activeForumTopic: {},   // { [chatId]: Topic }
  loginFlow: null,
  messageWindows: {},
  typing: {},             // v0.87.14: { [chatId]: { userId, at } } — таймер через 5 сек истекает
  loadingMessages: {},    // v0.87.36: { [chatId]: true } — флаг идущей загрузки (для shimmer overlay)
  nativeConnectionHealth: {}, // { [accountId]: connectionHealth } — реальные замеры Telegram API
}

// ── ЛОГИРОВАНИЕ ────────────────────────────────────────────────────────────

/**
 * Лог события startup native через стандартный app:log канал.
 * @param {string} event
 * @param {Record<string, any>} [data]
 */
export function logNativeLoad(event, data = {}) {
  const text = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  try {
    window.api?.send?.('app:log', {
      level: 'INFO',
      message: `[startup-native] ${event}${text ? ' ' + text : ''}`,
    })
  } catch(_) {}
}

// ── TOPIC HELPERS ──────────────────────────────────────────────────────────

/**
 * Ключ для messages кэша с учётом форум-топика.
 * Если topic есть → `${chatId}:topic:${topicId}`. Иначе chatId.
 */
export function topicMessageKey(chatId, topic) {
  const topicId = topic?.topicId || topic?.id || topic?.topMessageId
  return topicId ? `${chatId}:topic:${topicId}` : chatId
}

/**
 * Стабильный идентификатор форум-топика (как строка).
 */
export function topicIdentity(topic) {
  return String(topic?.topicId || topic?.id || topic?.topMessageId || '')
}

// ── MESSAGE COUNTING ───────────────────────────────────────────────────────

/**
 * Сколько входящих (isOutgoing=false) сообщений в массиве.
 */
export function countIncoming(messages) {
  return (Array.isArray(messages) ? messages : []).filter(m => !m.isOutgoing).length
}

// ── UNREAD WINDOW META ─────────────────────────────────────────────────────

/**
 * Сформировать метаобъект для unread-window (используется баннером «N из M непрочитанных»).
 */
export function buildUnreadWindowMeta({ messages, unreadCount, readInboxMaxId, requested, aroundId, loading = false }) {
  const loadedIncoming = countIncoming(messages)
  const unread = Number(unreadCount || 0)
  return {
    unreadWindowRequested: !!requested,
    unreadWindowComplete: !unread || !requested || loadedIncoming >= unread,
    unreadWindowLoading: !!loading,
    loadedIncoming,
    unreadCount: unread,
    readInboxMaxId: Number(readInboxMaxId || 0),
    aroundId: Number(aroundId || 0),
    updatedAt: Date.now(),
  }
}

/**
 * Параметры запроса unread-window (limit, aroundId, addOffset).
 * Возвращает requested=false если непрочитанных нет — тогда обычный latest-window.
 */
export function unreadWindowRequestParams(unreadCount, readInboxMaxId, baseLimit = 50) {
  const unread = Number(unreadCount || 0)
  const cursor = Number(readInboxMaxId || 0)
  if (!unread || !cursor) return { limit: baseLimit, aroundId: 0, addOffset: 0, requested: false }
  const limit = Math.min(Math.max(Number(baseLimit) || 50, unread + UNREAD_WINDOW_EXTRA_MESSAGES), UNREAD_WINDOW_MAX_MESSAGES)
  // v0.88.0: умный addOffset.
  // При большом числе непрочитанных (>30) — окно почти всё после курсора (~90%), оставляем
  // только небольшой контекст сверху. При маленьком (<30) — больше контекста (~25%).
  // Это даёт первое окно ближе к первому непрочитанному, остальное догружаем через loadNewerMessages.
  const addOffset = unread > 30
    ? -Math.floor(limit * 0.9)
    : -Math.floor(limit / 4)
  return { limit, aroundId: cursor, addOffset, requested: true }
}

// ── ACCOUNT LABELS ─────────────────────────────────────────────────────────

/**
 * Короткий label аккаунта вида `telegram · Иван`.
 */
export function nativeAccountLabel(account) {
  return `${account?.messenger || 'telegram'} · ${account?.name || account?.id || 'аккаунт'}`
}

/**
 * Развёрнутый detail-текст для логов: `<prefix>; чаты: N; непрочитано: M`.
 */
export function nativeAccountDetails(account, chats, prefix) {
  const accountChats = chats.filter(c => c.accountId === account.id)
  const unread = accountChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
  return `${prefix}; чаты: ${accountChats.length}; непрочитано: ${unread}`
}

// ── HEALTH HELPERS ─────────────────────────────────────────────────────────

/**
 * Обновить health для указанных аккаунтов через builder. Pure — возвращает новый state.
 * @param {object} state
 * @param {string[]} accountIds
 * @param {(account, prev) => object} buildHealth
 */
export function updateNativeHealthForAccounts(state, accountIds, buildHealth) {
  const ids = new Set(accountIds || [])
  if (!ids.size) return state
  const nextHealth = { ...state.nativeConnectionHealth }
  for (const account of state.accounts) {
    if (!ids.has(account.id)) continue
    nextHealth[account.id] = buildHealth(account, nextHealth[account.id])
  }
  return { ...state, nativeConnectionHealth: nextHealth }
}

/**
 * Список accountId для запроса: если передан конкретный — массив из одного,
 * иначе все ID известных аккаунтов в state.
 */
export function accountIdsForRequest(state, accountId) {
  if (accountId) return [accountId]
  return state.accounts.map(a => a.id)
}

/**
 * Извлечь текст ошибки из ответа backend (или fallback).
 */
export function healthErrorText(result, fallback = 'Ошибка Telegram API') {
  return result?.error || result?.message || fallback
}

/**
 * Найти статистику конкретного аккаунта в ответе bulk-проверки health.
 */
export function accountStatById(result, accountId) {
  const stats = Array.isArray(result?.accountStats) ? result.accountStats : []
  return stats.find(s => s?.accountId === accountId) || null
}

/**
 * v1.2.131: имя для КАРТОЧКИ уведомления. В ГРУППЕ показываем АВТОРА сообщения
 * (message.senderName), а не название группы; для лички/канала senderName совпадает
 * с названием чата. Автор неизвестен → название чата; чат ещё не загружен → 'Telegram'.
 * TDLib 1.8.64: sender_id = messageSenderUser | messageSenderChat → оба в senderName.
 * Та же строка применена inline в nativeStoreIpc.js emit (файл на лимите — импорт нельзя);
 * при изменении правила — синхронно.
 */
export function pickNotifTitle(message, chat) {
  return (message && message.senderName) || (chat && chat.title) || 'Telegram'
}
