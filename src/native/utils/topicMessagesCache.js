// v0.89.39: IndexedDB кэш сообщений форум-топиков.
//
// ЗАЧЕМ: при первом открытии топика юзер ждёт 188-500мс ответа сервера.
// Если уже открывал этот топик раньше — можем мгновенно показать последние
// сообщения из кэша (как Telegram Desktop делает через TDLib local cache),
// сервер докачает свежие данные параллельно.
//
// АРХИТЕКТУРА: один objectStore 'topics', ключ — `${chatId}:${topicId}`,
// значение — { messages, ts, unreadCount, readInboxMaxId }.
// Кэшируем последние 50 сообщений на топик. 1 чат × 30 топиков × 50 msg =
// ~1500 сообщений на чат = ~500KB JSON — норм для IndexedDB.
//
// Документация: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
//
// Стиль: graceful degradation — если IndexedDB недоступен (private mode,
// quota exceeded), все операции возвращают null/false без падений.

const DB_NAME = 'cc-topic-cache'
const DB_VERSION = 1
const STORE = 'topics'
const MAX_MESSAGES_PER_TOPIC = 50
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 дней

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
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return _dbPromise
}

function makeKey(chatId, topicId) {
  return String(chatId) + ':' + String(topicId)
}

/**
 * Сохранить snapshot сообщений топика в IndexedDB.
 * Безопасно — не падает если IndexedDB недоступен.
 *
 * @param {string} chatId
 * @param {string} topicId
 * @param {Array} messages — массив сообщений (берём последние MAX_MESSAGES_PER_TOPIC)
 * @param {Object} [meta] — { unreadCount, readInboxMaxId }
 */
export async function saveTopicMessages(chatId, topicId, messages, meta = {}) {
  if (!chatId || !topicId || !Array.isArray(messages)) return false
  const db = await openDB()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      // Берём ПОСЛЕДНИЕ MAX_MESSAGES_PER_TOPIC сообщений (хвост — самые свежие).
      const tail = messages.length > MAX_MESSAGES_PER_TOPIC
        ? messages.slice(messages.length - MAX_MESSAGES_PER_TOPIC)
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
 * Загрузить кэш сообщений топика. Возвращает null если кэша нет / устарел / IDB
 * недоступен.
 *
 * @returns {Promise<{messages, ts, unreadCount, readInboxMaxId} | null>}
 */
export async function loadTopicMessages(chatId, topicId) {
  if (!chatId || !topicId) return null
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
        // TTL — старые записи игнорируем (топик мог сильно измениться).
        if (Date.now() - (data.ts || 0) > CACHE_TTL_MS) return resolve(null)
        resolve(data)
      }
      req.onerror = () => resolve(null)
    } catch (_) { resolve(null) }
  })
}

/**
 * Очистить весь кэш. Используется при logout / смене аккаунта.
 */
export async function clearTopicCache() {
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

// Для тестов
export const _internal = { DB_NAME, STORE, MAX_MESSAGES_PER_TOPIC, CACHE_TTL_MS, makeKey }
