// v1.0.0 (Phase 4.1): handler для create_task tool.
//
// Permission: confirm (юзер настраивает — можно auto).
// Создаёт задачу через context.taskStore.create.

export async function createTaskHandler(source, args, context) {
  if (!source) return { ok: false, error: 'invalid_source' }
  if (!args || !args.title || typeof args.title !== 'string') {
    return { ok: false, error: 'missing_title' }
  }
  if (typeof context?.createTask !== 'function') {
    return { ok: false, error: 'no_createTask_in_context' }
  }
  try {
    const result = await context.createTask({
      source,
      title: args.title,
      details: args.details || '',
      priority: args.priority || 'medium',
      dueAt: args.dueAt || null,
      createdBy: 'ai',
    })
    if (!result || !result.ok) {
      return { ok: false, error: result?.error || 'createTask_failed' }
    }
    return {
      ok: true,
      result: {
        taskId: result.task?.id,
        title: args.title,
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'createTask_threw' }
  }
}

export const createTaskTool = {
  id: 'create_task',
  permission: 'confirm',
  category: 'tasks',
  revertable: true,
  description: 'Создать задачу с привязкой к сообщению',
  schema: {
    type: 'object',
    required: ['source', 'title'],
    properties: {
      source: { type: 'object' },
      title: { type: 'string', minLength: 1, maxLength: 200 },
      details: { type: 'string', maxLength: 1000 },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      dueAt: { type: 'string', description: 'ISO 8601 datetime' },
    },
  },
  handler: createTaskHandler,
}
