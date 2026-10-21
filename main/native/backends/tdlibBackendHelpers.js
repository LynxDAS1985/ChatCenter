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

/**
 * v1.2.491: «сеть сменилась» → TDLib setNetworkType для всех аккаунтов.
 * По документации TDLib (типы установленного @prebuilt-tdlib): setNetworkType «forces all network
 * connections to reopen, mitigating the delay in switching between different networks, so it must
 * be called whenever the network is changed, even if the network type remains the same».
 * Зовёт «пульс интернета» (main/handlers/netPulseHandlers.js) при переходе «интернет появился»:
 * 22.09.2026 веб-страницы поднялись в 10:13, а TDLib сам дошёл до «связь есть» лишь в 10:15.
 * Тип networkTypeOther — точный тип сети нам не важен, важен сам вызов.
 * 🔴 networkTypeNone НЕ шлём никогда: так мы бы САМИ отключили TDLib от сети по ложному пульсу.
 * @param {{listAccounts:()=>string[], getClient:(id:string)=>object|null}} manager
 */
export async function networkChangedRaw(manager) {
  const accountStats = []
  for (const accountId of manager.listAccounts()) {
    const client = manager.getClient(accountId)
    if (!client?.invoke) { accountStats.push({ accountId, ok: false, error: 'no client' }); continue }
    try {
      await client.invoke({ '@type': 'setNetworkType', type: { '@type': 'networkTypeOther' } })
      accountStats.push({ accountId, ok: true })
    } catch (e) {
      accountStats.push({ accountId, ok: false, error: e?.message || String(e) })
    }
  }
  console.log('[net-pulse] TDLib setNetworkType: ' + (accountStats.map(s => s.accountId + (s.ok ? ' ok' : ' ОШИБКА ' + s.error)).join(', ') || 'аккаунтов нет'))
  return { ok: true, accountStats }
}

/**
 * Загрузка чатов из TDLib с защитой от параллельных дублирующих запросов (дедупликация).
 * Если запрос для данного accountId (или всех) уже выполняется, возвращается существующий Promise.
 *
 * @param {object} manager — TdlibClientManager
 * @param {(client: object, req: object) => Promise<{ok: boolean, result?: any, error?: string, code?: number}>} safeInvoke
 * @param {string|undefined} accountId — конкретный аккаунт или undefined для всех
 * @param {Map<string, Promise<any>>} inFlightMap — карта активных запросов
 * @returns {Promise<{ok: boolean, chats: any[]}>}
 */
export function fetchChatsRaw(manager, safeInvoke, accountId, inFlightMap) {
  const key = accountId || '__all__'
  if (inFlightMap?.has(key)) return inFlightMap.get(key)
  if (accountId && inFlightMap?.has('__all__')) {
    const pAll = inFlightMap.get('__all__')
      .then(
        () => ({ ok: true, chats: manager.getAccountChats(accountId) }),
        (err) => ({ ok: false, chats: manager.getAccountChats(accountId) || [], error: err?.message || String(err) })
      )
      .finally(() => {
        inFlightMap?.delete(key)
      })
    if (inFlightMap) inFlightMap.set(key, pAll)
    return pAll
  }

  const promise = (async () => {
    try {
      const accountIds = accountId ? [accountId] : manager.listAccounts()
      for (const aid of accountIds) {
        if (key === '__all__' && inFlightMap?.has(aid)) {
          await inFlightMap.get(aid).catch(() => {})
          continue
        }
        const client = manager.getClient(aid)
        if (!client?.invoke) continue
        for (const chatList of [
          { '@type': 'chatListMain' },
          { '@type': 'chatListArchive' },
        ]) {
          for (let i = 0; i < 20; i++) {
            const r = await safeInvoke(client, { '@type': 'loadChats', chat_list: chatList, limit: 100 })
            if (!r.ok) break
            await new Promise((res) => setTimeout(res, 80))
          }
        }
      }
      if (accountId) return { ok: true, chats: manager.getAccountChats(accountId) }
      const all = []
      for (const aid of manager.listAccounts()) all.push(...manager.getAccountChats(aid))
      return { ok: true, chats: all }
    } catch (err) {
      return { ok: false, chats: (accountId ? manager.getAccountChats(accountId) : []) || [], error: err?.message || String(err) }
    }
  })()

  // v1.2.513: .finally навешивается на внешний промис ДО сохранения в map,
  // что гарантирует удаление ключа даже при синхронном завершении async IIFE.
  const cleanPromise = promise.finally(() => {
    inFlightMap?.delete(key)
  })

  if (inFlightMap) inFlightMap.set(key, cleanPromise)
  return cleanPromise
}

