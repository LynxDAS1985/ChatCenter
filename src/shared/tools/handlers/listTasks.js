// v1.0.0 (Phase 4.1): handler для list_tasks tool.
//
// Permission: auto (read-only).

export async function listTasksHandler(_source, args, context) {
  if (typeof context?.listTasks !== 'function') {
    return { ok: false, error: 'no_listTasks_in_context' }
  }
  try {
    const filter = args || {}
    const result = await context.listTasks(filter)
    if (!result || !result.ok) {
      return { ok: false, error: result?.error || 'listTasks_failed' }
    }
    const tasks = (result.tasks || []).slice(0, 50).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      dueAt: t.dueAt,
      chatId: t.source?.chatId || null,
    }))
    return {
      ok: true,
      result: {
        count: tasks.length,
        tasks,
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'listTasks_threw' }
  }
}

export const listTasksTool = {
  id: 'list_tasks',
  permission: 'auto',
  category: 'tasks',
  revertable: false,
  description: 'Получить список задач (опционально с фильтром)',
  schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      chatId: { type: 'string' },
    },
  },
  handler: listTasksHandler,
}
