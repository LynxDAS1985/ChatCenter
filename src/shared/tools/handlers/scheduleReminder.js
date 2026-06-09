// v1.0.0 (Phase 4.2): handler для schedule_reminder tool.

export async function scheduleReminderHandler(source, args, context) {
  if (!source) return { ok: false, error: 'invalid_source' }
  if (!args || !args.remindAt) return { ok: false, error: 'missing_remindAt' }
  if (typeof context?.scheduleReminder !== 'function') {
    return { ok: false, error: 'no_scheduleReminder_in_context' }
  }
  let remindAt = args.remindAt
  if (typeof remindAt === 'string') remindAt = new Date(remindAt).getTime()
  if (typeof remindAt !== 'number' || !Number.isFinite(remindAt)) {
    return { ok: false, error: 'invalid_remindAt' }
  }
  if (remindAt <= Date.now()) {
    return { ok: false, error: 'remindAt_in_past' }
  }
  try {
    const result = await context.scheduleReminder({
      source,
      remindAt,
      note: args.note || '',
      createdBy: 'ai',
    })
    if (!result || !result.ok) {
      return { ok: false, error: result?.error || 'scheduleReminder_failed' }
    }
    return {
      ok: true,
      result: {
        reminderId: result.reminder?.id,
        remindAt,
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export const scheduleReminderTool = {
  id: 'schedule_reminder',
  permission: 'confirm',
  category: 'system',
  revertable: true,
  description: 'Запланировать повторное уведомление на указанное время',
  schema: {
    type: 'object',
    required: ['source', 'remindAt'],
    properties: {
      source: { type: 'object' },
      remindAt: { type: 'string', description: 'ISO 8601 datetime когда напомнить' },
      note: { type: 'string', maxLength: 500 },
    },
  },
  handler: scheduleReminderHandler,
}
