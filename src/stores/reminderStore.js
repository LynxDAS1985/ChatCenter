// v1.0.0 (Phase 4.2): Reminder store — renderer side.
//
// Напоминания: при наступлении remindAt — повторное уведомление с тем же source.
// Persistent в `userData/reminders.json`. Scheduler в main process (setTimeout).

const NOTE_MAX = 500

function generateId() {
  return `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createReminderRecord(params) {
  const p = params || {}
  const now = Date.now()
  let remindAt = p.remindAt
  if (typeof remindAt === 'string') remindAt = new Date(remindAt).getTime()
  if (typeof remindAt !== 'number' || !Number.isFinite(remindAt)) {
    throw new Error('createReminderRecord: invalid remindAt')
  }
  return {
    id: p.id || generateId(),
    source: p.source || null,
    remindAt,
    note: (p.note || '').slice(0, NOTE_MAX),
    status: ['pending', 'fired', 'cancelled'].includes(p.status) ? p.status : 'pending',
    createdAt: p.createdAt || now,
    firedAt: p.firedAt || null,
    createdBy: p.createdBy === 'ai' ? 'ai' : 'user',
  }
}

export async function scheduleReminder(params) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    const reminder = createReminderRecord(params)
    return await globalThis.window.api.invoke('reminders:schedule', reminder)
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export async function listReminders(filter = {}) {
  if (!globalThis.window?.api?.invoke) return { ok: false, reminders: [] }
  try {
    return await globalThis.window.api.invoke('reminders:list', filter)
  } catch (e) {
    return { ok: false, error: e?.message, reminders: [] }
  }
}

export async function cancelReminder(reminderId) {
  if (!globalThis.window?.api?.invoke) return { ok: false, error: 'no_ipc' }
  try {
    return await globalThis.window.api.invoke('reminders:cancel', { reminderId })
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

export const _internal = { NOTE_MAX, generateId }
