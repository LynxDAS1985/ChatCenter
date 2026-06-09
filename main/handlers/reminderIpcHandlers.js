// v1.0.0 (Phase 4.2): IPC handlers + scheduler для Reminders.
//
// Persistent в `userData/reminders.json`. Scheduler через setTimeout —
// при app start все pending reminders перезаписываются.
// При наступлении remindAt — повторное уведомление через main → mainWindow.

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

let _deps = null
let _cache = null
const _timers = new Map()  // reminderId → setTimeout handle

function getRemindersFile() {
  if (!_deps?.userDataPath) throw new Error('reminders: userDataPath not set')
  return path.join(_deps.userDataPath, 'reminders.json')
}

function loadReminders() {
  if (_cache) return _cache
  try {
    const file = getRemindersFile()
    if (!fs.existsSync(file)) { _cache = []; return _cache }
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    _cache = Array.isArray(parsed) ? parsed : []
  } catch (_) { _cache = [] }
  return _cache
}

function saveReminders() {
  try {
    const file = getRemindersFile()
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(_cache || [], null, 2), 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch (_) { return false }
}

function fireReminder(reminder) {
  // При наступлении напоминания: статус → fired, отправить событие в mainWindow
  loadReminders()
  const idx = _cache.findIndex(r => r.id === reminder.id)
  if (idx >= 0) {
    _cache[idx] = { ..._cache[idx], status: 'fired', firedAt: Date.now() }
    saveReminders()
  }
  const win = _deps?.getMainWindow?.()
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('reminders:fired', {
        reminder,
      })
    } catch (_) {}
  }
  _timers.delete(reminder.id)
}

function scheduleTimer(reminder) {
  if (!reminder || reminder.status !== 'pending') return
  const now = Date.now()
  const delay = Math.max(0, (reminder.remindAt || 0) - now)
  if (delay > 2147483647) return  // setTimeout max ~24.8 days
  if (_timers.has(reminder.id)) {
    try { clearTimeout(_timers.get(reminder.id)) } catch (_) {}
  }
  const handle = setTimeout(() => fireReminder(reminder), delay)
  _timers.set(reminder.id, handle)
}

function cancelTimer(reminderId) {
  const h = _timers.get(reminderId)
  if (h) { try { clearTimeout(h) } catch (_) {}; _timers.delete(reminderId) }
}

export function initReminderIpcHandlers(deps) {
  _deps = deps
  _cache = null

  // При старте — восстановить все pending reminders
  const all = loadReminders()
  for (const r of all) {
    if (r.status === 'pending') scheduleTimer(r)
  }

  ipcMain.handle('reminders:schedule', async (_event, reminder) => {
    if (!reminder || !reminder.id) return { ok: false, error: 'invalid_reminder' }
    loadReminders()
    _cache.push(reminder)
    saveReminders()
    scheduleTimer(reminder)
    return { ok: true, reminder }
  })

  ipcMain.handle('reminders:list', async (_event, filter = {}) => {
    const all = loadReminders()
    const filtered = filter?.status
      ? all.filter(r => r.status === filter.status)
      : all
    const sorted = [...filtered].sort((a, b) => (a.remindAt || 0) - (b.remindAt || 0))
    return { ok: true, reminders: sorted, total: sorted.length }
  })

  ipcMain.handle('reminders:cancel', async (_event, { reminderId } = {}) => {
    if (!reminderId) return { ok: false, error: 'missing_reminderId' }
    loadReminders()
    const idx = _cache.findIndex(r => r.id === reminderId)
    if (idx < 0) return { ok: false, error: 'reminder_not_found' }
    _cache[idx] = { ..._cache[idx], status: 'cancelled' }
    saveReminders()
    cancelTimer(reminderId)
    return { ok: true }
  })
}

export function _shutdownReminders() {
  for (const h of _timers.values()) {
    try { clearTimeout(h) } catch (_) {}
  }
  _timers.clear()
}

export const _internal = { loadReminders, saveReminders, scheduleTimer, cancelTimer, _timers }
