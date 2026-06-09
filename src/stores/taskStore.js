// v1.0.0 (Phase 4.1): Task store — renderer side.
//
// Задачи с привязкой к источнику (NotificationSource). Persistent через IPC в
// JSON файл `userData/tasks.json`. Создаются через UI или AI agent (tool create_task).

const TITLE_MAX = 200
const DETAILS_MAX = 1000

function generateId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Создать запись задачи (без сохранения).
 *
 * @param {object} params
 * @returns {object} task
 */
export function createTaskRecord(params) {
  const p = params || {}
  const now = Date.now()
  return {
    id: p.id || generateId(),
    source: p.source || null,
    title: (p.title || '').slice(0, TITLE_MAX) || '(без названия)',
    details: (p.details || '').slice(0, DETAILS_MAX),
    priority: ['low', 'medium', 'high'].includes(p.priority) ? p.priority : 'medium',
    dueAt: p.dueAt || null,
    status: ['pending', 'in_progress', 'done'].includes(p.status) ? p.status : 'pending',
    createdAt: p.createdAt || now,
    completedAt: p.completedAt || null,
    createdBy: p.createdBy === 'ai' ? 'ai' : 'user',
    auditId: p.auditId || null,
  }
}

/**
 * Сохранить задачу (через IPC в main).
 */
export async function createTask(params) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    const task = createTaskRecord(params)
    const result = await globalThis.window.api.invoke('tasks:create', task)
    return result || { ok: false, error: 'invoke_returned_nothing' }
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export async function listTasks(filter = {}) {
  if (!globalThis.window?.api?.invoke) return { ok: false, tasks: [] }
  try {
    return await globalThis.window.api.invoke('tasks:list', filter)
  } catch (e) {
    return { ok: false, error: e?.message, tasks: [] }
  }
}

export async function completeTask(taskId) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    return await globalThis.window.api.invoke('tasks:complete', { taskId })
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export async function deleteTask(taskId) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    return await globalThis.window.api.invoke('tasks:delete', { taskId })
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export const _internal = { TITLE_MAX, DETAILS_MAX, generateId }
