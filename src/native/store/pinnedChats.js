// v1.2.138: обёртка над localStorage для локальных закреплений чатов.
// Чистая логика (toggle/isPinned/sort) — в корневом shared/pinnedChats.js (вне
// renderer-бюджета). Здесь только чтение/запись списка chat.id в localStorage.
// Закрепления ЛОКАЛЬНЫЕ: только у нас, НЕ в Telegram (у нас лимита нет).
//
// Формат значения: JSON-массив строк chat.id, напр. ["tg_1:100","tg_1:205"].

// Реэкспорт чистых функций — потребители импортируют всё из одного места.
export { togglePinnedId, isPinnedId, sortWithPinnedFirst, filterSortChats } from '../../../shared/pinnedChats.js'

const KEY = 'cc-native-pinned-chats'

// Загрузить список закреплённых chat.id. Любая ошибка/мусор → пустой список.
export function loadPinnedIds() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x) : []
  } catch (_) {
    return []
  }
}

// Сохранить список закреплённых chat.id.
export function savePinnedIds(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.isArray(ids) ? ids : []))
  } catch (_) {}
}
