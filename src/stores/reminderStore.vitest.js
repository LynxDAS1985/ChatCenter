// v1.0.0 (Phase 4.2): тесты reminderStore.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createReminderRecord, scheduleReminder, listReminders, cancelReminder, snoozeReminder } from './reminderStore.js'

describe('createReminderRecord', () => {
  it('создаёт reminder с обязательными полями', () => {
    const r = createReminderRecord({ remindAt: 1717843080000, note: 'Перезвонить' })
    expect(r.id).toMatch(/^rem_/)
    expect(r.remindAt).toBe(1717843080000)
    expect(r.note).toBe('Перезвонить')
    expect(r.status).toBe('pending')
    expect(r.createdBy).toBe('user')
  })

  it('обрезает длинный note', () => {
    const longNote = 'A'.repeat(1000)
    const r = createReminderRecord({ remindAt: Date.now() + 1000, note: longNote })
    expect(r.note.length).toBe(500)
  })

  it('remindAt как string ISO → конвертация в number', () => {
    const iso = '2026-12-31T10:00:00.000Z'
    const r = createReminderRecord({ remindAt: iso })
    expect(typeof r.remindAt).toBe('number')
    expect(r.remindAt).toBe(new Date(iso).getTime())
  })

  it('invalid remindAt → throw', () => {
    expect(() => createReminderRecord({ remindAt: 'not a date' })).toThrow(/invalid remindAt/)
    expect(() => createReminderRecord({})).toThrow(/invalid remindAt/)
  })

  it('createdBy ai → ai', () => {
    const r = createReminderRecord({ remindAt: Date.now() + 100, createdBy: 'ai' })
    expect(r.createdBy).toBe('ai')
  })
})

describe('IPC functions', () => {
  let invokeMock
  beforeEach(() => {
    invokeMock = vi.fn(() => Promise.resolve({ ok: true }))
    globalThis.window = { api: { invoke: invokeMock } }
  })
  afterEach(() => { delete globalThis.window })

  it('scheduleReminder invokes reminders:schedule', async () => {
    await scheduleReminder({ remindAt: Date.now() + 1000 })
    expect(invokeMock).toHaveBeenCalledWith('reminders:schedule', expect.objectContaining({
      status: 'pending',
    }))
  })

  it('scheduleReminder с invalid → ok:false', async () => {
    const r = await scheduleReminder({ remindAt: 'bad' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid remindAt/)
  })

  it('listReminders invokes reminders:list', async () => {
    await listReminders({ status: 'pending' })
    expect(invokeMock).toHaveBeenCalledWith('reminders:list', { status: 'pending' })
  })

  it('cancelReminder invokes reminders:cancel', async () => {
    await cancelReminder('rem_123')
    expect(invokeMock).toHaveBeenCalledWith('reminders:cancel', { reminderId: 'rem_123' })
  })

  // v1.0.5: snooze.
  it('snoozeReminder invokes reminders:snooze с reminderId+minutes', async () => {
    invokeMock.mockResolvedValueOnce({ ok: true, reminder: { id: 'rem_new' } })
    const r = await snoozeReminder('rem_old', 10)
    expect(invokeMock).toHaveBeenCalledWith('reminders:snooze', { reminderId: 'rem_old', minutes: 10 })
    expect(r.ok).toBe(true)
    expect(r.reminder.id).toBe('rem_new')
  })

  it('snoozeReminder без window.api → ok:false', async () => {
    delete globalThis.window.api
    const r = await snoozeReminder('rem_x', 5)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_ipc')
  })

  it('snoozeReminder IPC throw → ok:false', async () => {
    invokeMock.mockRejectedValueOnce(new Error('boom'))
    const r = await snoozeReminder('rem_x', 5)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })
})
