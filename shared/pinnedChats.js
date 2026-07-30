// v1.2.138: ЧИСТАЯ логика локальных закреплений чатов (без localStorage/DOM).
// Лежит в корневом shared/ (как vkExecFallback.js / notifAlbum.js), а НЕ в src/,
// чтобы не входить в общий renderer-бюджет — правило проекта: не раздувать renderer,
// чистое выносить. Обёртка над localStorage (load/save) — в src/native/store/pinnedChats.js.
//
// Закрепления ЛОКАЛЬНЫЕ: только в нашем приложении, НЕ в Telegram (у нас лимита нет,
// в Telegram — есть). Здесь только преобразования списка chat.id.

// Переключить закрепление одного чата. Чистая: возвращает НОВЫЙ массив (не мутирует
// вход) — удобно для setState. Новое закрепление кладём в начало.
export function togglePinnedId(ids, chatId) {
  const list = Array.isArray(ids) ? ids : []
  if (!chatId) return list
  return list.includes(chatId)
    ? list.filter(id => id !== chatId)
    : [chatId, ...list]
}

// Проверить, закреплён ли чат. Принимает массив ИЛИ Set.
export function isPinnedId(ids, chatId) {
  if (!chatId) return false
  if (ids instanceof Set) return ids.has(chatId)
  return Array.isArray(ids) && ids.includes(chatId)
}

// Сортировка чатов: закреплённые — наверх. Второй аргумент:
//  • МАССИВ chat.id (порядок закрепления) → закреплённые идут в ЭТОМ порядке
//    (устойчиво, не прыгают при новом сообщении) — v1.2.139, TODO-18;
//  • Set<chatId> → закреплённые сортируются по времени (старое поведение, для совместимости).
// Внутри «остальных» (не закреплённых) — всегда по времени последнего сообщения (свежие выше).
// Вход НЕ мутируется.
export function sortWithPinnedFirst(chats, pinned) {
  const orderMap = Array.isArray(pinned) ? new Map(pinned.map((id, i) => [id, i])) : null
  const set = pinned instanceof Set ? pinned : new Set(pinned || [])
  return [...(chats || [])].sort((a, b) => {
    const ap = set.has(a.id) ? 1 : 0
    const bp = set.has(b.id) ? 1 : 0
    if (ap !== bp) return bp - ap
    // Оба закреплены и известен порядок закрепления → по нему (индекс в массиве).
    if (ap === 1 && orderMap) {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER
      const bi = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi
    }
    return (b.lastMessageTs || 0) - (a.lastMessageTs || 0)
  })
}

// v1.2.156 (TODO-20): переставить закреплённый чат перетаскиванием — вставить fromId
// ПЕРЕД toId в массиве порядка закрепления. Оба чата должны быть уже закреплены (иначе
// вход возвращается без изменений). Чистая: НЕ мутирует вход, возвращает новый массив.
// Порядок затем применяет sortWithPinnedFirst (индекс в массиве = позиция строки).
// v1.2.139 (TODO-19): единый конвейер списка чатов — фильтр по аккаунту + поиску,
// затем сортировка с закреплёнными наверх. Вынесен из InboxMode, чтобы покрыть тестом
// (раньше проверялся только модуль сортировки, а не то, что экран его применяет).
// chats — store.chats; opts.filter — 'all' | accountId; opts.query — строка поиска;
// opts.pinnedIds — массив закреплённых chat.id (в порядке закрепления).
export function filterSortChats(chats, opts) {
  const { filter = 'all', query = '', pinnedIds = [] } = opts || {}
  const q = (query || '').trim().toLowerCase()
  const filtered = (chats || [])
    .filter(c => filter === 'all' ? true : c.accountId === filter)
    .filter(c => !q || (c.title || '').toLowerCase().includes(q) || (c.lastMessage || '').toLowerCase().includes(q))
  return sortWithPinnedFirst(filtered, pinnedIds)
}

// ПРИМЕЧАНИЕ (v1.2.140): авто-чистка «осиротевших» закреплений НЕ реализована намеренно.
// Пробная prunePinnedIds (v1.2.139) удаляла пин, если чата нет в store.chats, а его аккаунт
// «загружен». Это теряло данные: store.chats часто НЕПОЛНЫЙ — кэш-подмножество на старте и
// tg:chats(append=false) ЗАМЕНЯЕТ чаты аккаунта пришедшей порцией (nativeStoreIpc.js), т.е.
// живой чат может временно отсутствовать → пин стирался навсегда. «Нет в списке» ≠ «удалён».
// Безопасная чистка требует ЯВНОГО события удаления чата от TDLib (а не вывода по отсутствию)
// — см. [[code-todo]] TODO-21. Осиротевшие пины безвредны: sortWithPinnedFirst/isPinnedId их
// просто не находят среди существующих чатов.
