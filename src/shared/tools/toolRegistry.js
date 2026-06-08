// v0.97.0 (Phase 1 M1.1): Tool Registry — реестр tools для AI.
//
// Реестр хранит описание tools (JSON Schema + handler + permission).
// Используется одинаково:
//   - AI Tool Executor: lookup → выполнить tool_call
//   - UI Action Bus: dispatch action → выполнить тот же handler
//
// См. .memory-bank/ai-agent-plan/architecture.md (Уровень 2)
// См. .memory-bank/ai-agent-plan/tools-catalog.md (каталог tools)

/**
 * Permission tiers — определяют как обрабатывать tool_call от AI.
 * Юзеру (UI) разрешено всё, ограничения только для AI.
 */
export const PERMISSION_TIERS = ['auto', 'confirm', 'deny']

/**
 * Категории tools — для UI группировки.
 */
export const CATEGORIES = ['navigation', 'reading', 'writing', 'tasks', 'system']

/**
 * Создаёт новый реестр tools.
 *
 * @returns {object} { register, unregister, lookup, list, count, schemas }
 */
export function createToolRegistry() {
  const tools = new Map()

  /**
   * Зарегистрировать tool.
   *
   * @param {string} id — уникальный actionId (например 'goto_message')
   * @param {object} def — { schema, handler, permission, description, category, revertable }
   * @throws {Error} если invalid def или конфликт id
   */
  function register(id, def) {
    if (!id || typeof id !== 'string') {
      throw new Error('[ToolRegistry] register: id must be a non-empty string')
    }
    if (!def || typeof def !== 'object') {
      throw new Error(`[ToolRegistry] register: def must be an object (id=${id})`)
    }
    if (!def.schema || typeof def.schema !== 'object') {
      throw new Error(`[ToolRegistry] register: def.schema must be an object (id=${id})`)
    }
    if (typeof def.handler !== 'function') {
      throw new Error(`[ToolRegistry] register: def.handler must be a function (id=${id})`)
    }
    if (def.permission && !PERMISSION_TIERS.includes(def.permission)) {
      throw new Error(`[ToolRegistry] register: invalid permission "${def.permission}" (id=${id}). Allowed: ${PERMISSION_TIERS.join(', ')}`)
    }
    if (def.category && !CATEGORIES.includes(def.category)) {
      throw new Error(`[ToolRegistry] register: invalid category "${def.category}" (id=${id}). Allowed: ${CATEGORIES.join(', ')}`)
    }
    if (tools.has(id)) {
      // Warning, не throw — разработчик может переопределить tool (например в тестах)
      console.warn(`[ToolRegistry] tool already registered: ${id} (overwriting)`)
    }
    tools.set(id, {
      id,
      schema: def.schema,
      handler: def.handler,
      permission: def.permission || 'auto',
      description: def.description || '',
      category: def.category || 'system',
      revertable: !!def.revertable,
      metadata: {
        addedAt: Date.now(),
        version: def.version || '1.0.0',
        ...(def.metadata || {}),
      },
    })
  }

  function unregister(id) {
    return tools.delete(id)
  }

  /**
   * Найти tool по id. Возвращает null если нет.
   */
  function lookup(id) {
    return tools.get(id) || null
  }

  /**
   * Список всех tools (sorted by id).
   * Можно фильтровать по category / permission.
   *
   * @param {object} [filter] — { category, permission, ai_only }
   * @returns {Array}
   */
  function list(filter) {
    const all = Array.from(tools.values())
    let filtered = all
    if (filter) {
      if (filter.category) filtered = filtered.filter(t => t.category === filter.category)
      if (filter.permission) filtered = filtered.filter(t => t.permission === filter.permission)
      if (filter.ai_only) filtered = filtered.filter(t => t.permission !== 'deny')
    }
    return filtered.sort((a, b) => a.id.localeCompare(b.id))
  }

  function count() {
    return tools.size
  }

  /**
   * Получить только JSON Schema всех tools — для передачи AI provider.
   * Excluded `deny` tools — AI о них не должен знать.
   *
   * @returns {Array<{name, description, input_schema}>}
   */
  function schemas() {
    return list({ ai_only: true }).map(t => ({
      name: t.id,
      description: t.description,
      input_schema: t.schema,
    }))
  }

  function clear() {
    tools.clear()
  }

  return { register, unregister, lookup, list, count, schemas, clear }
}

/**
 * Singleton registry — глобальный экземпляр для всего приложения.
 * Можно использовать через `getDefaultRegistry()` или создавать свои через
 * `createToolRegistry()` для тестов.
 */
let defaultRegistry = null

export function getDefaultRegistry() {
  if (!defaultRegistry) defaultRegistry = createToolRegistry()
  return defaultRegistry
}

export function resetDefaultRegistry() {
  defaultRegistry = null
}
