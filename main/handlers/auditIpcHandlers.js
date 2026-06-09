// v0.98.0 (Phase 2 M2.4 main-side): IPC handlers для Audit Log.
//
// JSONL файл — append-only лог в `app.getPath('userData')/audit-log/YYYY-MM.jsonl`.
// Ротация по месяцам. Cleanup старых файлов через clearOldAudit.
//
// Каналы:
//   - audit:log              (handle) — append запись
//   - audit:list             (handle) — список с фильтром
//   - audit:clear            (handle) — удалить файлы старше N дней
//   - audit:recent-revertable (handle) — последние N revertable действий
//   - audit:undo             (handle) — попытаться откатить запись по id

import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

let _deps = null

function getAuditDir() {
  if (!_deps?.userDataPath) throw new Error('audit: userDataPath not set')
  const dir = path.join(_deps.userDataPath, 'audit-log')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getMonthFile(timestamp) {
  const d = new Date(timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return path.join(getAuditDir(), `${y}-${m}.jsonl`)
}

function appendRecord(record) {
  const file = getMonthFile(record.timestamp || Date.now())
  fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8')
}

function readAllRecords() {
  const dir = getAuditDir()
  let files = []
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort() } catch (_) { return [] }
  const records = []
  for (const f of files) {
    try {
      const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try { records.push(JSON.parse(line)) } catch (_) { /* skip corrupt */ }
      }
    } catch (_) { /* skip */ }
  }
  // Sort by timestamp desc (newest first)
  return records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
}

function applyFilter(records, filter) {
  if (!filter || typeof filter !== 'object') return records
  return records.filter(r => {
    if (filter.actionId && r.actionId !== filter.actionId) return false
    if (filter.actor && r.actor !== filter.actor) return false
    if (filter.fromTs && r.timestamp < filter.fromTs) return false
    if (filter.toTs && r.timestamp > filter.toTs) return false
    return true
  })
}

export function initAuditIpcHandlers(deps) {
  _deps = deps

  ipcMain.handle('audit:log', async (_event, record) => {
    if (!record || typeof record !== 'object') return { ok: false, error: 'invalid_record' }
    try {
      appendRecord(record)
      return { ok: true, id: record.id }
    } catch (e) {
      return { ok: false, error: e?.message || 'append_failed' }
    }
  })

  ipcMain.handle('audit:list', async (_event, { filter, limit } = {}) => {
    try {
      const all = readAllRecords()
      const filtered = applyFilter(all, filter)
      const sliced = typeof limit === 'number' ? filtered.slice(0, limit) : filtered
      return { ok: true, records: sliced, total: filtered.length }
    } catch (e) {
      return { ok: false, error: e?.message, records: [] }
    }
  })

  ipcMain.handle('audit:clear', async (_event, { olderThanDays } = {}) => {
    try {
      const days = typeof olderThanDays === 'number' ? olderThanDays : 30
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      const dir = getAuditDir()
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))
      let removedFiles = 0
      for (const f of files) {
        const fullPath = path.join(dir, f)
        try {
          const stat = fs.statSync(fullPath)
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(fullPath)
            removedFiles++
          }
        } catch (_) { /* skip */ }
      }
      return { ok: true, removedFiles }
    } catch (e) {
      return { ok: false, error: e?.message }
    }
  })

  ipcMain.handle('audit:recent-revertable', async (_event, { count } = {}) => {
    try {
      const n = typeof count === 'number' ? count : 5
      const all = readAllRecords()
      const revertable = all.filter(r =>
        r.revertable === true
        && r.executionResult === 'ok'
        && !r.reverted
      ).slice(0, n)
      return { ok: true, records: revertable }
    } catch (e) {
      return { ok: false, error: e?.message, records: [] }
    }
  })

  // audit:undo — пометить запись как reverted (фактический revert делает caller через
  // dispatch обратного action, например markAsUnread для markAsRead).
  ipcMain.handle('audit:mark-reverted', async (_event, { recordId } = {}) => {
    if (!recordId) return { ok: false, error: 'missing_recordId' }
    try {
      // Простая реализация — добавляем new запись «revert of recordId»
      const revertRecord = {
        id: `audit_revert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        actor: 'user',
        actionId: 'revert',
        revertOf: recordId,
      }
      appendRecord(revertRecord)
      return { ok: true, revertId: revertRecord.id }
    } catch (e) {
      return { ok: false, error: e?.message }
    }
  })
}

export const _internal = { getMonthFile, getAuditDir }
