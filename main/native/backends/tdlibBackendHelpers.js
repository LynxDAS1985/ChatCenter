// v1.1.9: pure helpers для tdlibBackend.js, вынесены чтобы хост влез в лимит.
// Поведение не изменено — функции и константы те же, только импорт из соседнего файла.
//
// Все функции в этом файле:
// - чистые (без скрытого state)
// - не используют manager / клиент TDLib напрямую
// - легко тестировать без мока TDLib

/**
 * Маппинг внешних кодов фильтра (для AI tools / IPC) в строки TDLib API.
 * Источник: TDLib API docs — searchMessagesFilter*.
 * @type {Record<string, string>}
 */
export const SEARCH_FILTER_MAP = {
  photo: 'searchMessagesFilterPhoto',
  video: 'searchMessagesFilterVideo',
  'photo-video': 'searchMessagesFilterPhotoAndVideo',
  document: 'searchMessagesFilterDocument',
  audio: 'searchMessagesFilterAudio',
  voice: 'searchMessagesFilterVoiceNote',
  'video-note': 'searchMessagesFilterVideoNote',
  url: 'searchMessagesFilterUrl',
  mention: 'searchMessagesFilterMention',
  pinned: 'searchMessagesFilterPinned',
  'unread-mention': 'searchMessagesFilterUnreadMention',
  empty: 'searchMessagesFilterEmpty',
}

/**
 * Конвертирует внешний код фильтра в TDLib payload `{ '@type': 'searchMessagesFilter*' }`.
 * Unknown / falsy → searchMessagesFilterEmpty (без фильтра).
 *
 * @param {string|null|undefined} filter
 * @returns {{ '@type': string }}
 */
export function mapSearchFilter(filter) {
  if (!filter || filter === 'empty') return { '@type': 'searchMessagesFilterEmpty' }
  const tdType = SEARCH_FILTER_MAP[String(filter)] || 'searchMessagesFilterEmpty'
  return { '@type': tdType }
}

/**
 * Парсит наш составной id `accountId:rawId` → { accountId, rawId (число) }.
 * Возвращает { accountId: null, rawId: null } если формат не подходит.
 *
 * @param {string|number|null|undefined} chatId
 * @returns {{ accountId: string|null, rawId: number|null }}
 */
export function parseChatId(chatId) {
  const s = String(chatId || '')
  const colon = s.indexOf(':')
  if (colon < 0) return { accountId: null, rawId: null }
  return { accountId: s.slice(0, colon), rawId: Number(s.slice(colon + 1)) }
}
