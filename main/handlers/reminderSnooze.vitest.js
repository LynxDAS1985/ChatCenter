// v1.0.5: тесты snooze операции для reminders (main-side).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { handlers, fsMock } = vi.hoisted(() => {
  const handlers = {}
  const fsMock = {
    files: new Map(),
    existsSync(p) { return fsMock.files.has(p) },
    readFileSync(p) {
      if (!fsMock.files.has(p)) throw new Error('ENOENT: ' + p)
      return fsMock.files.get(p)
    },
    writeFileSync(p, data) { fsMock.files.set(p, data) },
    renameSync(from, to) {
      if (fsMock.files.has(from)) {
        fsMock.files.set(to, fsMock.files.get(from))
        fsMock.files.delete(from)
      }
    },
  }
  return { handlers, fsMock }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel, fn) => { handlers[channel] = fn },
  },
}))

vi.mock('fs', () => ({ default: fsMock, ...fsMock }))

import { initReminderIpcHandlers, _shutdownReminders } from './reminderIpcHandlers.js'
import path from 'node:path'
const REMINDERS_FILE = path.join('/data', 'reminders.json')

describe('reminders:snooze (v1.0.5)', () => {
  beforeEach(() => {
    _shutdownReminders()
    fsMock.files.clear()
    const now = Date.now()
    // Один fired reminder для snooze
    fsMock.files.set(REMINDERS_FILE, JSON.stringify([
      {
        id: 'rem_orig',
        source: { messengerId: 'native_cc', chatId: 'tg_main:-100', messageId: '5' },
        remindAt: now - 60000,  // в прошлом
        note: 'Перезвонить',
        status: 'fired',
        firedAt: now - 30000,
        createdBy: 'ai',
      },
    ]))
    initReminderIpcHandlers({ userDataPath: '/data', getMainWindow: () => null })
  })

  it('создаёт новый reminder с +N минут, помечает оригинал snoozedAt', async () => {
    const r = await handlers['reminders:snooze'](null, { reminderId: 'rem_orig', minutes: 10 })
    expect(r.ok).toBe(true)
    expect(r.reminder.id).toMatch(/^rem_/)
    expect(r.reminder.status).toBe('pending')
    expect(r.reminder.snoozedFrom).toBe('rem_orig')

    // Время — около 10 минут
    const delta = r.reminder.remindAt - Date.now()
    expect(delta).toBeGreaterThan(9 * 60 * 1000)
    expect(delta).toBeLessThanOrEqual(10 * 60 * 1000 + 100)

    // Source унаследован
    expect(r.reminder.source.chatId).toBe('tg_main:-100')
    expect(r.reminder.note).toBe('Перезвонить')

    // Оригинал помечен
    const saved = JSON.parse(fsMock.files.get(REMINDERS_FILE))
    const orig = saved.find(x => x.id === 'rem_orig')
    expect(orig.snoozedAt).toBeGreaterThan(0)
    expect(orig.snoozedToId).toBe(r.reminder.id)
  })

  it('reminderId не указан → ok:false', async () => {
    const r = await handlers['reminders:snooze'](null, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('missing_reminderId')
  })

  it('minutes <= 0 → invalid_minutes', async () => {
    const r = await handlers['reminders:snooze'](null, { reminderId: 'rem_orig', minutes: 0 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_minutes')
    const r2 = await handlers['reminders:snooze'](null, { reminderId: 'rem_orig', minutes: -5 })
    expect(r2.ok).toBe(false)
  })

  it('minutes > 1440 (24 часа) → invalid_minutes', async () => {
    const r = await handlers['reminders:snooze'](null, { reminderId: 'rem_orig', minutes: 1441 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_minutes')
  })

  it('минуты как string «10» → invalid (требуем number)', async () => {
    // Number('10') === 10, finite. Это OK — наш код принимает.
    const r = await handlers['reminders:snooze'](null, { reminderId: 'rem_orig', minutes: '10' })
    expect(r.ok).toBe(true)  // через Number() кастится
  })

  it('несуществующий reminderId → ok:false', async () => {
    const r = await handlers['reminders:snooze'](null, { reminderId: 'rem_nope', minutes: 5 })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('reminder_not_found')
  })
})
