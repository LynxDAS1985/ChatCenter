// v0.89.40: IndexedDB кэш сообщений — для топиков И обычных чатов.
// Расширение v0.89.39 (топики) на все типы чатов.
//
// ЗАЧЕМ: при первом открытии любого чата юзер ждёт 188-500мс ответа сервера.
// Если уже открывал этот чат раньше — можем мгновенно показать последние
// сообщения из кэша (как Telegram Desktop через TDLib SQLite local cache,
// WhatsApp Web / Discord через IndexedDB). См. сравнение в features.md v0.89.40.
//
// АРХИТЕКТУРА:
//   - DB: cc-messages-cache (общая для топиков + чатов)
//   - objectStore: 'messages', ключ — `${chatId}:${topicId || '_main'}`
//     - Для обычного чата: chatId + '_main'
//     - Для топика: chatId + ':' + topicId
//   - Значение: { messages, ts, unreadCount, readInboxMaxId }
//
// Кэшируем последние 50 сообщений на ключ. TTL 7 дней — автоматическая очистка
// через cleanupExpired() (вызывается при initStore или раз в день).
//
// Документация: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
// Web.dev рекомендует IndexedDB для messaging apps:
//   https://web.dev/articles/storage-for-the-web
//
// Стиль: graceful degradation — если IndexedDB недоступен (private mode,
// quota exceeded), все операции возвращают null/false без падений.

// v0.89.40: имя DB изменилось (cc-topic-cache → cc-messages-cache). Старая DB
// останется на диске, но не читается — её можно проигнорировать или вручную
// очистить через DevTools → Application → IndexedDB.
const DB_NAME = 'cc-messages-cache'
const DB_VERSION = 1
const STORE = 'messages'
const MAX_MESSAGES_PER_KEY = 50
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 дней
const MAIN_TOPIC_ID = '_main' // фиктивный topicId для обычного чата

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  if (typeof indexedDB === 'undefined') {
    _dbPromise = Promise.resolve(null)
    return _dbPromise
  }
  _dbPromise = new Promise((resolve) => {
    let req
    try { req = indexedDB.open(DB_NAME, DB_VERSION) }
    catch (_) { resolve(null); return }
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE)
        // v0.89.40: индекс по ts — для эффективного cleanupExpired().
        store.createIndex('ts', 'ts', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return _dbPromise
}

function makeKey(chatId, topicId) {
  const tid = topicId == null || topicId === '' ? MAIN_TOPIC_ID : String(topicId)
  return String(chatId) + ':' + tid
}

/**
 * Сохранить snapshot сообщений в IndexedDB.
 * Подходит И для топиков, И для обычных чатов.
 *
 * @param {string} chatId
 * @param {string|null} topicId — null для обычного чата (без топика)
 * @param {Array} messages — массив сообщений (берём последние MAX_MESSAGES_PER_KEY)
 * @param {Object} [meta] — { unreadCount, readInboxMaxId }
 */
export async function saveMessages(chatId, topicId, messages, meta = {}) {
  if (!chatId || !Array.isArray(messages)) return false
  const db = await openDB()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      // Берём ПОСЛЕДНИЕ MAX_MESSAGES_PER_KEY сообщений (хвост — самые свежие).
      const tail = messages.length > MAX_MESSAGES_PER_KEY
        ? messages.slice(messages.length - MAX_MESSAGES_PER_KEY)
        : messages
      const payload = {
        messages: tail,
        ts: Date.now(),
        unreadCount: Number(meta.unreadCount) || 0,
        readInboxMaxId: Number(meta.readInboxMaxId) || 0,
      }
      store.put(payload, makeKey(chatId, topicId))
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch (_) { resolve(false) }
  })
}

/**
 * Загрузить кэш сообщений. Возвращает null если кэша нет / устарел / IDB
 * недоступен.
 *
 * @returns {Promise<{messages, ts, unreadCount, readInboxMaxId} | null>}
 */
export async function loadMessages(chatId, topicId) {
  if (!chatId) return null
  const db = await openDB()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const req = store.get(makeKey(chatId, topicId))
      req.onsuccess = () => {
        const data = req.result
        if (!data || !Array.isArray(data.messages)) return resolve(null)
        // TTL — старые записи игнорируем (чат мог сильно измениться).
        if (Date.now() - (data.ts || 0) > CACHE_TTL_MS) return resolve(null)
        resolve(data)
      }
      req.onerror = () => resolve(null)
    } catch (_) { resolve(null) }
  })
}

/**
 * v0.89.40: TTL cleanup helper — удаляет ВСЕ записи старше CACHE_TTL_MS.
 * Использует index 'ts' для эффективного обхода (cursor от 0 до now-TTL).
 * Вызывать раз в день или при старте приложения.
 *
 * @returns {Promise<number>} число удалённых записей
 */
export async function cleanupExpired() {
  const db = await openDB()
  if (!db) return 0
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const index = store.index('ts')
      const cutoff = Date.now() - CACHE_TTL_MS
      const range = IDBKeyRange.upperBound(cutoff)
      const req = index.openCursor(range)
      let deleted = 0
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          cursor.delete()
          deleted++
          cursor.continue()
        } else {
          resolve(deleted)
        }
      }
      req.onerror = () => resolve(deleted)
    } catch (_) { resolve(0) }
  })
}

/**
 * Очистить весь кэш. Используется при logout / смене аккаунта.
 */
export async function clearAllMessages() {
  const db = await openDB()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    } catch (_) { resolve(false) }
  })
}

// v0.89.40: backwards-compatible aliases для v0.89.39 импортов в nativeStore.js.
// Старый код вызывал saveTopicMessages / loadTopicMessages с обязательным
// topicId — теперь они обёртки над saveMessages / loadMessages.
export const saveTopicMessages = (chatId, topicId, messages, meta) => saveMessages(chatId, topicId, messages, meta)
export const loadTopicMessages = (chatId, topicId) => loadMessages(chatId, topicId)
export const clearTopicCache = clearAllMessages

// Для тестов
export const _internal = { DB_NAME, STORE, MAX_MESSAGES_PER_KEY, CACHE_TTL_MS, MAIN_TOPIC_ID, makeKey }
