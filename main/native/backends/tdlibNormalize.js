// v0.89.0 — Stage 4 / Этап 3.4 (фикс реального TDLib): нормализация tdl формата.
//
// КРИТИЧНО: tdl библиотека внутри переименовывает '@type' → '_' при получении
// updates от TDLib через `deepRenameKey('@type', '_', res)`:
//   node_modules/tdl/dist/client.js строка 532
//
// Все наши mapper'ы (tdlibMapper.js), client manager (tdlibClient.js),
// messages (tdlibMessages.js), media (tdlibMedia.js) написаны под СТАНДАРТНУЮ
// TDLib JSON-API форму с '@type' (как в core.telegram.org docs). Поэтому при
// получении data от tdl мы делаем обратное переименование '_' → '@type'.
//
// invoke: tdl сама переименовывает '_' ↔ '@type' в обе стороны — отправляем
// с '@type', получаем результат с '_'. Нужно нормализовать результат.

/**
 * Deep rename ключа `from` в `to` во всех вложенных объектах и массивах.
 * Не мутирует исходный объект.
 *
 * @param {string} from
 * @param {string} to
 * @param {any} obj
 * @returns {any}
 */
export function deepRenameKey(from, to, obj) {
  if (Array.isArray(obj)) return obj.map((x) => deepRenameKey(from, to, x))
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const key of Object.keys(obj)) {
      const newKey = key === from ? to : key
      out[newKey] = deepRenameKey(from, to, obj[key])
    }
    return out
  }
  return obj
}

/**
 * Конвертирует объект из tdl-формата (`_` discriminator) в стандартный
 * TDLib JSON-API формат (`@type` discriminator).
 */
export function normalizeFromTdl(obj) {
  return deepRenameKey('_', '@type', obj)
}

/**
 * Оборачивает реальный tdl.Client так, чтобы он отдавал updates и результаты
 * invoke в формате с `@type` (вместо tdl-внутреннего `_`).
 *
 * После обёртки можно использовать клиент так же как mock в тестах —
 * вся логика TdlibClientManager / tdlibMapper / tdlibMessages работает.
 *
 * @param {object} rawClient — результат tdl.createClient(...)
 * @returns {object} — wrapper с теми же методами но нормализованными данными
 */
export function wrapClientForNormalization(rawClient) {
  if (!rawClient) return rawClient
  // Перенаправляем 'update' listeners через нормализацию.
  // tdl client это EventEmitter — у него есть on/off/emit.
  const updateListenerMap = new WeakMap()

  return {
    // Раскрытие исходного клиента — для редких случаев когда нужен прямой доступ.
    _raw: rawClient,

    // invoke: tdl сама принимает `@type` (переименовывает в `_`).
    // Результат приходит с `_` → нормализуем в `@type`.
    invoke: async (request) => {
      const r = await rawClient.invoke(request)
      return normalizeFromTdl(r)
    },

    on: (event, handler) => {
      if (event !== 'update') return rawClient.on(event, handler)
      const wrapped = (update) => handler(normalizeFromTdl(update))
      updateListenerMap.set(handler, wrapped)
      rawClient.on('update', wrapped)
    },

    off: (event, handler) => {
      if (event !== 'update') return rawClient.off?.(event, handler)
      const wrapped = updateListenerMap.get(handler)
      if (wrapped) {
        rawClient.off?.('update', wrapped)
        updateListenerMap.delete(handler)
      } else {
        rawClient.off?.('update', handler)
      }
    },

    // Прокидываем остальные методы без изменений.
    close: () => rawClient.close?.(),
    once: rawClient.once?.bind?.(rawClient),
    removeListener: rawClient.removeListener?.bind?.(rawClient),
  }
}
