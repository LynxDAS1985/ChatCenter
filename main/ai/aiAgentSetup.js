// v0.99.1 (Phase 3.5): полная интеграция AI агента в main process.
//
// Собирает:
//   - Tool Registry с 5 tools (3 read-only из Phase 1 + 2 write из Phase 2)
//   - handlerContext с реальными методами TDLib backend
//   - callProvider — функция вызова AI API с tools (4 провайдера)
//
// Используется в main.js → initAiToolIpcHandlers(deps).
// Без этого agent loop возвращает 'no_registry_available' (как в v0.99.0).

import { createToolRegistry } from '../../shared/tools/toolRegistry.js'
import { gotoMessageTool } from '../../shared/tools/handlers/gotoMessage.js'
import { getChatHistoryTool } from '../../shared/tools/handlers/getChatHistory.js'
import { searchMessagesTool } from '../../shared/tools/handlers/searchMessages.js'
import { replyToMessageTool } from '../../shared/tools/handlers/replyToMessage.js'
import { markAsReadTool } from '../../shared/tools/handlers/markAsRead.js'
// v1.0.0 (Phase 4): tools для Tasks + Reminders.
import { createTaskTool } from '../../shared/tools/handlers/createTask.js'
import { listTasksTool } from '../../shared/tools/handlers/listTasks.js'
import { scheduleReminderTool } from '../../shared/tools/handlers/scheduleReminder.js'

let _registry = null
let _deps = null

/**
 * Инициализировать Tool Registry с все доступными tools.
 * Идемпотентно — повторный вызов возвращает существующий registry.
 */
export function initToolRegistry() {
  if (_registry) return _registry
  const reg = createToolRegistry()

  // Read-only tools (Phase 1) — permission=auto
  reg.register(gotoMessageTool.id, gotoMessageTool)
  reg.register(getChatHistoryTool.id, getChatHistoryTool)
  reg.register(searchMessagesTool.id, searchMessagesTool)

  // Write tools (Phase 2) — permission=confirm hardcoded
  reg.register(replyToMessageTool.id, replyToMessageTool)
  reg.register(markAsReadTool.id, markAsReadTool)

  // Phase 4 tools: Tasks + Reminders
  reg.register(createTaskTool.id, createTaskTool)
  reg.register(listTasksTool.id, listTasksTool)
  reg.register(scheduleReminderTool.id, scheduleReminderTool)

  _registry = reg
  return _registry
}

/**
 * Установить deps для handlerContext (TDLib backend методы).
 * Вызывается из main.js после инициализации tdlib backend.
 *
 * @param {object} deps
 *   - tdlibBackend: { getMessages, sendMessage, markRead, searchMessages, ... }
 *   - mainWindow: () => BrowserWindow — для UI dispatch
 */
export function setAgentDeps(deps) {
  _deps = deps
}

/**
 * Получить handlerContext для tool execution.
 * Tools используют context чтобы вызывать реальные операции (TDLib / UI).
 *
 * @returns {object} handlerContext
 */
export function getHandlerContext() {
  return {
    // dispatchUI — отправить в renderer команду переключить вкладку / открыть чат
    dispatchUI: async (action) => {
      const win = _deps?.mainWindow?.()
      if (!win || win.isDestroyed()) return { ok: false, error: 'no_mainWindow' }
      try {
        win.webContents.send('ai:agent:ui-dispatch', action)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e?.message }
      }
    },

    // getMessages — прочитать историю чата через TDLib
    getMessages: async ({ chatId, limit, beforeMessageId }) => {
      const backend = _deps?.tdlibBackend
      if (!backend || typeof backend.getMessages !== 'function') {
        // Fallback — если backend не подключён, возвращаем пустой список (не падаем)
        return []
      }
      try {
        const r = await backend.getMessages({ chatId, limit: limit || 20, beforeMessageId })
        return Array.isArray(r) ? r : (r?.messages || [])
      } catch (_) {
        return []
      }
    },

    // searchMessages — поиск через TDLib (если поддерживается)
    searchMessages: async ({ query, chatId, accountId, limit }) => {
      const backend = _deps?.tdlibBackend
      if (!backend || typeof backend.searchMessages !== 'function') {
        return []
      }
      try {
        const r = await backend.searchMessages({ query, chatId, accountId, limit: limit || 20 })
        return Array.isArray(r) ? r : (r?.matches || [])
      } catch (_) {
        return []
      }
    },

    // sendMessage — отправить ответ через TDLib
    sendMessage: async ({ accountId, chatId, text, replyToMessageId, parseMode }) => {
      const backend = _deps?.tdlibBackend
      if (!backend || typeof backend.sendMessage !== 'function') {
        return { ok: false, error: 'no_tdlib_backend' }
      }
      try {
        const r = await backend.sendMessage({ accountId, chatId, text, replyToMessageId, parseMode })
        return r || { ok: true }
      } catch (e) {
        return { ok: false, error: e?.message }
      }
    },

    // markAsRead — отметить прочитанным через TDLib
    markAsRead: async ({ accountId, chatId, upToMessageId }) => {
      const backend = _deps?.tdlibBackend
      if (!backend || typeof backend.markAsRead !== 'function') {
        return { ok: false, error: 'no_tdlib_backend' }
      }
      try {
        const r = await backend.markAsRead({ accountId, chatId, upToMessageId })
        return r || { ok: true }
      } catch (e) {
        return { ok: false, error: e?.message }
      }
    },

    // v1.0.0 (Phase 4): createTask — создать задачу через taskStore
    createTask: async (taskParams) => {
      const ts = _deps?.taskStore
      if (!ts || typeof ts.create !== 'function') return { ok: false, error: 'no_taskStore' }
      try { return await ts.create(taskParams) } catch (e) { return { ok: false, error: e?.message } }
    },

    // listTasks — список задач через taskStore
    listTasks: async (filter) => {
      const ts = _deps?.taskStore
      if (!ts || typeof ts.list !== 'function') return { ok: false, tasks: [] }
      try { return await ts.list(filter) } catch (e) { return { ok: false, error: e?.message, tasks: [] } }
    },

    // scheduleReminder — запланировать напоминание
    scheduleReminder: async (reminderParams) => {
      const rs = _deps?.reminderStore
      if (!rs || typeof rs.schedule !== 'function') return { ok: false, error: 'no_reminderStore' }
      try { return await rs.schedule(reminderParams) } catch (e) { return { ok: false, error: e?.message } }
    },
  }
}

export const _internal = { getDeps: () => _deps }
